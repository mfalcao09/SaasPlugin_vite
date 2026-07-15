// ============================================================================
// demo-evolution — ESTEIRA F1/F3: o motor server-side da demo pré-venda.
//
// Endpoint PÚBLICO (verify_jwt=false). A lead anônima NÃO pode chamar o
// evolution-proxy (exige JWT admin); esta EF replica os fetches do Evolution
// server-side com service_role (config vem de platform_settings, não de env).
//
// AUTH (2 vias):
//   a) token + session_token do onboarding_submissions mode='demo' (a lead)
//   b) Bearer == SERVICE_ROLE_KEY + organization_id no body (interno: F2/Duda)
//
// ACTIONS:
//   accept           → grava lgpd_consents scope 'demo_whatsapp_scan' (prova:
//                      ip/ua/geo-por-CDN/versões/texto verbatim)
//   connect          → cria a instância Evolution lazy (syncFullHistory) + QR base64
//   status           → estado da conexão + QR corrente
//   report           → sumidos (ultima_interacao_wa entre 45 e 180 dias) × ticket
//   send_report      → dispara o resumo no WhatsApp da lead (evolution-send)
//   request_deletion → grava deletion_requested_at + DESCONECTA a instância na
//                      hora (B2: cessa análise de novas msgs); NÃO apaga (TTL 72h)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhoneBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const clean = (v: unknown, max = 500): string =>
  (typeof v === "string" ? v.trim().slice(0, max) : "");

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Evolution (mesma fonte de config do evolution-proxy: platform_settings) --
interface EvoConfig { url: string; globalApiKey: string }
async function getEvoConfig(admin: any): Promise<EvoConfig | null> {
  const { data } = await admin.from("platform_settings")
    .select("evolution_go_url, evolution_go_global_api_key").limit(1).maybeSingle();
  if (!data?.evolution_go_url || !data?.evolution_go_global_api_key) return null;
  return { url: String(data.evolution_go_url).replace(/\/$/, ""), globalApiKey: String(data.evolution_go_global_api_key) };
}
async function evoFetch(config: EvoConfig, path: string, init: RequestInit = {}, instanceToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: instanceToken || config.globalApiKey,
    ...(init.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try { res = await fetch(`${config.url}${path}`, { ...init, headers }); }
  catch (err: any) { return { ok: false, status: 0, body: null as any, message: `conn fail: ${err?.message}` }; }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body, message: res.ok ? undefined : (body?.message || body?.error || `status ${res.status}`) };
}
// QR: separa "data:image...|2@pairing" e varre chaves aninhadas (igual evolution-proxy)
function normalizeQr(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const v = s.includes("|") ? s.split("|")[0] : s;
  return v && v.length > 8 ? v : null;
}
function extractQr(body: any): string | null {
  if (!body) return null;
  const cands = [body.base64, body.qrcode, body.qr, body.code, body.QRCode,
    body?.data?.base64, body?.data?.qrcode, body?.data?.qr, body?.instance?.qrcode];
  for (const c of cands) { const q = normalizeQr(c); if (q) return q; }
  return null;
}
// geo por CDN (sem outbound: a borda já resolveu; IP nunca sai — B1-compliant)
function cdnGeo(req: Request) {
  const h = (n: string) => (req.headers.get(n) || "").trim() || null;
  return {
    city: h("cf-ipcity") || h("x-vercel-ip-city") || null,
    region: h("cf-region") || h("cf-region-code") || h("x-vercel-ip-country-region") || null,
    country: h("cf-ipcountry") || h("x-vercel-ip-country") || null,
  };
}
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || "").trim() || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || null;
}

const REPORT_MIN_DAYS = 45;   // sumiu há PELO MENOS 45 dias
const REPORT_MAX_DAYS = 180;  // ...e no MÁXIMO 180 (falou "nos últimos meses")
const DEFAULT_TICKET = 100;

// Texto canônico do consentimento (5.2 do blueprint) — fallback se o front não
// enviar o texto exibido. O correto é gravar o que foi MOSTRADO (body.consent_text).
const CONSENT_TEXT_DEFAULT =
  "Ao conectar seu WhatsApp, você autoriza o NexvyBeauty a: (1) acessar seu histórico de conversas dos últimos meses para identificar clientes que não retornaram e estimar o valor recuperável; (2) manter esse acesso por até 72 horas enquanto sua conexão permanecer ativa, analisando inclusive novas mensagens do período; (3) reter os dados importados por até 72 horas mesmo que você solicite a exclusão antes — a remoção é agendada para o fim desse prazo, não imediata; (4) registrar seu IP e localização aproximada como prova deste consentimento. Você declara ter base legítima para compartilhar os dados de contato das suas clientes, atuando o NexvyBeauty como operador. A retenção de 72h é condição informada e aceita deste consentimento.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));
    const action = clean(body.action, 40);

    // ---- AUTH ----
    let orgId: string | null = null;
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (bearer && bearer === SERVICE) {
      orgId = clean(body.organization_id, 40) || null;      // via interno (F2/Duda)
    } else {
      const token = clean(body.token, 200);
      const sessionToken = clean(body.session_token, 200);
      if (!token || !sessionToken) return json({ error: "unauthorized" }, 401);
      const tokenHash = await sha256Hex(token);
      const { data: row } = await admin.from("onboarding_submissions")
        .select("organization_id, session_token, mode, revoked_at, expires_at, status")
        .eq("token_hash", tokenHash).maybeSingle();
      if (!row) return json({ error: "invalid_token" }, 401);
      if (row.mode !== "demo") return json({ error: "not_a_demo" }, 403);
      if (row.revoked_at) return json({ error: "link_revoked" }, 403);
      if (row.expires_at && new Date(row.expires_at) < new Date()) return json({ error: "expired" }, 403);
      if (!row.session_token || row.session_token !== sessionToken) return json({ error: "link_already_in_use" }, 403);
      orgId = row.organization_id;
    }
    if (!orgId) return json({ error: "unauthorized" }, 401);

    // Guard: só age sobre org demo (jamais toca org paga)
    const { data: org } = await admin.from("organizations")
      .select("id, name, phone, email, plan_status, demo_expires_at").eq("id", orgId).maybeSingle();
    if (!org) return json({ error: "org_not_found" }, 404);
    if (org.plan_status !== "demo") return json({ error: "not_a_demo_org" }, 403);

    // ------------------------------------------------------------------ accept
    if (action === "accept") {
      const geo = cdnGeo(req);
      const { error } = await admin.from("lgpd_consents").insert({
        email: org.email,
        scope: "demo_whatsapp_scan",
        accepted: true,
        consent_text: clean(body.consent_text, 2000) || CONSENT_TEXT_DEFAULT,
        terms_version: clean(body.terms_version, 40) || null,
        privacy_version: clean(body.privacy_version, 40) || null,
        ip: clientIp(req),
        user_agent: (req.headers.get("user-agent") || "").slice(0, 500) || null,
        city: geo.city, region: geo.region, country: geo.country,
        metadata: { organization_id: org.id, source: "demo_wizard" },
      });
      if (error) { console.error("[demo-evolution accept] ", error.message); return json({ error: "consent_failed" }, 500); }
      return json({ ok: true });
    }

    // ----------------------------------------------------------------- connect
    if (action === "connect") {
      const config = await getEvoConfig(admin);
      if (!config) return json({ error: "evolution_unconfigured" }, 500);

      // reusa instância existente da org, senão cria (lazy — D6)
      let { data: inst } = await admin.from("evolution_instances")
        .select("id, name, instance_id, instance_token, status")
        .eq("organization_id", org.id).order("created_at", { ascending: true }).limit(1).maybeSingle();

      if (!inst) {
        const base = (org.name || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "demo";
        const finalName = `demo-${base}-${org.id.slice(0, 8)}`.slice(0, 50);
        const generatedToken = crypto.randomUUID();
        const createRes = await evoFetch(config, "/instance/create", {
          method: "POST",
          body: JSON.stringify({ instanceName: finalName, integration: "WHATSAPP-BAILEYS", token: generatedToken, syncFullHistory: true }),
        });
        if (!createRes.ok) return json({ error: createRes.message || "instance_create_failed" }, 502);
        const created = createRes.body?.instance ?? createRes.body?.data ?? createRes.body ?? {};
        const uuid = created?.instanceId ?? created?.id ?? created?.uuid ?? finalName;
        const instanceToken =
          (typeof createRes.body?.hash === "string" ? createRes.body.hash : null) ??
          createRes.body?.hash?.apikey ?? created?.token ?? created?.apikey ?? generatedToken;
        const { data: insRow, error: insErr } = await admin.from("evolution_instances").insert({
          organization_id: org.id, name: finalName, instance_id: uuid, instance_token: instanceToken,
          status: "disconnected", is_default: true, created_by_super_admin: false,
          metadata: { instance_uuid: uuid, instance_name: finalName, created_via: "demo_wizard", remote: createRes.body },
        }).select("id, name, instance_id, instance_token, status").single();
        if (insErr || !insRow) { console.error("[demo-evolution connect] insert ", insErr?.message); return json({ error: "instance_persist_failed" }, 500); }
        inst = insRow;
        // webhook → evolution-webhook (mesmo endpoint dos tenants; encaminha *_SET → history-sync)
        const wh = await evoFetch(config, `/webhook/set/${encodeURIComponent(finalName)}`, {
          method: "POST",
          body: JSON.stringify({ webhook: { enabled: true, url: `${SUPABASE_URL}/functions/v1/evolution-webhook`,
            events: ["MESSAGES_SET","MESSAGES_UPSERT","MESSAGES_UPDATE","MESSAGES_DELETE","CHATS_SET","CONTACTS_SET","CONNECTION_UPDATE","QRCODE_UPDATED","SEND_MESSAGE"] } }),
        }, instanceToken);
        await admin.from("evolution_instances").update({ webhook_subscribed: wh.ok }).eq("id", inst.id);
      }

      // pega o QR (GET /instance/connect/{name}) com polling curto
      const nm = encodeURIComponent(inst.name);
      let qr: string | null = null;
      const res = await evoFetch(config, `/instance/connect/${nm}`, { method: "GET" }, inst.instance_token);
      qr = extractQr(res.body);
      for (let i = 0; !qr && i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await evoFetch(config, `/instance/connect/${nm}`, { method: "GET" }, inst.instance_token);
        qr = extractQr(p.body);
      }
      if (qr) await admin.from("evolution_instances").update({ status: "qr_pending", qr_code: qr, qr_code_updated_at: new Date().toISOString() }).eq("id", inst.id);
      return json({ ok: true, instance_id: inst.id, qr_code: qr });
    }

    // ------------------------------------------------------------------ status
    if (action === "status") {
      const { data: inst } = await admin.from("evolution_instances")
        .select("id, name, instance_token, status, qr_code").eq("organization_id", org.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!inst) return json({ ok: true, status: "no_instance", qr_code: null });
      const config = await getEvoConfig(admin);
      let state = inst.status;
      if (config) {
        const info = await evoFetch(config, `/instance/connectionState/${encodeURIComponent(inst.name)}`, { method: "GET" }, inst.instance_token);
        const s = info?.body?.instance?.state ?? info?.body?.state ?? null;
        if (s === "open") { state = "connected"; await admin.from("evolution_instances").update({ status: "connected", qr_code: null, last_connected_at: new Date().toISOString() }).eq("id", inst.id); }
      }
      return json({ ok: true, status: state, qr_code: state === "connected" ? null : inst.qr_code });
    }

    // ------------------------------------------------------------------ report
    if (action === "report") {
      const now = Date.now();
      const maxIso = new Date(now - REPORT_MIN_DAYS * 86400000).toISOString(); // borda "mais recente" (>=45d)
      const minIso = new Date(now - REPORT_MAX_DAYS * 86400000).toISOString(); // borda "mais antiga" (<=180d)
      // ticket do payload da submission demo (fonte de verdade), senão default
      const { data: sub } = await admin.from("onboarding_submissions")
        .select("payload").eq("organization_id", org.id).eq("mode", "demo")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ticketRaw = Number(sub?.payload?.empresa?.ticket_medio);
      const ticket = Number.isFinite(ticketRaw) && ticketRaw > 0 ? ticketRaw : DEFAULT_TICKET;

      const { count } = await admin.from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("ultima_interacao_wa", minIso).lte("ultima_interacao_wa", maxIso);
      const sumidos = count ?? 0;

      const { data: items } = await admin.from("clientes")
        .select("nome, telefone_normalizado, ultima_interacao_wa")
        .eq("organization_id", org.id)
        .gte("ultima_interacao_wa", minIso).lte("ultima_interacao_wa", maxIso)
        .order("ultima_interacao_wa", { ascending: true }).limit(12);

      const cards = (items ?? []).map((c: any) => ({
        name: c.nome || "Cliente",
        phone: c.telefone_normalizado,
        dealValue: ticket,
        reason: `Sumiu há ${Math.floor((now - new Date(c.ultima_interacao_wa).getTime()) / 86400000)} dias`,
      }));
      return json({ ok: true, count: sumidos, total: sumidos * ticket, ticket, items: cards });
    }

    // -------------------------------------------------------------- send_report
    if (action === "send_report") {
      const { data: inst } = await admin.from("evolution_instances")
        .select("id, status").eq("organization_id", org.id).eq("status", "connected")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const to = normalizePhoneBR(org.phone || "");
      if (!inst || !to) return json({ error: "no_connected_instance_or_phone" }, 400);
      const text = clean(body.text, 1500) || "Seu relatório do NexvyBeauty está pronto.";
      const link = clean(body.report_url, 500);
      const invoke = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ organization_id: org.id, instance_id: inst.id, type: link ? "link" : "text", to, payload: link ? { text, link } : { text } }),
      });
      const okSend = invoke.ok;
      return json({ ok: okSend });
    }

    // --------------------------------------------------------- request_deletion
    if (action === "request_deletion") {
      await admin.from("organizations").update({ deletion_requested_at: new Date().toISOString() }).eq("id", org.id);
      // B2: desconecta a instância na hora (cessa análise de msgs novas). NÃO apaga.
      const { data: inst } = await admin.from("evolution_instances")
        .select("name, instance_token").eq("organization_id", org.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const config = await getEvoConfig(admin);
      if (inst && config) {
        await evoFetch(config, `/instance/logout/${encodeURIComponent(inst.name)}`, { method: "DELETE" }, inst.instance_token);
        await admin.from("evolution_instances").update({ status: "disconnected", qr_code: null }).eq("organization_id", org.id);
      }
      return json({ ok: true, scheduled_for_ttl: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err: any) {
    console.error("[demo-evolution] error:", err?.message || String(err));
    return json({ error: err?.message || "internal_error" }, 500);
  }
});
