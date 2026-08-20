// platform-meta-whatsapp-webhook — receptor inbound da WhatsApp Cloud API
// (Meta) para o CRM de PLATAFORMA (número de VENDAS — funil autopilot, F1).
//
// Peça que faltava do porte Vendus: `platform-meta-whatsapp-connect` já emite
// webhook_url apontando para cá (`.../platform-meta-whatsapp-webhook/{connection_id}`)
// e o verify_token, mas o receptor não existia — mensagem recebida caía no
// vazio (bloqueador A1 da auditoria autopilot).
//
// Contratos:
//   * GET  → verificação do Meta Console (hub.challenge), por connection.
//   * POST → assinatura X-Hub-Signature-256 (HMAC do app_secret, timing-safe)
//     validada sobre o corpo CRU antes de qualquer processamento; inválida = 401.
//   * Idempotência por wamid: checagem + índice único parcial
//     uq_platform_crm_messages_wamid (re-entregas do Meta não duplicam).
//   * Persistência no padrão do webchat de plataforma: conversa
//     (channel='whatsapp', visitor_id='wa:<numero>') + lead (dedupe por
//     telefone) + mensagem inbound + broadcast realtime pro inbox.
//   * Meta exige resposta <5s e re-entrega em não-200: erro de processamento
//     loga e devolve 200 (retry não conserta bug e o wamid protege); só falha
//     de autenticação devolve 4xx.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/meta-graph.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';
import { type CtwaReferral, ctwaUtm, parseCtwaReferral } from '../_shared/ctwa-attribution.ts';
import {
  decideMetaWebhookRoute,
  lookupMetaWebhookConnections,
  scopeCollisionResponse,
} from '../_shared/meta-webhook-routing.ts';
import { resolveDeclaredAppSecret } from '../_shared/meta-app-secret.ts';

type Json = Record<string, unknown>;

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** `.../platform-meta-whatsapp-webhook/{connection_id}` → connection_id. */
function connectionIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last && last !== 'platform-meta-whatsapp-webhook' ? last : null;
}

/** Extrai texto exibível de qualquer tipo de mensagem da Cloud API. */
function extractContent(msg: Json): { content: string; contentType: string } {
  const type = String(msg['type'] ?? 'unknown');
  const pick = (o: unknown, k: string) =>
    (o && typeof o === 'object' ? (o as Json)[k] : undefined);

  switch (type) {
    case 'text':
      return { content: String(pick(msg['text'], 'body') ?? ''), contentType: 'text' };
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker': {
      const media = msg[type] as Json | undefined;
      const label = String(media?.['caption'] ?? media?.['filename'] ?? `[${type}]`);
      return { content: label, contentType: type };
    }
    case 'interactive': {
      const inter = msg['interactive'] as Json | undefined;
      const reply = (inter?.['button_reply'] ?? inter?.['list_reply']) as Json | undefined;
      return { content: String(reply?.['title'] ?? '[interativo]'), contentType: 'text' };
    }
    case 'button':
      return { content: String(pick(msg['button'], 'text') ?? '[botão]'), contentType: 'text' };
    case 'location': {
      const loc = msg['location'] as Json | undefined;
      return {
        content: `[localização] ${loc?.['latitude'] ?? '?'},${loc?.['longitude'] ?? '?'}`,
        contentType: 'location',
      };
    }
    case 'reaction':
      return { content: String(pick(msg['reaction'], 'emoji') ?? '[reação]'), contentType: 'reaction' };
    default:
      return { content: `[${type}]`, contentType: type };
  }
}

/**
 * Transcreve áudio inbound (Cloud API) para TEXTO — o que faltava para a Duda
 * "ouvir": até 2026-08-03 o webhook reduzia áudio ao rótulo '[audio]' e jogava
 * fora o media id; sem id não há download, sem download não há transcrição, e
 * o cérebro respondia "o áudio não tá chegando" com leads REAIS de anúncio
 * pago mandando voz.
 *
 * Cadeia: msg.audio.id → GET graph/<id> (token da conexão) → download do
 * binário → OpenAI Whisper → texto. FAIL-OPEN de propósito: qualquer falha
 * devolve null e a mensagem entra como '[audio]' — perder a transcrição é
 * aceitável, perder a MENSAGEM não. Cada falha loga a etapa que quebrou.
 */
async function transcribeInboundAudio(
  supabase: ReturnType<typeof getServiceClient>,
  msg: Json,
  connectionId: string,
): Promise<{ transcript: string | null; mediaId: string; mediaUrl: string | null } | null> {
  try {
    const mediaId = String((msg['audio'] as Json | undefined)?.['id'] ?? '');
    if (!mediaId) return null;

    // GEMINI, não OpenAI — decisão medida em 2026-08-03 pela sonda de etapas:
    // a OPENAI_API_KEY dos secrets devolve 401 invalid_api_key (revogada), e a
    // GEMINI_API_KEY transcreveu com 200 no gemini-2.5-flash. Trocar de
    // provedor consertou sem depender de chave nova. (gemini-2.0-flash está
    // APOSENTADO — 404; não "downgrade" o modelo.)
    // Sem chave NÃO aborta: o ÁUDIO EM SI (player na UI) vale mais que a
    // transcrição — o atendente humano precisa OUVIR mesmo quando a IA não lê.
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.error('[platform-meta-whatsapp-webhook] audio: GEMINI_API_KEY ausente — segue sem transcrição');
    }

    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('access_token_encrypted')
      .eq('id', connectionId)
      .maybeSingle();
    const token = conn?.access_token_encrypted
      ? await decryptSecret(String(conn.access_token_encrypted))
      : '';
    if (!token) {
      console.error('[platform-meta-whatsapp-webhook] audio: conexão sem token utilizável', connectionId);
      return null;
    }

    // 1. Graph troca media id por URL efêmera (expira em ~5 min — usar já).
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const metaBody = await metaRes.json().catch(() => ({}));
    const graphMediaUrl = String((metaBody as Json | null)?.['url'] ?? '');
    if (!metaRes.ok || !graphMediaUrl) {
      console.error('[platform-meta-whatsapp-webhook] audio: Graph não devolveu URL', metaRes.status);
      return null;
    }

    // 2. Download do binário — EXIGE o mesmo Bearer (a URL da Meta não é pública).
    const binRes = await fetch(graphMediaUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) {
      console.error('[platform-meta-whatsapp-webhook] audio: download falhou', binRes.status);
      return null;
    }
    const bytes = new Uint8Array(await binRes.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) {
      console.error('[platform-meta-whatsapp-webhook] audio: tamanho inválido', bytes.length);
      return null;
    }

    // 3. GUARDA O ÁUDIO no Storage ANTES de transcrever — o player da UI já
    //    existe (extractMedia + PlatformCrmMediaAttachment) e só nunca aparecia
    //    porque nenhuma URL era gravada. A URL da Meta expira em minutos; a do
    //    bucket não. Upload primeiro: se a transcrição falhar, o humano OUVE.
    let mediaUrl: string | null = null;
    try {
      const path = `platform-crm/whatsapp-audio/${mediaId}.ogg`;
      const { error: upErr } = await supabase.storage
        .from('inbox-media')
        .upload(path, bytes, { contentType: 'audio/ogg', upsert: true });
      if (upErr) {
        console.error('[platform-meta-whatsapp-webhook] audio: upload storage falhou', upErr.message);
      } else {
        const { data: pub } = supabase.storage.from('inbox-media').getPublicUrl(path);
        mediaUrl = pub?.publicUrl ?? null;
      }
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] audio: upload exceção', String(e).slice(0, 160));
    }

    // 4. Gemini transcreve (best-effort). WhatsApp manda voz como audio/ogg
    //    (opus) — aceito inline. btoa em blocos: spread grande estoura a pilha.
    let transcript: string | null = null;
    if (geminiKey) {
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const trRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: 'audio/ogg', data: btoa(bin) } },
              { text: 'Transcreva este áudio em português brasileiro, fielmente e sem comentários. ' +
                      'Responda SOMENTE com o texto falado. Se não houver fala, responda exatamente [inaudivel].' },
            ]}],
          }),
        },
      );
      const trBody = await trRes.json().catch(() => ({}));
      const parts = (trBody as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0]?.content?.parts ?? [];
      const t = parts.map((p) => p?.text ?? '').join('').trim();
      if (!trRes.ok || !t || t === '[inaudivel]') {
        console.error('[platform-meta-whatsapp-webhook] audio: gemini falhou',
          trRes.status, JSON.stringify(trBody).slice(0, 200));
      } else {
        transcript = t;
      }
    }

    if (!transcript && !mediaUrl) return null;
    return { transcript, mediaId, mediaUrl };
  } catch (e) {
    console.error('[platform-meta-whatsapp-webhook] audio: exceção', String(e).slice(0, 200));
    return null;
  }
}

/** Fallback de produto (slug fixo) para conexões SEM product_id cadastrado.
 *  A regra canônica (A1.3) é herdar `product_id` DA CONEXÃO por onde a
 *  mensagem entrou (platform_crm_whatsapp_meta_connections.product_id);
 *  este resolve só cobre conexões antigas ainda não vinculadas a produto.
 *  Non-fatal: sem produto cadastrado, conversa/lead seguem sem product_id. */
async function resolveDefaultProductId(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('platform_crm_products')
      .select('id')
      .eq('slug', 'nexvybeauty')
      .limit(1)
      .maybeSingle();
    return (data?.id as string) ?? null;
  } catch (e) {
    console.warn('[platform-meta-whatsapp-webhook] resolveDefaultProductId (non-fatal):', e);
    return null;
  }
}

/** Conexão dona do número que RECEBEU a mensagem (`value.metadata.phone_number_id`).
 *
 *  POR QUE NÃO USAR O connectionId DO PATH: um App Meta tem UMA callback URL por
 *  produto. Com várias WABAs sob o mesmo app_id (Vendas + Demo +, no futuro,
 *  tenants com número próprio), o Meta entrega TUDO nessa mesma URL — e o path
 *  aponta sempre para a MESMA conexão. Rotear pelo path fazia a mensagem enviada
 *  ao número da Demo ser gravada como Vendas e respondida pela persona errada,
 *  por outro número (reproduzido em 2026-08-01 04:42 e 05:20 UTC). Com tenant de
 *  número próprio sob o mesmo app, o mesmo defeito viraria vazamento cross-tenant.
 *
 *  O payload sempre soube a resposta: `metadata.phone_number_id` é o número que
 *  recebeu. Ele é a fonte de verdade do roteamento; o path é só endereço.
 *
 *  FALLBACK: número não cadastrado cai na conexão do path e loga WARN — descartar
 *  a mensagem seria pior que atribuí-la. O WARN existe pra a falha não ser muda. */
/** ── RESOLVEDOR UNIFICADO (Bloco 1 do cutover Studio Flor) ──────────────────
 *  Passou a existir uma SEGUNDA tabela de conexões: `whatsapp_meta_connections`,
 *  ORG-scoped (tenant), gêmea da product-scoped. O mesmo App Meta entrega as duas
 *  na MESMA callback URL, então a resolução tem que olhar as duas.
 *
 *  ESTADO ATUAL: `whatsapp_meta_connections` está VAZIA. Enquanto estiver, esta
 *  função devolve exatamente o que devolvia antes — o ramo tenant não tem como
 *  acender. É deliberado: torna o deploy verificável POR NÃO-MUDANÇA. Vendas e
 *  Demo têm que continuar bit-a-bit idênticas, e essa é a prova.
 *
 *  COLISÃO É ERRO, NUNCA PREFERÊNCIA. Se o mesmo phone_number_id existir nas
 *  DUAS tabelas não há escolha certa: preferir uma rotearia silenciosamente a
 *  mensagem de um tenant para o CRM de plataforma (ou o contrário) — vazamento
 *  cross-tenant com aparência de funcionamento. O UNIQUE parcial em
 *  whatsapp_meta_connections.phone_number_id impede duplicata DENTRO do
 *  org-scoped; ENTRE as duas tabelas o banco não alcança, e o gate é aqui. */
/** `scope: 'collision'` NÃO é decoração — é o conserto de um bug real.
 *
 *  A primeira versão devolvia `null` na colisão, e o consumidor faz
 *  `real?.id ?? connectionId` — ou seja, caía na conexão DO PATH e roteava a
 *  mensagem assim mesmo, enquanto o console.error afirmava "mensagem NÃO
 *  roteada". O log mentia sobre uma garantia de segurança.
 *
 *  A causa não era o `??`: era `null` carregando DOIS estados opostos —
 *  "não achei em lugar nenhum" (fallback ao path é o legado, defensável) e
 *  "achei nas duas" (não rotear de jeito nenhum). O consumidor não tinha como
 *  distinguir porque a informação era apagada no retorno.
 *  Achado pela Trilha S conferindo este arquivo. */
type ResolvedConn = {
  /** vazio quando scope === 'collision' — não há conexão eleita. */
  id: string;
  product_id: string | null;
  /** null quando a conexão é de plataforma. */
  organization_id: string | null;
  scope: 'platform' | 'tenant' | 'collision';
};

async function resolveConnectionForValue(
  supabase: ReturnType<typeof getServiceClient>,
  value: Json,
  pathConnectionId: string,
  memo: Map<string, ResolvedConn>,
): Promise<ResolvedConn | null> {
  const meta = (value['metadata'] as Json | undefined) ?? {};
  const phoneNumberId = meta['phone_number_id'] ? String(meta['phone_number_id']) : '';
  if (!phoneNumberId) {
    console.warn('[platform-meta-whatsapp-webhook] payload sem phone_number_id — usando conexão do path');
    return null;
  }

  const cached = memo.get(phoneNumberId);
  if (cached) return cached;

  // As duas buscas em paralelo. Custo hoje: uma query a mais numa tabela vazia.
  const found = await lookupMetaWebhookConnections(supabase, phoneNumberId);
  const decision = decideMetaWebhookRoute(found.platform, found.tenant);

  if (decision.scope === 'collision') {
    console.error(
      `[platform-meta-whatsapp-webhook] COLISÃO DE ESCOPO: phone_number_id ${phoneNumberId}` +
        ` existe em platform(${found.platform?.id}) E tenant(${found.tenant?.id}).` +
        ` Nenhuma atribuição é segura — mensagem NÃO roteada.`,
    );
    return { id: '', product_id: null, organization_id: null, scope: 'collision' };
  }

  if (decision.scope === 'tenant' && decision.connectionId) {
    const resolvedTenant: ResolvedConn = {
      id: decision.connectionId,
      product_id: null,
      organization_id: decision.organizationId,
      scope: 'tenant',
    };
    memo.set(phoneNumberId, resolvedTenant);
    console.log(
      `[platform-meta-whatsapp-webhook] roteado para TENANT: org=${resolvedTenant.organization_id}` +
        ` conn=${resolvedTenant.id} (phone_number_id=${phoneNumberId})`,
    );
    return resolvedTenant;
  }

  if (decision.scope !== 'platform' || !decision.connectionId) {
    console.warn(
      `[platform-meta-whatsapp-webhook] phone_number_id ${phoneNumberId} sem conexão cadastrada` +
        ` — caindo na conexão do path ${pathConnectionId}`,
    );
    return null;
  }

  const resolved: ResolvedConn = {
    id: decision.connectionId,
    product_id: decision.productId,
    organization_id: null,
    scope: 'platform',
  };
  if (resolved.id !== pathConnectionId) {
    // Não é erro: é o caso NORMAL quando várias WABAs dividem o mesmo App Meta.
    console.log(
      `[platform-meta-whatsapp-webhook] roteado por phone_number_id: path=${pathConnectionId}` +
        ` → real=${resolved.id} (phone_number_id=${phoneNumberId})`,
    );
  }
  memo.set(phoneNumberId, resolved);
  return resolved;
}

/** Lead por telefone (dedupe) ou cria — espelho do auto-create do webchat. */
async function ensureLead(
  supabase: ReturnType<typeof getServiceClient>,
  fromDigits: string,
  profileName: string | null,
  productId: string | null,
): Promise<string | null> {
  try {
    const phonePlus = `+${fromDigits}`;
    const { data: existing } = await supabase
      .from('platform_crm_leads')
      .select('id')
      .or(`phone.eq.${fromDigits},phone.eq.${phonePlus}`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from('platform_crm_leads')
      .insert({
        name: profileName || `WhatsApp ${phonePlus}`,
        phone: phonePlus,
        source: 'whatsapp',
        lead_channel: 'whatsapp',
        // Só no INSERT: lead existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select('id')
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-webhook] auto-create lead failed (non-fatal):', error);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[platform-meta-whatsapp-webhook] ensureLead error (non-fatal):', e);
    return null;
  }
}

/** Conversa aberta do visitante ou cria (channel='whatsapp'). Reabre fechada
 *  como bot_active: o número de vendas é atendido pelos agentes IA. */
async function ensureConversation(
  supabase: ReturnType<typeof getServiceClient>,
  fromDigits: string,
  profileName: string | null,
  productId: string | null,
  connectionId: string,
): Promise<Json | null> {
  const visitorId = `wa:${fromDigits}`;
  // A identidade da conversa é o PAR (quem fala, por qual número NOSSO ele falou).
  // Com um número só os dois coincidiam; com Vendas + Demo (+ tenants) não mais:
  // sem o filtro por meta_connection_id, quem escreve pra Demo reencontra a
  // conversa de Vendas e é atendido pela persona errada — e `product_id` nunca é
  // sobrescrito em conversa existente (ver INSERT abaixo), então o erro gruda.
  const { data: rows } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('meta_connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1);
  let conversation = (rows?.[0] as Json) ?? null;

  if (conversation && conversation['status'] === 'closed') {
    const { data: reopened, error } = await supabase
      .from('platform_crm_conversations')
      .update({
        status: 'bot_active',
        needs_human: false,
        accepted_at: null,
        accepted_by: null,
        assigned_to: null,
      })
      .eq('id', conversation['id'])
      .select()
      .single();
    if (!error && reopened) conversation = reopened as Json;
  }

  if (!conversation) {
    const { data: created, error } = await supabase
      .from('platform_crm_conversations')
      .insert({
        visitor_id: visitorId,
        visitor_name: profileName,
        visitor_phone: `+${fromDigits}`,
        visitor_whatsapp: `+${fromDigits}`,
        channel: 'whatsapp',
        status: 'bot_active',
        needs_human: false,
        meta_connection_id: connectionId,
        // Só no INSERT: conversa existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select()
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-webhook] create conversation failed:', error);
      return null;
    }
    conversation = created as Json;
  }

  // Canal-por-conversa (A1.3): conversa existente ganha o vínculo com a conexão
  // por onde a mensagem entrou e herda product_id da conexão APENAS quando ainda
  // não tem produto (atribuição manual nunca é sobrescrita). Recém-criadas já
  // nascem com os dois campos — patch vira no-op.
  const channelPatch: Json = {};
  if (conversation['meta_connection_id'] !== connectionId) {
    channelPatch['meta_connection_id'] = connectionId;
  }
  if (!conversation['product_id'] && productId) {
    channelPatch['product_id'] = productId;
  }
  if (Object.keys(channelPatch).length > 0) {
    const { error: patchError } = await supabase
      .from('platform_crm_conversations')
      .update(channelPatch)
      .eq('id', conversation['id']);
    if (patchError) {
      console.error('[platform-meta-whatsapp-webhook] channel patch failed (non-fatal):', patchError);
    } else {
      Object.assign(conversation, channelPatch);
    }
  }

  if (!conversation['lead_id']) {
    const leadId = await ensureLead(supabase, fromDigits, profileName, productId);
    if (leadId) {
      await supabase
        .from('platform_crm_conversations')
        .update({ lead_id: leadId })
        .eq('id', conversation['id']);
      conversation['lead_id'] = leadId;
      await ensurePlatformLeadInPipeline(supabase, leadId);
    }
  }

  return conversation;
}

/** G1 — captura de atribuição CTWA. Se a mensagem veio de anúncio (referral),
 *  grava first-touch no lead (source='ctwa' + utm + metadata.referral, SÓ se o
 *  lead ainda não foi atribuído), registra a linha durável em ads_attribution
 *  (dedup por conversa+clid) e emite a jornada meta_ctwa_received. Non-fatal:
 *  qualquer erro loga e NÃO derruba o processamento da mensagem (o caminho
 *  orgânico e a captura de anúncio nunca competem). */
async function captureCtwaAttribution(
  supabase: ReturnType<typeof getServiceClient>,
  conversation: Json,
  referral: CtwaReferral,
  connectionId: string,
): Promise<void> {
  const leadId = (conversation['lead_id'] as string | null) ?? null;
  const conversationId = String(conversation['id']);
  const productId = (conversation['product_id'] as string | null) ?? null;

  // 1) First-touch no lead: só carimba se ainda não há atribuição (utm_source null).
  if (leadId) {
    try {
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('id, utm_source, metadata')
        .eq('id', leadId)
        .maybeSingle();
      if (lead && !lead['utm_source']) {
        const meta = (lead['metadata'] as Json | null) ?? {};
        await supabase
          .from('platform_crm_leads')
          .update({
            source: 'ctwa',
            ...ctwaUtm(referral),
            metadata: { ...meta, referral: referral.raw, ctwa_clid: referral.ctwa_clid },
          })
          .eq('id', leadId)
          .is('utm_source', null); // race-safe: não sobrescreve atribuição concorrente
      }
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] ctwa lead stamp (non-fatal):', e);
    }
  }

  // 2) ads_attribution — linha durável por click (dedup por conversa+clid no índice).
  //    product_id é NOT NULL: só insere quando a conexão resolveu produto.
  if (productId) {
    try {
      const { error } = await supabase.from('ads_attribution').insert({
        product_id: productId,
        lead_id: leadId,
        conversation_id: conversationId,
        connection_id: connectionId,
        ctwa_clid: referral.ctwa_clid,
        source_id: referral.source_id,
        source_type: referral.source_type,
        source_url: referral.source_url,
        headline: referral.headline,
        body: referral.body,
        media_type: referral.media_type,
        ctwa_channel: 'whatsapp',
        raw: referral.raw,
      });
      // 23505 = re-entrega do mesmo click (índice único parcial) → ok.
      if (error && !String(error.code).includes('23505')) {
        console.error('[platform-meta-whatsapp-webhook] ads_attribution insert (non-fatal):', error);
      }
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] ads_attribution (non-fatal):', e);
    }
  }

  // 3) Jornada — meta_ctwa_received (categoria 'origin', evento #2 do funil).
  if (productId && leadId) {
    try {
      await supabase.rpc('pcrm_log_journey_event', {
        p_product: productId,
        p_lead: leadId,
        p_type: 'meta_ctwa_received',
        p_category: 'origin',
        p_channel: 'whatsapp',
        p_source: 'ctwa',
        p_title: referral.headline ?? 'Lead veio de anúncio (CTWA)',
        p_payload: referral.raw,
        p_conversation: conversationId,
      });
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] journey meta_ctwa_received (non-fatal):', e);
    }
  }
}

/** Uma mensagem inbound: dedupe por wamid → conversa/lead → insert → broadcast.
 *  Retorna o id da conversa quando a mensagem foi persistida E a conversa está
 *  bot_active — é o sinal para o gatilho do cérebro de vendas (F2). */
async function processInboundMessage(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  value: Json,
  msg: Json,
  defaultProductId: string | null,
): Promise<string | null> {
  const wamid = String(msg['id'] ?? '');
  const fromDigits = String(msg['from'] ?? '').replace(/\D/g, '');
  if (!wamid || !fromDigits) return null;

  const { data: dupe } = await supabase
    .from('platform_crm_messages')
    .select('id')
    .eq('metadata->>wamid', wamid)
    .limit(1)
    .maybeSingle();
  if (dupe) return null;

  const contacts = (value['contacts'] as Json[] | undefined) ?? [];
  const profileName =
    contacts.length > 0
      ? String((contacts[0]?.['profile'] as Json | undefined)?.['name'] ?? '') || null
      : null;

  const conversation = await ensureConversation(supabase, fromDigits, profileName, defaultProductId, connectionId);
  if (!conversation) return null;

  // G1 — atribuição CTWA: se a mensagem veio de anúncio Click-to-WhatsApp,
  // captura referral/ctwa_clid → lead + ads_attribution + jornada. Non-fatal;
  // mensagem sem referral (orgânica) segue o caminho intocado.
  const ctwaReferral = parseCtwaReferral(msg);
  if (ctwaReferral) {
    await captureCtwaAttribution(supabase, conversation, ctwaReferral, connectionId);
  }

  let { content, contentType } = extractContent(msg);
  const metadata = (value['metadata'] as Json | undefined) ?? {};

  // Áudio vira TEXTO antes do insert: o cérebro lê `content` do histórico e a
  // UI mostra a mesma coluna — transcrever aqui conserta os dois consumidores
  // de uma vez. Se falhar, segue '[audio]' (fail-open; ver o helper).
  let audioTr: { transcript: string | null; mediaId: string; mediaUrl: string | null } | null = null;
  if (contentType === 'audio') {
    audioTr = await transcribeInboundAudio(supabase, msg, connectionId);
    if (audioTr?.transcript) content = `🎙️ ${audioTr.transcript}`;
    // Com player (metadata.media) o rótulo '[audio]' vira ruído — a bolha já
    // mostra o áudio. Só mantém '[audio]' quando NADA foi recuperado.
    else if (audioTr?.mediaUrl) content = '';
  }

  const { data: inserted, error } = await supabase
    .from('platform_crm_messages')
    .insert({
      conversation_id: conversation['id'],
      direction: 'inbound',
      sender_type: 'visitor',
      content,
      content_type: contentType,
      metadata: {
        wamid,
        channel: 'whatsapp_cloud',
        connection_id: connectionId,
        from: fromDigits,
        phone_number_id: metadata['phone_number_id'] ?? null,
        wa_timestamp: msg['timestamp'] ?? null,
        wa_type: msg['type'] ?? null,
        ...(audioTr ? {
          media_id: audioTr.mediaId,
          ...(audioTr.transcript ? { transcription: audioTr.transcript } : {}),
          // Formato CANÔNICO que extractMedia/PlatformCrmMediaAttachment leem —
          // é isto que faz o player aparecer na bolha.
          ...(audioTr.mediaUrl
            ? { media: { kind: 'audio', url: audioTr.mediaUrl, mime: 'audio/ogg' } }
            : {}),
        } : {}),
        ...(ctwaReferral ? { referral: ctwaReferral.raw } : {}),
      },
    })
    .select()
    .single();
  if (error) {
    // 23505 = corrida entre re-entregas resolvida pelo índice único (ok).
    if (!String(error.code).includes('23505')) {
      console.error('[platform-meta-whatsapp-webhook] insert message failed:', error);
    }
    return null;
  }

  await supabase
    .from('platform_crm_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(profileName && !conversation['visitor_name'] ? { visitor_name: profileName } : {}),
    })
    .eq('id', conversation['id']);

  await broadcastPlatformNewMessage(supabase, String(conversation['id']), inserted as Json);

  // Só conversa em atendimento da IA aciona o cérebro (humano assumiu = IA cala).
  return conversation['status'] === 'bot_active' ? String(conversation['id']) : null;
}

/** Statuses (sent/delivered/read/failed) → metadata da mensagem outbound. */
async function processStatus(
  supabase: ReturnType<typeof getServiceClient>,
  status: Json,
): Promise<void> {
  const wamid = String(status['id'] ?? '');
  const newStatus = String(status['status'] ?? '');
  if (!wamid || !newStatus) return;

  const { data: row } = await supabase
    .from('platform_crm_messages')
    .select('id, metadata')
    .eq('metadata->>wamid', wamid)
    .limit(1)
    .maybeSingle();
  if (!row) return;

  const merged = {
    ...((row.metadata as Json) ?? {}),
    status: newStatus,
    status_timestamp: status['timestamp'] ?? null,
    ...(newStatus === 'failed' ? { status_errors: status['errors'] ?? null } : {}),
  };
  await supabase.from('platform_crm_messages').update({ metadata: merged }).eq('id', row.id);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const connectionId = connectionIdFromPath(url);
  const supabase = getServiceClient();

  // ── GET: verificação do Meta Console ──────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (!connectionId) return new Response('missing connection id', { status: 404 });

    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, webhook_verify_token')
      .eq('id', connectionId)
      .maybeSingle();

    if (
      mode === 'subscribe' &&
      conn?.webhook_verify_token &&
      token === conn.webhook_verify_token
    ) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!connectionId) return new Response('missing connection id', { status: 404 });

  // ── POST: assinatura sobre o corpo CRU antes de tudo ───────────────────────
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  const { data: conn } = await supabase
    .from('platform_crm_whatsapp_meta_connections')
    .select('id, app_secret_encrypted, app_secret_source, status, product_id')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) return new Response('unknown connection', { status: 404 });

  try {
    const appSecret = await resolveDeclaredAppSecret(conn);
    if (!appSecret) return new Response('forbidden', { status: 403 });
    const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
    if (!signature || !timingSafeEqual(expected, signature)) {
      console.warn('[platform-meta-whatsapp-webhook] assinatura inválida — descartando');
      return new Response('invalid signature', { status: 401 });
    }
  } catch (e) {
    console.error('[platform-meta-whatsapp-webhook] falha ao validar assinatura:', e);
    return new Response('signature validation error', { status: 401 });
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response('bad json', { status: 200 });
  }

  try {
    // Conversas bot_active que receberam inbound nesta entrega → gatilho do cérebro.
    const convsForBrain = new Set<string>();
    // Conexões que de fato receberam mensagem. O health check é da conexão REAL,
    // não da do path — que pode não ter recebido nada nesta entrega.
    const touchedConnections = new Set<string>();
    // Uma entrega pode trazer números diferentes; memo evita re-query por número.
    const connByPhoneNumberId = new Map<string, ResolvedConn>();
    // Fallback de produto por slug, resolvido no máximo 1x por invocação.
    let slugProductId: string | null | undefined;
    const entries = (payload['entry'] as Json[] | undefined) ?? [];
    for (const entry of entries) {
      const changes = (entry['changes'] as Json[] | undefined) ?? [];
      for (const change of changes) {
        const field = String(change['field'] ?? '');
        const value = change['value'] as Json | undefined;
        if (!value) continue;

        if (field === 'messages') {
          for (const s of (value['statuses'] as Json[] | undefined) ?? []) {
            await processStatus(supabase, s);
          }
          const msgs = (value['messages'] as Json[] | undefined) ?? [];
          if (msgs.length === 0) continue;

          // Roteamento pelo número que RECEBEU — ver resolveConnectionForValue.
          const real = await resolveConnectionForValue(supabase, value, connectionId, connByPhoneNumberId);

          // ── GATE DO RAMO TENANT ────────────────────────────────────────────
          // Conexão org-scoped resolvida: NÃO pode seguir daqui pra baixo. Todo
          // o caminho abaixo grava em platform_crm_* e despacha platform-sales-brain
          // — gravaria a conversa de um salão no CRM de plataforma e responderia
          // com a persona de vendas. A bifurcação de verdade (webchat_conversations
          // + webchat-bot + meta-whatsapp-send) é o próximo passo do Bloco 1 e
          // toca o caminho que hoje grava Vendas e Demo; não entra junto com esta
          // mudança de resolução.
          //
          // Até lá o comportamento é RECUSA EXPLÍCITA, não atribuição errada:
          // registra em whatsapp_meta_webhook_logs (processed=false) e devolve 200
          // ao Meta. A mensagem não some — fica auditável numa tabela consultável,
          // em vez de virar linha de log que ninguém lê.
          //
          // ⚠️ MAS: tabela não é melhor que log por ser tabela — é melhor por ser
          // CONSULTADA. Sem ninguém olhando, `processed=false` é a mesma coisa que
          // um console.warn: registro que existe e que ninguém lê. A obrigação de
          // olhar é de quem produz o estado, e produzir aqui só é possível gravando
          // uma conexão em whatsapp_meta_connections. Quem gravar a primeira DEVE:
          //
          //   select * from whatsapp_meta_webhook_logs where processed = false;
          //
          //   0 linhas   → o ramo tenant nunca foi exercitado (não é sucesso)
          //   >0 linhas  → mensagem chegou e NÃO foi atendida
          //
          // Sem essa consulta, esta "recusa auditável" vira falha silenciosa com
          // custo de storage.
          //
          // HOJE ISTO É INALCANÇÁVEL: whatsapp_meta_connections está vazia, então
          // `scope` nunca é 'tenant'. É o que torna este deploy verificável por
          // NÃO-MUDANÇA — Vendas e Demo seguem bit-a-bit idênticas.
          if (real?.scope === 'tenant') {
            console.warn(
              `[platform-meta-whatsapp-webhook] conexão TENANT ${real.id} (org=${real.organization_id})` +
                ` — ramo tenant ainda não implementado; mensagem registrada e NÃO processada`,
            );
            await supabase.from('whatsapp_meta_webhook_logs').insert({
              organization_id: real.organization_id,
              connection_id: real.id,
              event_type: 'messages',
              payload: value as unknown as Record<string, unknown>,
              processed: false,
              error: 'ramo tenant do resolvedor unificado ainda nao implementado',
            });
            continue;
          }

          // ── GATE DA COLISÃO DE ESCOPO ──────────────────────────────────────
          // TEM que vir antes do `?? connectionId` abaixo: aquele fallback usa a
          // conexão do PATH, que é exatamente o que o cabeçalho deste arquivo
          // documenta como o que NÃO se deve usar para rotear. Sem este gate, a
          // colisão caía no path e a mensagem era entregue ao escopo errado —
          // enquanto o console.error dizia "mensagem NÃO roteada". O log afirmava
          // uma garantia que o código não tinha.
          if (real?.scope === 'collision') {
            await supabase.from('whatsapp_meta_webhook_logs').insert({
              organization_id: null,
              connection_id: null,
              event_type: 'messages',
              payload: value as unknown as Record<string, unknown>,
              processed: false,
              error: 'colisao de escopo: phone_number_id existe na tabela de plataforma E na org-scoped; nao roteada',
            });
            return scopeCollisionResponse();
          }

          const targetConnectionId = real?.id ?? connectionId;

          // Herança canônica (A1.3): product_id vem DA CONEXÃO por onde a
          // mensagem entrou; slug fixo é só fallback p/ conexão sem produto.
          let productId = real ? real.product_id : (conn.product_id as string | null);
          if (!productId) {
            if (slugProductId === undefined) slugProductId = await resolveDefaultProductId(supabase);
            productId = slugProductId;
          }

          touchedConnections.add(targetConnectionId);
          for (const m of msgs) {
            const brainConvId = await processInboundMessage(supabase, targetConnectionId, value, m, productId);
            if (brainConvId) convsForBrain.add(brainConvId);
          }
        } else if (field === 'message_template_status_update') {
          // Sincronização fina fica com platform-meta-whatsapp-templates-sync;
          // aqui só registramos o evento.
          console.log('[platform-meta-whatsapp-webhook] template status:', JSON.stringify(value));
        }
      }
    }

    // Health check por conexão REAL: com App Meta compartilhado, a conexão do
    // path pode não ter recebido nada — marcá-la mentiria sobre a saúde dela.
    for (const cid of touchedConnections) {
      await supabase
        .from('platform_crm_whatsapp_meta_connections')
        .update({ last_health_check_at: new Date().toISOString(), last_error: null })
        .eq('id', cid);
    }

    // ── Gatilho do cérebro de vendas (F2) ────────────────────────────────
    // Fire-and-forget: a resposta 200 ao Meta NÃO espera o LLM. O brain só
    // age em conversa bot_active (revalida lá) e tem dedupe próprio.
    const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
    for (const convId of convsForBrain) {
      const call = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-sales-brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-brain-secret': brainSecret },
        body: JSON.stringify({ conversation_id: convId }),
      }).then(async (r) => {
        if (!r.ok) console.error('[platform-meta-whatsapp-webhook] brain retornou', r.status, (await r.text()).slice(0, 200));
      }).catch((e) => console.error('[platform-meta-whatsapp-webhook] brain fetch error:', e));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(call);
      else await call;
    }
  } catch (e) {
    // Nunca 5xx aqui: o Meta re-entregaria um payload que quebra por bug de
    // código. O wamid garante que nada se perde de forma silenciosa duplicada.
    console.error('[platform-meta-whatsapp-webhook] processing error:', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
