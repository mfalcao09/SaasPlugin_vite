// meta-whatsapp-webhook
// Receiver público da Meta Cloud API.
// GET: handshake (?hub.mode=subscribe + verify_token).
// POST: eventos (mensagens, status). Valida X-Hub-Signature-256.
// verify_jwt = false (público — segurança via verify_token + HMAC).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { normalizePhoneBR } from '../_shared/phone.ts';
import { isOptOutMessage, markLeadOptOut } from '../_shared/optin-guard.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ── DE ONDE VEM O APP SECRET — os dois caminhos usam FONTES DIFERENTES ──────
 *
 *  Este é o contrato que faltava estar escrito em algum lugar, e cuja ausência
 *  criou um defeito de COSTURA (achado da controladora lendo os dois fontes no
 *  ar, não um deles):
 *
 *    MANUAL (meta-whatsapp-connect / wizard)  → app é DO CLIENTE.
 *        Cada conexão tem app_secret próprio, cifrado em app_secret_encrypted.
 *
 *    SELF-SERVICE (whatsapp-embedded-signup-exchange / Embedded Signup)
 *        → app é NOSSO (1289456453376034). Existe UM secret, em env do
 *        servidor, e a coluna fica NULL DE PROPÓSITO — cifrar por conexão
 *        replicaria N vezes o mesmo segredo, aumentando superfície sem ganho.
 *
 *  O DEFEITO: `decryptSecret('')` NÃO lança — devolve '' (meta-crypto.ts:42).
 *  Então uma conexão do self-service produzia HMAC com CHAVE VAZIA, nunca
 *  batia, e o webhook respondia 403 a TODO inbound. A Meta reentrega, leva 403
 *  de novo, para sempre. Falha 100% fechada, com cara de "o webhook não está
 *  recebendo nada" — ninguém investigaria HMAC, culpariam a Meta ou o número.
 *
 *  Nenhum dos dois lados estava errado sozinho: o defeito morava no contrato.
 *
 *  ⚠️ NUNCA transformar "sem secret" em "não verifica". Isso reabriria pela
 *  porta dos fundos o P0 fechado hoje, com aparência de tratar caso legítimo.
 *  Ausência de secret NEGA — igual à ausência de header.
 *
 *  POR QUE `app_secret_source` E NÃO `app_secret_encrypted IS NULL`:
 *  a primeira versão desta função decidia pela ausência da coluna. Funcionava,
 *  mas punha a AUSÊNCIA DE DADO carregando semântica — o mesmo padrão que
 *  produziu o defeito acima. Modo de falha nomeado pela Trilha S: uma conexão
 *  MANUAL que perdesse o secret (bug, migração parcial) seria validada com o
 *  segredo DA PLATAFORMA contra um app DO CLIENTE; o HMAC falharia e quem
 *  depurasse procuraria no lugar errado, porque o código *parece* ter tratado
 *  o caso. Agora a fonte é declarada na linha, e NULL volta a significar só
 *  "não tem" — que nega. */
async function resolveAppSecret(conn: {
  app_secret_encrypted?: string | null;
  app_secret_source?: string | null;
}): Promise<string> {
  // 'connection' é o default da coluna: sem declaração, procura NA CONEXÃO —
  // e se não houver, devolve '' e o chamador nega. Fail-closed.
  if (conn.app_secret_source === 'platform') {
    return Deno.env.get('META_WHATSAPP_APP_SECRET') ?? '';  // app NOSSO (Embedded Signup)
  }
  return conn.app_secret_encrypted
    ? await decryptSecret(conn.app_secret_encrypted)        // app DO CLIENTE (wizard)
    : '';
}

function extractConnectionIdFromPath(url: URL): string | null {
  // Aceita /functions/v1/meta-whatsapp-webhook/{uuid}
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return UUID_RE.test(last) ? last : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const pathConnectionId = extractConnectionIdFromPath(url);

  // -------- GET handshake --------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode !== 'subscribe' || !token || !challenge) {
      return new Response('bad request', { status: 400 });
    }
    const sb = supa();
    // Resolve por path id (preferido) ou pelo próprio token (retrocompat).
    let connRow: { id: string; webhook_verify_token: string } | null = null;
    if (pathConnectionId) {
      const { data } = await sb
        .from('whatsapp_meta_connections')
        .select('id, webhook_verify_token')
        .eq('id', pathConnectionId)
        .maybeSingle();
      connRow = data ?? null;
    } else {
      const { data } = await sb
        .from('whatsapp_meta_connections')
        .select('id, webhook_verify_token')
        .eq('webhook_verify_token', token)
        .limit(1)
        .maybeSingle();
      connRow = data ?? null;
    }
    if (!connRow || connRow.webhook_verify_token !== token) {
      console.log('[verify] reject', { has_path_id: !!pathConnectionId });
      return new Response('forbidden', { status: 403 });
    }
    // Marca que a Meta validou o webhook desta conexão.
    await sb
      .from('whatsapp_meta_connections')
      .update({ webhook_subscribed_at: new Date().toISOString() })
      .eq('id', connRow.id);
    console.log('[verify] ok', { connection_id: connRow.id });
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response('invalid json', { status: 400 }); }

  const sb = supa();

  // Quando a URL carrega o connection_id, resolve uma vez e usa o mesmo
  // App Secret para validar a assinatura de TODO o payload (preferido).
  let pinnedConn: any = null;
  if (pathConnectionId) {
    const { data } = await sb
      .from('whatsapp_meta_connections')
      .select('id, organization_id, app_secret_encrypted, app_secret_source, access_token_encrypted')
      .eq('id', pathConnectionId)
      .maybeSingle();
    pinnedConn = data ?? null;
    if (!pinnedConn) return new Response('forbidden', { status: 403 });

    // Valida HMAC ANTES de processar (assinatura cobre o body inteiro).
    const sig = req.headers.get('x-hub-signature-256') ?? '';
    if (!sig.startsWith('sha256=')) return new Response('forbidden', { status: 403 });
    try {
      const appSecret = await resolveAppSecret(pinnedConn);
      if (!appSecret) {
        // Fail-closed: sem segredo não há como verificar, e não verificar seria
        // o P0 de volta. Ver resolveAppSecret.
        await sb.from('whatsapp_meta_webhook_logs').insert({
          connection_id: pinnedConn.id,
          organization_id: pinnedConn.organization_id,
          event_type: 'invalid_signature',
          payload,
          processed: false,
          error: 'app secret indisponivel (nem na conexao nem em META_WHATSAPP_APP_SECRET)',
        });
        return new Response('forbidden', { status: 403 });
      }
      const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
      if (!timingSafeEqual(sig, expected)) {
        await sb.from('whatsapp_meta_webhook_logs').insert({
          connection_id: pinnedConn.id,
          organization_id: pinnedConn.organization_id,
          event_type: 'invalid_signature',
          payload,
          processed: false,
          error: 'HMAC mismatch',
        });
        return new Response('forbidden', { status: 403 });
      }
    } catch (e) {
      console.error('signature check failed (pinned)', e);
      return new Response('forbidden', { status: 403 });
    }
  }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id;

      // Resolve conexão: pinned (path) tem prioridade; fallback por phone_number_id.
      let conn: any = pinnedConn;
      if (!conn) {
        if (!phoneNumberId) continue;
        const { data } = await sb
          .from('whatsapp_meta_connections')
          .select('id, organization_id, app_secret_encrypted, app_secret_source, access_token_encrypted')
          .eq('phone_number_id', phoneNumberId)
          .limit(1)
          .maybeSingle();
        conn = data ?? null;
      }
      if (!conn) {
        await sb.from('whatsapp_meta_webhook_logs').insert({
          event_type: 'unknown_phone_id',
          payload,
          processed: false,
          error: `phone_number_id ${phoneNumberId ?? '-'} not registered`,
        });
        continue;
      }


      // Valida assinatura HMAC (só no caminho fallback — o pinned já validou em :103-121).
      //
      // 🔴 P0 CORRIGIDO — achado da controladora na fiscalização do Bloco 1.
      // Esta versão veio do Vendus com DOIS bypasses independentes, e o porte 1:1
      // os trouxe junto:
      //
      //   1. `if (sig.startsWith('sha256='))` — OMITIR o header pulava o bloco
      //      inteiro e a execução seguia para handleInboundMessage como se a
      //      mensagem fosse legítima. Header ausente = nenhuma verificação.
      //   2. `catch { console.error }` SEM return — qualquer erro em
      //      decryptSecret/HMAC era engolido e a execução SEGUIA.
      //
      // Com verify_jwt=false (config.toml), esta função é alcançável da internet
      // sem credencial: quem soubesse um phone_number_id (não é segredo) POSTava
      // payload forjado SEM header e injetava mensagem na conversa do salão —
      // que despacha o cérebro e responde para número arbitrário.
      //
      // A prova de que era descuido e não decisão: 50 linhas acima, no caminho
      // pinned, o MESMO arquivo faz o oposto — `if (!sig.startsWith(...)) return 403`
      // (:103) e um catch que RETORNA 403 (:120). Espelhado aqui:
      // ausência nega, erro nega.
      if (!pinnedConn) {
        const sig = req.headers.get('x-hub-signature-256') ?? '';
        if (!sig.startsWith('sha256=')) {
          await sb.from('whatsapp_meta_webhook_logs').insert({
            connection_id: conn.id,
            organization_id: conn.organization_id,
            event_type: 'invalid_signature',
            payload,
            processed: false,
            error: 'x-hub-signature-256 ausente ou malformado',
          });
          return new Response('forbidden', { status: 403 });
        }
        try {
          const appSecret = await resolveAppSecret(conn);
          if (!appSecret) {
            // Fail-closed — mesma razão do caminho pinned. Ver resolveAppSecret.
            await sb.from('whatsapp_meta_webhook_logs').insert({
              connection_id: conn.id,
              organization_id: conn.organization_id,
              event_type: 'invalid_signature',
              payload,
              processed: false,
              error: 'app secret indisponivel (nem na conexao nem em META_WHATSAPP_APP_SECRET)',
            });
            return new Response('forbidden', { status: 403 });
          }
          const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
          if (!timingSafeEqual(sig, expected)) {
            await sb.from('whatsapp_meta_webhook_logs').insert({
              connection_id: conn.id,
              organization_id: conn.organization_id,
              event_type: 'invalid_signature',
              payload,
              processed: false,
              error: 'HMAC mismatch',
            });
            return new Response('forbidden', { status: 403 });
          }
        } catch (e) {
          // NÃO engolir: falha ao VERIFICAR assinatura é falha de verificação.
          console.error('signature check failed (fallback)', e);
          return new Response('forbidden', { status: 403 });
        }
      }


      // mensagens recebidas
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        try {
          await handleInboundMessage(sb, conn, msg, contacts);
        } catch (e) {
          console.error('inbound error', e);
          await sb.from('whatsapp_meta_webhook_logs').insert({
            connection_id: conn.id,
            organization_id: conn.organization_id,
            event_type: 'inbound_error',
            payload: msg,
            processed: false,
            error: String(e),
          });
        }
      }

      // status callbacks
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        try { await handleStatus(sb, st); } catch (e) { console.error('status error', e); }
      }

      // template status updates
      if (change?.field === 'message_template_status_update') {
        try {
          await sb.from('whatsapp_meta_templates')
            .update({ status: value?.event ?? 'PENDING', rejected_reason: value?.reason ?? null })
            .eq('connection_id', conn.id)
            .eq('meta_template_id', String(value?.message_template_id ?? ''));
        } catch (e) { console.error('tpl status error', e); }
      }
    }
  }

  // Sempre 200 — Meta reenvia se receber qualquer outro código
  return new Response('ok', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
});

async function handleInboundMessage(sb: any, conn: any, msg: any, contacts: any[]) {
  const fromRaw = String(msg.from ?? '');
  const fromNorm = normalizePhoneBR(fromRaw) ?? fromRaw;
  const metaMsgId = String(msg.id ?? '');
  const contactName = contacts?.[0]?.profile?.name ?? null;

  // 1) localizar conversa ATIVA desta caixa Meta específica
  //    - filtra por meta_connection_id para nunca invadir outra caixa (Evolution/IG/outra Meta)
  //    - ignora conversas encerradas: nova mensagem após "Resolvido" abre conversa nova
  const { data: existing } = await sb
    .from('webchat_conversations')
    .select('id, status, lead_id')
    .eq('organization_id', conn.organization_id)
    .eq('channel', 'whatsapp')
    .eq('meta_connection_id', conn.id)
    .eq('visitor_phone_normalized', fromNorm)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  let conversationId: string;
  if (existing && existing.length > 0) {
    conversationId = existing[0].id;
    await sb.from('webchat_conversations')
      .update({
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        ...(contactName ? { visitor_name: contactName } : {}),
      })
      .eq('id', conversationId);

  } else {
    // achar widget ativo da org (compat com webchat schema)
    const { data: widget } = await sb
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', conn.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { data: created, error: insErr } = await sb
      .from('webchat_conversations')
      .insert({
        organization_id: conn.organization_id,
        widget_id: widget?.id ?? null,
        channel: 'whatsapp',
        status: 'bot_active',
        visitor_id: crypto.randomUUID(),
        visitor_phone: fromNorm,
        visitor_name: contactName ?? fromNorm,
        meta_connection_id: conn.id,
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    conversationId = created.id;
  }

  // 2) extrair conteúdo
  const { content, contentType, metadata } = await extractContent(msg, conn);

  // 3) inserir mensagem (idempotente por meta_message_id)
  const { error: msgErr } = await sb.from('webchat_messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    sender_type: 'visitor',
    content,
    content_type: contentType,
    message_type: contentType,
    meta_message_id: metaMsgId,
    metadata,
  });
  if (msgErr && (msgErr as any).code !== '23505') throw msgErr;

  // 4) log
  await sb.from('whatsapp_meta_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: 'inbound:' + (msg.type ?? 'unknown'),
    payload: msg,
    processed: true,
  });

  // 4.1) Meta CTWA (Click-to-WhatsApp Ads): captura ctwa_clid + ad_id do referral
  //      Persiste na conversa/lead e publica evento na Jornada. Cron marketing-sync
  //      resolve depois qual anúncio ganhou o crédito.
  try {
    const ref = msg.referral;
    if (ref && (ref.ctwa_clid || ref.source_id)) {
      const ctwaClid: string | null = ref.ctwa_clid ?? null;
      const adExternalId: string | null = ref.source_id ?? null;

      // grava referral na metadata da conversa (para replay) — merge para não apagar campaign_id/pending_payment_data
      const { data: convMetaRow } = await sb
        .from('webchat_conversations')
        .select('metadata')
        .eq('id', conversationId)
        .maybeSingle();
      const existingMeta = ((convMetaRow as any)?.metadata ?? {}) as Record<string, unknown>;
      await sb.from('webchat_conversations')
        .update({
          metadata: { ...existingMeta, referral: ref, ctwa_clid: ctwaClid, ad_id: adExternalId },
        })
        .eq('id', conversationId);

      // se a conversa já está vinculada a um lead, persiste no lead
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id').eq('id', conversationId).maybeSingle();
      const leadId = (convRow as any)?.lead_id ?? null;
      if (leadId) {
        if (ctwaClid) await sb.from('leads').update({ ctwa_clid: ctwaClid }).eq('id', leadId).is('ctwa_clid', null);
        // tenta atribuir imediatamente (best-effort — pode ficar pendente até o marketing-sync rodar)
        try { await sb.rpc('resolve_click_attribution', { p_lead_id: leadId }); } catch (_) {}
      }

      // OMISSÃO DECLARADA DO PORTE (§14.3 — nomear, não simplificar em silêncio):
      // aqui o Vendus publicava um evento 'meta_ctwa_received' no journey-bus.
      // `_shared/journey-bus.ts` NÃO foi portado porque exigiria criar a tabela
      // `journey_events` org-scoped, que não existe no NexvyBeauty — só a gêmea
      // `platform_crm_journey_events` (product-scoped). Criar tabela sem nenhum
      // consumidor seria escopo novo disfarçado de porte.
      // Contagem exata da omissão: 1 import + 1 chamada, nesta função apenas.
      // A captura de CTWA acima (lead, conversa, resolve_click_attribution)
      // permanece INTACTA — só o evento de jornada deixou de ser publicado.
    }
  } catch (e) {
    console.warn('[meta-webhook] referral capture failed:', (e as Error).message);
  }


  // 4.5) Campaign button_actions: se for resposta a botão de template, aplica etiqueta/opt-out
  //      configurados na campanha de origem (resolvida via webchat_conversations.metadata.campaign_id).
  let optOutFromButton = false;
  try {
    const buttonPayload = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    const isButtonReply = !!buttonPayload || msg.type === 'button' || msg.type === 'interactive';
    if (isButtonReply && content) {
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id, metadata').eq('id', conversationId).maybeSingle();
      const campaignId = (convRow as any)?.metadata?.campaign_id ?? null;
      const leadId = (convRow as any)?.lead_id ?? null;
      if (campaignId) {
        const { data: campRow } = await sb
          .from('campaigns').select('meta_template_config').eq('id', campaignId).maybeSingle();
        const cfg = (campRow as any)?.meta_template_config ?? null;
        const actions = (cfg?.button_actions ?? {}) as Record<string, { tag_id?: string | null; opt_out?: boolean }>;
        // Matching: exato pelo texto do botão (case-insensitive) ou pelo payload
        const key = Object.keys(actions).find((k) =>
          k.toLowerCase() === String(content).trim().toLowerCase() ||
          (buttonPayload && k.toLowerCase() === String(buttonPayload).toLowerCase()),
        );
        const action = key ? actions[key] : null;
        if (action) {
          if (action.tag_id && leadId) {
            try {
              await sb.from('lead_tag_assignments').upsert(
                { lead_id: leadId, tag_id: action.tag_id, source: 'webhook' },
                { onConflict: 'lead_id,tag_id', ignoreDuplicates: true },
              );
            } catch (e) { console.error('[campaign button tag] insert error', e); }
          }
          if (action.opt_out && leadId) {
            await markLeadOptOut(sb, leadId, conn.organization_id);
            optOutFromButton = true;
          }
          await sb.from('whatsapp_meta_webhook_logs').insert({
            connection_id: conn.id,
            organization_id: conn.organization_id,
            event_type: 'campaign_button_action',
            payload: { lead_id: leadId, campaign_id: campaignId, button: content, applied: action },
            processed: true,
          });
        }
      }
    }
  } catch (e) { console.error('[campaign button action] error', e); }

  // 4.6) Opt-out detection (soft opt-in): se for botão "Sair da lista" ou texto equivalente,
  //      marca lead, cancela cadências/campanhas e envia confirmação. NÃO chama o bot.
  try {
    const buttonPayload = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    if (optOutFromButton || isOptOutMessage(content, buttonPayload)) {
      // resolve lead vinculado à conversa (se houver)
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id').eq('id', conversationId).maybeSingle();
      const leadId = (convRow as any)?.lead_id ?? null;
      if (leadId && !optOutFromButton) await markLeadOptOut(sb, leadId, conn.organization_id);

      // Confirmação ao usuário
      try {
        await sb.functions.invoke('meta-whatsapp-send', {
          body: {
            connection_id: conn.id,
            organization_id: conn.organization_id,
            conversation_id: conversationId,
            to: fromNorm,
            type: 'text',
            text: 'Você foi removido(a) da nossa lista. Não enviaremos mais mensagens automáticas. Se quiser voltar, é só responder por aqui.',
          },
        });
      } catch (e) { console.error('[opt-out confirmation] send error', e); }

      await sb.from('whatsapp_meta_webhook_logs').insert({
        connection_id: conn.id,
        organization_id: conn.organization_id,
        event_type: 'opt_out',
        payload: { lead_id: leadId, button: buttonPayload, text: content },
        processed: true,
      });
      return; // não dispara webchat-bot
    }
  } catch (e) { console.error('[opt-out detection] error', e); }

  // 5) disparar webchat-bot e despachar resposta via meta-whatsapp-send
  try {

    // Para áudio, usamos a transcrição (Whisper) como mensagem para o bot
    // para que a IA realmente "ouça" o que foi dito.
    const transcription = (metadata as any)?.transcription as string | undefined;
    const botMessage = transcription && transcription.trim().length > 0
      ? transcription
      : (content && content.trim().length > 0 ? content : `[${contentType || 'mensagem'}]`);

    // Detecta clique em botão de continuidade de template (campanha HSM).
    // O LLM recebe só o texto do botão e tende a escalar para humano por achar
    // a mensagem ambígua. Sinalizamos como abertura de conversa.
    const buttonPayloadHint = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    const isBtnReply = !!buttonPayloadHint || msg.type === 'button' || msg.type === 'interactive';
    const continuationButtons = ['continuar conversa', 'quero saber mais', 'tenho interesse', 'me conta mais', 'continuar', 'saber mais'];
    const isContinuationButton = isBtnReply && continuationButtons.includes(String(botMessage || '').trim().toLowerCase());

    const { data: botRes } = await sb.functions.invoke('webchat-bot', {
      body: {
        conversation_id: conversationId,
        message: botMessage,
        visitor_name: contactName ?? fromNorm,
        channel: 'whatsapp',
        trigger: 'inbound_whatsapp_meta',
        button_context: isContinuationButton ? 'campaign_continuation' : undefined,
      },
    });
    const chunks: string[] = Array.isArray((botRes as any)?.chunks)
      ? (botRes as any).chunks
      : ((botRes as any)?.response ? [(botRes as any).response] : []);
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== 'string') continue;
      try {
        await sb.functions.invoke('meta-whatsapp-send', {
          body: {
            connection_id: conn.id,
            organization_id: conn.organization_id,
            conversation_id: conversationId,
            to: fromNorm,
            type: 'text',
            text: chunk,
          },
        });
      } catch (sendErr) {
        console.error('meta-whatsapp-send error', sendErr);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) {
    console.error('webchat-bot invoke error', e);
  }
}

async function extractContent(msg: any, conn: any): Promise<{ content: string; contentType: string; metadata: Record<string, any> }> {
  const type = msg.type ?? 'text';
  const baseMeta: Record<string, any> = { meta_type: type };

  if (type === 'text') return { content: msg.text?.body ?? '', contentType: 'text', metadata: baseMeta };
  if (type === 'button') return { content: msg.button?.text ?? '', contentType: 'text', metadata: { ...baseMeta, payload: msg.button?.payload } };
  if (type === 'interactive') {
    const i = msg.interactive ?? {};
    const txt = i.button_reply?.title ?? i.list_reply?.title ?? i.nfm_reply?.response_json ?? '';
    return { content: String(txt), contentType: 'text', metadata: { ...baseMeta, interactive: i } };
  }
  if (type === 'location') {
    const l = msg.location ?? {};
    return { content: `📍 ${l.name ?? ''} ${l.address ?? ''}`.trim() || `${l.latitude},${l.longitude}`, contentType: 'text', metadata: { ...baseMeta, location: l } };
  }
  if (type === 'contacts') {
    const raw = Array.isArray(msg.contacts) ? msg.contacts : [];
    const norm = raw.map((c: any) => {
      const name = c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(' ') || 'Contato';
      const phoneObj = Array.isArray(c?.phones) ? c.phones[0] : null;
      let phone = (phoneObj?.wa_id || phoneObj?.phone || '').replace(/[^\d+]/g, '');
      if (phone.startsWith('+')) phone = phone.slice(1);
      return { name, phone, raw_vcard: null };
    });
    return { content: '📇 Contato compartilhado', contentType: 'contact', metadata: { ...baseMeta, contacts: norm } };
  }
  if (type === 'reaction') {
    return { content: msg.reaction?.emoji ?? '', contentType: 'text', metadata: { ...baseMeta, reaction: msg.reaction } };
  }

  // mídia: image, audio, video, document, sticker, voice
  const mediaSpec = msg[type];
  if (mediaSpec?.id) {
    try {
      const accessToken = await decryptSecret(conn.access_token_encrypted);
      const downloaded = await downloadAndStoreMedia(conn, mediaSpec.id, mediaSpec.mime_type, accessToken);

      const isAudio = type === 'audio' || type === 'voice';
      const kind = type === 'image' ? 'image'
        : isAudio ? 'audio'
        : type === 'video' ? 'video'
        : type === 'sticker' ? 'sticker'
        : 'document';
      const ct = kind === 'image' ? 'image'
        : kind === 'audio' ? 'audio'
        : kind === 'video' ? 'video'
        : 'file';

      const labelByKind: Record<string, string> = {
        audio: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[documento]', sticker: '[figurinha]',
      };
      const caption = (mediaSpec.caption ?? '').toString().trim();
      const shortContent = caption || labelByKind[kind] || `[${type}]`;

      const meta: Record<string, any> = {
        ...baseMeta,
        media: {
          url: downloaded.url,
          kind,
          mime: downloaded.mime ?? mediaSpec.mime_type ?? null,
          storage_path: downloaded.path,
          caption: mediaSpec.caption ?? null,
          filename: mediaSpec.filename ?? null,
          size_bytes: downloaded.bytes?.byteLength ?? null,
        },
      };

      // Áudio/voz → Whisper. Imagem → Vision. Ambos via process-media-message
      // usando a chave OpenAI da empresa (passamos organization_id).
      if ((isAudio || kind === 'image') && downloaded.bytes) {
        try {
          const b64 = bytesToBase64(downloaded.bytes);
          const sb = supa();
          const mediaKind: 'audio' | 'image' = isAudio ? 'audio' : 'image';
          const { data: tRes } = await sb.functions.invoke('process-media-message', {
            body: {
              kind: mediaKind,
              base64: b64,
              mime: downloaded.mime ?? mediaSpec.mime_type ?? (isAudio ? 'audio/ogg' : 'image/jpeg'),
              caption: mediaSpec.caption ?? undefined,
              organization_id: conn.organization_id,
            },
          });
          const txt = (tRes as any)?.text ? String((tRes as any).text).trim() : '';
          if (txt) {
            if (mediaKind === 'audio') {
              meta.transcription = `🎙️ Áudio do cliente (transcrito): ${txt}`;
            } else {
              const cap = (mediaSpec.caption ?? '').toString().trim();
              meta.transcription = cap
                ? `🖼️ Imagem (legenda: "${cap}"): ${txt}`
                : `🖼️ Imagem do cliente: ${txt}`;
            }
          } else {
            meta.transcription = mediaKind === 'audio'
              ? '🎙️ [Áudio recebido — não consegui transcrever. Peça ao cliente para reenviar ou descrever em texto.]'
              : '🖼️ [Imagem recebida — não consegui analisar o conteúdo. Peça para reenviar ou descrever.]';
            console.warn(`[meta-whatsapp-webhook] media NOT processed (${mediaKind}); fallback placeholder`);
          }
        } catch (tErr) {
          console.warn('[meta-whatsapp-webhook] media processing failed:', (tErr as any)?.message ?? tErr);
          meta.transcription = isAudio
            ? '🎙️ [Áudio recebido — não consegui transcrever.]'
            : '🖼️ [Imagem recebida — não consegui analisar.]';
        }
      }

      return { content: shortContent, contentType: ct, metadata: meta };
    } catch (e) {
      console.error('media download error', e);
      return { content: `[${type}]`, contentType: 'text', metadata: { ...baseMeta, media: { id: mediaSpec.id, error: String(e) } } };
    }
  }

  return { content: `[${type}]`, contentType: 'text', metadata: baseMeta };
}

async function downloadAndStoreMedia(conn: any, mediaId: string, _mime: string, accessToken: string): Promise<{ url: string | null; path: string; mime: string; bytes: Uint8Array }> {
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());
  const url = meta?.url;
  if (!url) throw new Error('no media url');
  const bin = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const buf = new Uint8Array(await bin.arrayBuffer());
  const contentType = meta?.mime_type ?? bin.headers.get('content-type') ?? 'application/octet-stream';
  const ext = guessExt(contentType);
  const path = `${conn.organization_id}/${conn.id}/${mediaId}${ext}`;
  const sb = supa();
  const { error } = await sb.storage.from('whatsapp-meta-media').upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  const { data: signed } = await sb.storage.from('whatsapp-meta-media').createSignedUrl(path, 60 * 60 * 24 * 7);
  return { url: signed?.signedUrl ?? null, path, mime: contentType, bytes: buf };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

function guessExt(mime: string): string {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('pdf')) return '.pdf';
  return '';
}

async function handleStatus(sb: any, st: any) {
  const id = String(st.id ?? '');
  const status = String(st.status ?? '');
  if (!id || !status) return;

  // Resume erro do Meta (para sent/delivered/read normalmente vem vazio)
  const err0 = Array.isArray(st.errors) && st.errors.length ? st.errors[0] : null;
  const errSummary = err0
    ? `${err0.code ?? ''} ${err0.title ?? ''}${err0?.error_data?.details ? `: ${err0.error_data.details}` : ''}`.trim()
    : null;

  // Atualiza a mensagem e persiste o status bruto no metadata
  const { data: msgRow } = await sb
    .from('webchat_messages')
    .select('id, conversation_id, metadata')
    .eq('meta_message_id', id)
    .maybeSingle();

  if (msgRow) {
    const newMeta = { ...(msgRow.metadata ?? {}), meta_status: {
      status,
      timestamp: st.timestamp ?? null,
      recipient_id: st.recipient_id ?? null,
      ...(err0 ? { code: err0.code, title: err0.title, details: err0?.error_data?.details ?? null } : {}),
    } };
    await sb
      .from('webchat_messages')
      .update({ delivery_status: status, metadata: newMeta })
      .eq('id', msgRow.id);

    // Propaga falhas para campaign_targets (match por conversation_id nas últimas 24h)
    if ((status === 'failed' || status === 'undelivered') && msgRow.conversation_id) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      await sb
        .from('campaign_targets')
        .update({ status: 'failed', error: errSummary || `meta status: ${status}` })
        .eq('conversation_id', msgRow.conversation_id)
        .eq('status', 'sent')
        .gte('sent_at', since);
    }
  } else {
    // Fallback: pelo menos atualiza pelo wamid
    await sb.from('webchat_messages').update({ delivery_status: status }).eq('meta_message_id', id);
  }
}

