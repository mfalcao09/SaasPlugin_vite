// platform-web-capi — web-CAPI (Conversions API, action_source:'website') da LP
// de vendas. Espelho SERVER-SIDE do Pixel de browser: recupera PageView/Lead dos
// visitantes que o adblock/ITP bloqueia no navegador, pra o público de
// remarketing não furar. Dedup com o browser pelo MESMO event_id (o browser manda
// via {eventID}; aqui mandamos o mesmo no event_id) — o Meta funde os dois.
//
// PÚBLICO por design (a LP é anônima) → CORS *, verify_jwt=false. Anti-abuso
// (Seção 11.3): whitelist de event_name + event_id obrigatório + clamp de tamanho.
// IP e user-agent são lidos dos HEADERS (server-side, mais confiáveis que o
// client). O token NUNCA sai do servidor.
//
// GATED OFF por default: WEB_CAPI_ENABLED != 'true' → DRY-RUN (monta o payload e
// devolve o que SERIA enviado, SEM tocar a rede). REUSA os secrets do CAPI já
// configurados: META_CAPI_TOKEN foi gerado PARA este pixel (META_CAPI_DATASET_ID ==
// 1024632956928840, confirmado por hash em 2026-08-02) — NÃO precisa token novo. A
// flag WEB_CAPI_ENABLED é DEDICADA (liga/desliga o web-CAPI independente do
// dispatcher CTWA, que usa CAPI_ENABLED).
//
// TODO(hardening): allowlist de Origin/Referer + rate-limit por IP quando sair do
// gated — endpoint público pode ser spammado pra inflar o público com lixo.

import { GRAPH_BASE } from '../_shared/meta-graph.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Só os eventos padrão do funil da LP. Barra lixo/abuso num endpoint público.
const ALLOWED_EVENTS = new Set(['PageView', 'Lead', 'ViewContent', 'InitiateCheckout', 'Contact']);

const clamp = (s: unknown, max = 512): string => (typeof s === 'string' ? s.slice(0, max) : '');

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    ''
  ).trim();
}

interface Body {
  event_name?: string;
  event_id?: string;
  event_source_url?: string;
  fbc?: string;
  fbp?: string;
  custom_data?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const eventName = clamp(body.event_name, 40);
  if (!ALLOWED_EVENTS.has(eventName)) return json({ error: 'event_not_allowed' }, 422);

  // Sem event_id não há dedup com o browser → recusa (evita duplo-contagem).
  const eventId = clamp(body.event_id, 100);
  if (!eventId) return json({ error: 'event_id_required' }, 422);

  // Reusa os secrets do CAPI já existentes (META_CAPI_TOKEN gerado para este pixel;
  // META_CAPI_DATASET_ID == pixel web). Flag dedicada p/ não acoplar ao CTVA.
  const enabled = (Deno.env.get('WEB_CAPI_ENABLED') ?? '').toLowerCase() === 'true';
  const token = Deno.env.get('META_CAPI_TOKEN') ?? '';
  const pixelId = Deno.env.get('META_CAPI_DATASET_ID') ?? '';
  const live = enabled && !!token && !!pixelId;

  // user_data: fbc/fbp (do client) + IP/UA (do servidor). CAPI NÃO hasheia esses
  // (só PII como email/telefone é SHA-256 — que não coletamos aqui).
  const userData: Record<string, unknown> = {};
  const fbc = clamp(body.fbc, 255);
  const fbp = clamp(body.fbp, 255);
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua.slice(0, 500);

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_id: eventId,
    user_data: userData,
  };
  const sourceUrl = clamp(body.event_source_url, 500);
  if (sourceUrl) event.event_source_url = sourceUrl;
  if (body.custom_data && typeof body.custom_data === 'object') {
    event.custom_data = body.custom_data;
  }

  const payload = { data: [event] };

  // Gated OFF → dry-run: devolve o payload que SERIA enviado, sem rede.
  if (!live) {
    return json({ ok: true, mode: 'dry_run', event_name: eventName, event_id: eventId, payload });
  }

  // Envio real. Token só no servidor; nunca no corpo logado.
  try {
    const url = `${GRAPH_BASE}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const respJson = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) {
      return json({ ok: false, mode: 'live', error: `graph_${resp.status}`, detail: respJson }, 502);
    }
    return json({
      ok: true,
      mode: 'live',
      event_name: eventName,
      event_id: eventId,
      events_received: respJson.events_received ?? null,
      fbtrace_id: respJson.fbtrace_id ?? null,
    });
  } catch (e) {
    return json({ ok: false, mode: 'live', error: String((e as Error)?.message ?? e).slice(0, 300) }, 502);
  }
});
