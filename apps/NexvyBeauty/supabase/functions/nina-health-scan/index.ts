// nina-health-scan — P2 · PR-A · A2
//
// Disparo PROATIVO da NINA (Sucesso, Suporte & Retenção). Varre as contas
// provisionadas e, para cada uma em RISCO (v1: renovação em D-7), reusa a
// conversa da cliente, pina current_agent_id = nina.id e dispara UMA mensagem
// de abertura calorosa. Quando a cliente responde, o platform-sales-brain
// conduz a Nina no MODO RETENÇÃO (RETENTION_RULE_BLOCK — vive no PR-B).
//
// ┌─ GATE (dedo no gatilho, igual ao P10) ────────────────────────────────────┐
// │ NINA_HEALTH_SCAN_ENABLED != 'true' → retorna {skipped:'flag_off'} sem      │
// │ efeito. O cron pode rodar todo dia sem tocar em nada até o Marcelo ligar.  │
// │ ⚠️ SÓ ligar DEPOIS do PR-B em produção (senão o brain trata a Nina como    │
// │ Bia/closer e ela venderia — contra a regra-mãe da Nina).                   │
// └────────────────────────────────────────────────────────────────────────────┘
//
// ⚠️ ÂNCORA DO D-7 A CONFIRMAR (blueprint §Decisão B): as colunas de renovação
// de `organizations` não estão versionadas no repo (drift). Modelamos o D-7 como
// `dias_desde(plan_activated_at) mod CICLO == CICLO - LEAD` — robusto tanto se
// plan_activated_at for bumpado na renovação quanto se não for (âncora de ciclo
// mensal). CICLO/LEAD são env. ANTES de ligar a flag: confirmar o modelo de
// billing real da Cakto e, se preciso, trocar SÓ computeRenewalPosition().
//
// Idempotência: não reaborda a mesma conversa se a Nina já falou nela nos
// últimos (CICLO - LEAD) dias (no máximo 1 abordagem por ciclo).
// Non-fatal por design: nunca lança; um erro numa conta não derruba a varredura.
//
// Auth: service-role (bearer/apikey) OU x-brain-secret (BRAIN_INTERNAL_SECRET) —
// mesmos autorizadores dos crons/EF internas. Nunca exposto ao cliente.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE, timingSafeEqual } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-brain-secret',
};

const PRODUCT_SLUG = 'nexvybeauty';
const DAY_MS = 86_400_000;

// Ciclo de cobrança e antecedência do sinal (env-configuráveis). Ver caveat no topo.
function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Auth: service-role (bearer OU apikey) ou x-brain-secret. Timing-safe. */
function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  const brainHeader = req.headers.get('x-brain-secret') ?? '';
  if (serviceKey && bearer && timingSafeEqual(bearer, serviceKey)) return true;
  if (serviceKey && apikey && timingSafeEqual(apikey, serviceKey)) return true;
  if (brainSecret && brainHeader && timingSafeEqual(brainHeader, brainSecret)) return true;
  return false;
}

/**
 * Posição no ciclo de cobrança, em dias, a partir de plan_activated_at.
 * Retorna null se não há data. A conta está em D-`lead` quando a posição bate
 * `cycle - lead`. ROBUSTO ao bump: `mod cycle` trata a ativação como âncora de
 * ciclo mensal, funcione ou não o re-provisionamento na renovação.
 * ⚠️ Único ponto a trocar se o modelo de billing real da Cakto for diferente.
 */
function computeRenewalPosition(planActivatedAt: string | null, nowMs: number, cycle: number): number | null {
  if (!planActivatedAt) return null;
  const t = Date.parse(planActivatedAt);
  if (!Number.isFinite(t)) return null;
  const daysSince = Math.floor((nowMs - t) / DAY_MS);
  if (daysSince < 0) return null;
  return daysSince % cycle;
}

/** Sender WhatsApp Cloud da plataforma: conexão 'active' resolvida UMA vez,
 *  reusada para todas as contas. Espelha deliverViaWhatsAppCloud do brain. */
async function makeWaSender(admin: SupabaseClient): Promise<(to: string | null, body: string) => Promise<{ ok: boolean; error?: string }>> {
  const { data: conn } = await admin
    .from('platform_crm_whatsapp_meta_connections')
    .select('phone_number_id, access_token_encrypted')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
    return async () => ({ ok: false, error: 'no_active_connection' });
  }
  const phoneNumberId = conn.phone_number_id as string;
  const token = await decryptSecret(conn.access_token_encrypted as string);
  return async (to: string | null, body: string) => {
    const digits = String(to ?? '').replace(/\D/g, '');
    if (!digits) return { ok: false, error: 'no_destination_phone' };
    try {
      const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: digits, type: 'text', text: { body } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: String((data as any)?.error?.message ?? res.status).slice(0, 160) };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 160) };
    }
  };
}

/** Mensagem de abertura da Nina (D-7). Curta, cuidado primeiro, 1 pergunta,
 *  ZERO venda. {nome} vira " Nome" ou "" (nunca "Oi !"). */
function ninaOpeningBubble(firstName: string): string {
  const nome = firstName ? ` ${firstName}` : '';
  return `Oi${nome}! Aqui é a Nina, do NexvyBeauty 💚 Passei pra saber como tá indo seu espaço — tá conseguindo aproveitar o sistema no dia a dia?`
    .replace(/\s{2,}/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // GATE — dedo no gatilho.
  const enabled = (Deno.env.get('NINA_HEALTH_SCAN_ENABLED') ?? '').toLowerCase() === 'true';
  if (!enabled) return json({ skipped: 'flag_off' });

  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const nowMs = Date.now();
  const CYCLE = envInt('NINA_RENEWAL_CYCLE_DAYS', 30);
  const LEAD = envInt('NINA_RENEWAL_LEAD_DAYS', 7);
  const targetPos = CYCLE - LEAD; // posição no ciclo que caracteriza "D-LEAD"
  const dedupDays = Math.max(1, CYCLE - LEAD); // no máx. 1 abordagem/ciclo

  // 1) Produto NexvyBeauty + a Nina (por nome, robusto ao id/agent_type).
  const { data: prod } = await admin
    .from('platform_crm_products')
    .select('id')
    .eq('slug', PRODUCT_SLUG)
    .maybeSingle();
  const productId = (prod as any)?.id ?? null;
  if (!productId) return json({ error: 'produto nexvybeauty não encontrado' }, 500);

  // active_in_whatsapp é OBRIGATÓRIO no filtro: o platform-sales-brain só
  // considera agentes is_active + active_in_whatsapp. Pinar uma Nina fora do
  // WhatsApp criaria um current_agent_id ÓRFÃO — a conversa cairia de volta na
  // Duda (SDR, em modo VENDA) para uma cliente que JÁ comprou. Melhor não pinar.
  const { data: ninaRow } = await admin
    .from('platform_crm_product_agents')
    .select('id, name, active_in_whatsapp')
    .eq('product_id', productId)
    .eq('is_active', true)
    .eq('active_in_whatsapp', true)
    .ilike('name', '%nina%')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const ninaId = (ninaRow as any)?.id ?? null;
  if (!ninaId) {
    return json({ error: 'agente Nina não encontrado (name ilike %nina% + is_active + active_in_whatsapp)' }, 500);
  }

  // 2) Contas ativas com plano ativado — filtra o D-LEAD em JS (posição no ciclo).
  const { data: orgs, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, cakto_customer_email, plan_status, plan_activated_at')
    .eq('plan_status', 'active')
    .not('plan_activated_at', 'is', null);
  if (orgErr) return json({ error: `query organizations: ${orgErr.message}` }, 500);

  const dueOrgs = ((orgs as Array<Record<string, any>>) ?? []).filter((o) => {
    const pos = computeRenewalPosition(o.plan_activated_at ?? null, nowMs, CYCLE);
    return pos === targetPos;
  });

  const sendWa = await makeWaSender(admin);

  let reached = 0, skippedNoConv = 0, skippedDedup = 0, failed = 0;
  const details: Array<Record<string, any>> = [];

  for (const org of dueOrgs) {
    try {
      // 3) Conversa da cliente: preferir o vínculo do handoff
      //    (provisioned_organization_id); fallback por e-mail → lead → conversa.
      let conv: Record<string, any> | null = null;
      const { data: linked } = await admin
        .from('platform_crm_conversations')
        .select('id, visitor_whatsapp, visitor_phone, visitor_name')
        .eq('provisioned_organization_id', org.id)
        .eq('channel', 'whatsapp')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      conv = (linked as Record<string, any> | null) ?? null;

      if (!conv) {
        const email = (org.cakto_customer_email ?? '').trim().toLowerCase();
        if (email) {
          const { data: leads } = await admin
            .from('platform_crm_leads')
            .select('id')
            .ilike('email', email)
            .limit(10);
          const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
          const orParts = [`visitor_email.ilike.${email}`];
          if (leadIds.length) orParts.push(`lead_id.in.(${leadIds.join(',')})`);
          const { data: byEmail } = await admin
            .from('platform_crm_conversations')
            .select('id, visitor_whatsapp, visitor_phone, visitor_name')
            .eq('channel', 'whatsapp')
            .eq('product_id', productId)
            .or(orParts.join(','))
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(1);
          conv = (byEmail?.[0] as Record<string, any> | null) ?? null;
        }
      }

      if (!conv?.id) {
        skippedNoConv++;
        details.push({ org: org.id, result: 'no_conversation' });
        continue;
      }

      // 4) Idempotência: a Nina já abordou esta conversa dentro do ciclo?
      const sinceIso = new Date(nowMs - dedupDays * DAY_MS).toISOString();
      const { data: prior } = await admin
        .from('platform_crm_messages')
        .select('id')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'bot')
        .filter('metadata->>proactive_outreach', 'eq', 'nina')
        .gte('created_at', sinceIso)
        .limit(1)
        .maybeSingle();
      if (prior?.id) {
        skippedDedup++;
        details.push({ org: org.id, conversation: conv.id, result: 'already_reached_this_cycle' });
        continue;
      }

      // 5) Pin da Nina + dispara a abertura, persistindo ANTES de entregar.
      await admin
        .from('platform_crm_conversations')
        .update({ current_agent_id: ninaId })
        .eq('id', conv.id);

      const firstName = String(conv.visitor_name ?? '').trim().split(/\s+/)[0] || '';
      const body = ninaOpeningBubble(firstName);
      const { error: msgErr } = await admin.from('platform_crm_messages').insert({
        conversation_id: conv.id,
        direction: 'outbound',
        sender_type: 'bot',
        content: body,
        content_type: 'text',
        metadata: { channel: 'whatsapp_cloud', proactive_outreach: 'nina', signal: 'renewal_d_minus_lead', lead_days: LEAD },
      });
      if (msgErr) {
        failed++;
        details.push({ org: org.id, conversation: conv.id, result: 'persist_failed', error: msgErr.message });
        continue;
      }

      const dest = conv.visitor_whatsapp ?? conv.visitor_phone ?? null;
      const sent = await sendWa(dest, body);
      reached++;
      details.push({ org: org.id, conversation: conv.id, result: 'reached', delivered: sent.ok, deliver_error: sent.error ?? null });
    } catch (e) {
      failed++;
      details.push({ org: org.id, result: 'exception', error: String(e).slice(0, 200) });
    }
  }

  return json({
    ok: true,
    config: { cycle_days: CYCLE, lead_days: LEAD, target_position: targetPos },
    scanned: (orgs as any[])?.length ?? 0,
    due: dueOrgs.length,
    reached,
    skipped_no_conversation: skippedNoConv,
    skipped_dedup: skippedDedup,
    failed,
    details,
  });
});
