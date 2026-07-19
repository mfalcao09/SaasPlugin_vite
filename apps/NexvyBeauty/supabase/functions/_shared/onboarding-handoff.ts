// _shared/onboarding-handoff.ts — HANDOFF Duda→CS pós-compra no MESMO thread.
//
// Chamado por cakto-plan-provisioning.ts (provisionFromOrder, gate org_created):
// depois que a compra provisiona a org, localiza a conversa de VENDA da
// compradora no platform_crm e:
//   1. fixa current_agent_id no agente de CS/implantação ("Lia · Implantação",
//      agent_type='support', seedado em 20260714_onboarding_fase_handoff.sql);
//   2. grava provisioned_organization_id (vínculo conversa↔org) — é ESTE campo
//      que liga o modo implantação do platform-sales-brain.
//
// GATE: ONBOARDING_HANDOFF_ENABLED=true no env. Default OFF — deploy sem o
// secret não muda NADA em produção (vendas ao vivo intocadas).
//
// TOLERANTE POR DESIGN (mesmo padrão de sendWelcomeWhatsApp): nunca lança,
// nunca derruba o provisionamento pago. Sem flag/agente/conversa → loga e segue.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { phoneVariantsBR } from './phone.ts';
import { GRAPH_BASE } from './meta-graph.ts';
import { decryptSecret } from './meta-crypto.ts';
import {
  type ConversationConnectionHints,
  reportUnresolvedConnection,
  resolveConnectionForConversation,
} from './whatsapp-connection.ts';
import { sendTelegramAlertThrottled } from './platform-alerts.ts';

export interface OnboardingHandoffArgs {
  organizationId: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
}

export interface OnboardingHandoffResult {
  ok: boolean;
  skipped?: string;
  conversation_id?: string;
  cs_agent_id?: string;
  /** true quando a Lia disparou o greeting proativo (2 bolhas) nesta invocação.
   *  O provisioning usa isto pra PULAR o welcome WhatsApp genérico (senão a
   *  compradora recebe boas-vindas em dobro). */
  greeted?: boolean;
}

// Greeting proativo da Lia (P2 · PR-A · A4). Mesma voz da Lia ("primeira fala:
// boas-vindas" do prompt dela), ≤300 chars/bolha. Registrar como bot faz o
// botAlreadySpoke do brain (index.ts:875) virar true → a Lia NÃO repete a
// saudação quando a cliente responder (o modo implantação continua do ponto).
// {nome} vira " Nome" (com espaço) ou "" — assim "Oi{nome}!" fica "Oi João!"
// com nome e "Oi!" sem nome (nunca "Oi !").
const LIA_GREETING_BUBBLES = [
  'Oi{nome}! Que alegria te ver no NexvyBeauty 💚 Sou a Lia, vou te acompanhar na montagem do seu espaço.',
  'Seu acesso já está no seu e-mail. Quando abrir, me chama aqui que a gente monta tudo junto, um passo por vez. Bora?',
];

/**
 * Dispara o greeting proativo da Lia na conversa recém-pinada e registra cada
 * bolha como mensagem do bot (sender_type='bot'). Best-effort por design (igual
 * a sendWelcomeWhatsApp): nunca lança nem derruba o provisionamento pago.
 *
 * Entrega espelha o deliverViaWhatsAppCloud do platform-sales-brain: a conexão
 * vem de resolveConnectionForConversation — o MESMO número por onde a conversa
 * de venda aconteceu (conversation.meta_connection_id), NUNCA "a ativa mais
 * recente" (com 2+ números isso jogava a Lia numa thread nova, do nada, logo
 * depois da compra). Decrypt do token, dígitos do destino, POST no Graph.
 * Persiste a mensagem ANTES de entregar (existe no CRM mesmo se o Graph falhar).
 * Retorna true se pelo menos 1 bolha foi persistida (o greeting "aconteceu" do
 * ponto de vista do CRM/anti-duplicação, independentemente da entrega externa).
 */
async function sendLiaGreeting(
  admin: SupabaseClient,
  conversationId: string,
  conversation: ConversationConnectionHints | null,
  destPhone: string | null,
  customerName: string | null,
): Promise<boolean> {
  try {
    const firstName = (customerName || '').trim().split(/\s+/)[0] || '';
    const to = String(destPhone ?? '').replace(/\D/g, '');

    // Conexão de saída: resolvida UMA vez p/ as 2 bolhas.
    let phoneNumberId: string | null = null;
    let token: string | null = null;
    let connectionId: string | null = null;
    if (to) {
      const resolved = await resolveConnectionForConversation(admin, conversation);
      if (resolved.conn) {
        phoneNumberId = resolved.conn.phone_number_id;
        connectionId = resolved.conn.id;
        token = await decryptSecret(resolved.conn.access_token_encrypted);
      } else {
        // Sem conexão resolvível NÃO entrega (persiste no CRM e alerta): mandar
        // pelo número errado é pior do que a bolha ficar só no histórico.
        await reportUnresolvedConnection('onboarding-handoff/lia-greeting', resolved, {
          conversation_id: conversationId,
        });
      }
    }

    let persistedAny = false;
    for (let i = 0; i < LIA_GREETING_BUBBLES.length; i++) {
      const body = LIA_GREETING_BUBBLES[i].replace('{nome}', firstName ? ` ${firstName}` : '').replace(/\s{2,}/g, ' ').trim();

      // 1) Persiste como bot ANTES de entregar (padrão do brain).
      const { data: msg, error: msgErr } = await admin
        .from('platform_crm_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'bot',
          content: body,
          content_type: 'text',
          metadata: {
            channel: 'whatsapp_cloud',
            proactive_greeting: 'lia',
            bubble_n: i + 1,
            bubble_total: LIA_GREETING_BUBBLES.length,
            ...(connectionId ? { connection_id: connectionId } : {}),
          },
        })
        .select('id')
        .single();
      if (msgErr) {
        console.warn('[onboarding-handoff] persist greeting bolha falhou:', msgErr.message);
        continue;
      }
      persistedAny = true;

      // 2) Entrega via Graph (só se temos conexão + destino). Non-fatal.
      if (token && phoneNumberId && to) {
        try {
          const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const wamid = (data as any)?.messages?.[0]?.id ?? null;
            if (!wamid) console.warn('[onboarding-handoff] greeting Graph falhou:', String((data as any)?.error?.message ?? res.status).slice(0, 160));
          }
        } catch (e) {
          console.warn('[onboarding-handoff] greeting Graph exception (non-fatal):', String(e).slice(0, 160));
        }
      }
    }
    return persistedAny;
  } catch (e) {
    console.warn('[onboarding-handoff] sendLiaGreeting exception (non-fatal):', String(e).slice(0, 200));
    return false;
  }
}

export async function handoffConversationToOnboarding(
  admin: SupabaseClient,
  args: OnboardingHandoffArgs,
): Promise<OnboardingHandoffResult> {
  const enabled = (Deno.env.get('ONBOARDING_HANDOFF_ENABLED') ?? '').toLowerCase() === 'true';
  if (!enabled) return { ok: false, skipped: 'flag_off' };
  if (!args.organizationId) return { ok: false, skipped: 'no_organization_id' };

  try {
    // 1) Agente CS de implantação (support + "implanta" no nome). Determinístico:
    //    o mais antigo. Sem ele (migration/seed não aplicados), loga e segue.
    const { data: csAgent, error: agentErr } = await admin
      .from('platform_crm_product_agents')
      .select('id, name, product_id')
      .eq('agent_type', 'support')
      .eq('is_active', true)
      .ilike('name', '%implanta%')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (agentErr) {
      console.warn('[onboarding-handoff] busca do agente CS falhou:', agentErr.message);
      return { ok: false, skipped: 'agent_query_failed' };
    }
    if (!csAgent?.id) {
      // HANDOFF Duda→Lia FALHOU. A conversa NÃO fica órfã (segue com quem estava,
      // a Duda), mas uma compradora pagante ficou sem quem faça a implantação —
      // silêncio aqui é exatamente o que a auditoria pré-ads foi caçar.
      console.warn('[onboarding-handoff] nenhum agente CS de implantação (support/%implanta%) ativo — handoff pulado.');
      await sendTelegramAlertThrottled(
        `onboarding-handoff-no-cs:${args.organizationId}`,
        `⚠️ HANDOFF PÓS-COMPRA FALHOU (sem agente de implantação)\n` +
        `Org provisionada: ${args.organizationId}\n` +
        `Nenhum agente is_active com agent_type='support' e nome ~ '%implanta%' (Lia).\n` +
        `A conversa CONTINUA com o agente atual (Duda) — ninguém ficou sem resposta, mas a implantação não foi assumida.`,
      );
      return { ok: false, skipped: 'no_cs_agent' };
    }

    // 2) Conversa da compradora — 1º por telefone normalizado (todas as
    //    variantes BR: com/sem DDI 55, com/sem o 9 extra) contra
    //    visitor_whatsapp/visitor_phone; canal whatsapp; a mais recente.
    let conversationId: string | null = null;
    const variants = phoneVariantsBR(args.customerPhone);
    if (variants.length) {
      // Os webhooks inbound/outbound gravam visitor_whatsapp/visitor_phone como
      // "+E.164" (platform-meta-whatsapp-webhook:185-186); phoneVariantsBR gera
      // só-dígitos. Cobrimos os dois formatos (match .in. é exato).
      const withPlus = variants.map((v) => `+${v}`);
      const list = [...variants, ...withPlus].join(',');
      const { data: convs, error: convErr } = await admin
        .from('platform_crm_conversations')
        .select('id, last_message_at')
        .eq('channel', 'whatsapp')
        .eq('product_id', csAgent.product_id)
        .or(`visitor_whatsapp.in.(${list}),visitor_phone.in.(${list})`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);
      if (convErr) console.warn('[onboarding-handoff] busca por telefone falhou:', convErr.message);
      conversationId = convs?.[0]?.id ?? null;
    }

    // 3) Fallback por e-mail: lead do platform_crm com esse e-mail → conversa
    //    vinculada; ou visitor_email direto na conversa.
    const email = (args.customerEmail ?? '').trim().toLowerCase();
    if (!conversationId && email) {
      const { data: leads } = await admin
        .from('platform_crm_leads')
        .select('id')
        .ilike('email', email)
        .limit(10);
      const leadIds = (leads ?? []).map((l: { id: string }) => l.id);

      const orParts = [`visitor_email.ilike.${email}`];
      if (leadIds.length) orParts.push(`lead_id.in.(${leadIds.join(',')})`);
      const { data: convs, error: convErr } = await admin
        .from('platform_crm_conversations')
        .select('id, last_message_at')
        .eq('channel', 'whatsapp')
        .eq('product_id', csAgent.product_id)
        .or(orParts.join(','))
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);
      if (convErr) console.warn('[onboarding-handoff] busca por e-mail falhou:', convErr.message);
      conversationId = convs?.[0]?.id ?? null;
    }

    if (!conversationId) {
      console.log('[onboarding-handoff] conversa da compradora não encontrada (phone/email) — handoff pulado, provisioning segue.');
      return { ok: false, skipped: 'conversation_not_found', cs_agent_id: csAgent.id };
    }

    // 4) Handoff: agente CS assume + vínculo conversa↔org. NÃO toca status —
    //    a conversa segue bot_active (ou o estado em que estiver).
    const { error: updErr } = await admin
      .from('platform_crm_conversations')
      .update({
        current_agent_id: csAgent.id,
        provisioned_organization_id: args.organizationId,
      })
      .eq('id', conversationId);
    if (updErr) {
      // Coluna ainda não migrada, RLS, etc. — loga e segue (deploy-safe).
      console.warn('[onboarding-handoff] update da conversa falhou:', updErr.message);
      await sendTelegramAlertThrottled(
        `onboarding-handoff-update-failed:${conversationId}`,
        `⚠️ HANDOFF PÓS-COMPRA FALHOU (update da conversa)\n` +
        `Conversa: ${conversationId} · Org: ${args.organizationId} · Lia: ${csAgent.id}\n` +
        `Erro: ${updErr.message.slice(0, 200)}\n` +
        `current_agent_id NÃO mudou — a conversa segue com o agente anterior (Duda), sem modo implantação.`,
      );
      return { ok: false, skipped: 'update_failed', conversation_id: conversationId, cs_agent_id: csAgent.id };
    }

    // 5) Greeting proativo da Lia (A4): 1ª fala calorosa SEM esperar a cliente.
    //    Idempotente — se a Lia já greetou esta conversa (metadata
    //    proactive_greeting='lia'), não redispara, mas ainda sinaliza greeted=true
    //    (o provisioning pula o welcome genérico de qualquer forma). Destino = o
    //    WhatsApp da própria conversa (fonte canônica do inbound); fallback pro
    //    telefone Cakto. Non-fatal: falha aqui não derruba o handoff nem a compra.
    let greeted = false;
    try {
      const { data: convRow } = await admin
        .from('platform_crm_conversations')
        // meta_connection_id/product_id: dizem por qual número a Lia deve falar
        // (o mesmo da conversa de venda).
        .select('id, visitor_whatsapp, visitor_phone, visitor_name, meta_connection_id, product_id')
        .eq('id', conversationId)
        .maybeSingle();
      const { data: priorGreeting } = await admin
        .from('platform_crm_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .filter('metadata->>proactive_greeting', 'eq', 'lia')
        .limit(1)
        .maybeSingle();
      if (priorGreeting?.id) {
        greeted = true; // já greetou antes — não duplica
      } else {
        const destPhone = (convRow as any)?.visitor_whatsapp ?? (convRow as any)?.visitor_phone ?? args.customerPhone ?? null;
        const name = (convRow as any)?.visitor_name ?? null;
        greeted = await sendLiaGreeting(
          admin,
          conversationId,
          (convRow as ConversationConnectionHints | null) ?? null,
          destPhone,
          name,
        );
      }
    } catch (e) {
      console.warn('[onboarding-handoff] greeting (non-fatal):', String(e).slice(0, 160));
    }

    console.log(`[onboarding-handoff] OK: conversa ${conversationId} → agente CS ${csAgent.id} (org ${args.organizationId}). greeted=${greeted}`);
    return { ok: true, conversation_id: conversationId, cs_agent_id: csAgent.id, greeted };
  } catch (e) {
    console.warn('[onboarding-handoff] exception (non-fatal):', String(e).slice(0, 300));
    return { ok: false, skipped: 'exception' };
  }
}
