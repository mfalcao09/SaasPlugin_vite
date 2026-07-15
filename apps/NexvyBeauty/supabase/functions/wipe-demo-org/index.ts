// ============================================================================
// wipe-demo-org — ESTEIRA F3: wipe LGPD COMPLETO da org demo (art. 16/18).
//
// Auth: service_role apenas (chamado pelo demo-reaper / interno). NÃO público.
// Guard duro: só age se plan_status='demo'.
//
// 8 passos (blueprint 5.4), servidor Evolution PRIMEIRO:
//   1. Evolution: por instância → logout + delete + VERIFICA via fetchInstances
//      (o padrão atual engole erro; wipe best-effort é furo LGPD — a sessão
//       Baileys da lead ficaria viva no VPS).
//   2. Storage: remove objetos por prefixo (chat-media whatsapp-inbound/{org}/,
//      onboarding-uploads, company-logos, avatars).
//   3-7. DB: RPC wipe_demo_org_data (replication_role, 136 base tables + filhas,
//      retém lgpd_consents/sales_leads/platform_crm_*/platform_audit_logs).
//   8. Audit: platform_audit_logs 'demo_org_wiped' com contagens + verificação.
// Idempotente: termina removendo a org → re-execução vira no-op (guard não acha demo).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface EvoConfig { url: string; globalApiKey: string }
async function getEvoConfig(admin: any): Promise<EvoConfig | null> {
  const { data } = await admin.from("platform_settings")
    .select("evolution_go_url, evolution_go_global_api_key").limit(1).maybeSingle();
  if (!data?.evolution_go_url || !data?.evolution_go_global_api_key) return null;
  return { url: String(data.evolution_go_url).replace(/\/$/, ""), globalApiKey: String(data.evolution_go_global_api_key) };
}
async function evoFetch(config: EvoConfig, path: string, method: string, instanceToken?: string) {
  try {
    const res = await fetch(`${config.url}${path}`, { method, headers: { "Content-Type": "application/json", apikey: instanceToken || config.globalApiKey } });
    const text = await res.text();
    let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
  } catch (err: any) { return { ok: false, status: 0, body: null, message: err?.message }; }
}

const STORAGE_TARGETS: Array<{ bucket: string; prefix: (org: string) => string }> = [
  { bucket: "chat-media", prefix: (o) => `whatsapp-inbound/${o}` },
  { bucket: "onboarding-uploads", prefix: (o) => `${o}` },
  { bucket: "company-logos", prefix: (o) => `${o}` },
  { bucket: "avatars", prefix: (o) => `${o}` },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer || bearer !== SERVICE) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));
    const orgId = typeof body.organization_id === "string" ? body.organization_id : "";
    if (!orgId) return json({ error: "organization_id_required" }, 400);

    // GUARD: só org demo
    const { data: org } = await admin.from("organizations")
      .select("id, plan_status").eq("id", orgId).maybeSingle();
    if (!org) return json({ ok: true, noop: "org_not_found" });      // idempotente
    if (org.plan_status !== "demo") return json({ error: "not_a_demo_org" }, 403);

    // ---- 1) Evolution: delete VERIFICADO por instância ----
    const config = await getEvoConfig(admin);
    const { data: instances } = await admin.from("evolution_instances")
      .select("name, instance_token").eq("organization_id", orgId);
    const evolution: Array<{ name: string; deleted: boolean; verified_gone: boolean }> = [];
    if (config && instances?.length) {
      for (const inst of instances) {
        const nm = encodeURIComponent(inst.name);
        await evoFetch(config, `/instance/logout/${nm}`, "DELETE", inst.instance_token);
        const del = await evoFetch(config, `/instance/delete/${nm}`, "DELETE", inst.instance_token);
        // VERIFICA: a instância não pode mais aparecer no fetchInstances
        const list = await evoFetch(config, `/instance/fetchInstances`, "GET");
        const arr = Array.isArray(list.body) ? list.body : (list.body?.instances ?? []);
        const stillThere = (arr as any[]).some((i) =>
          i?.name === inst.name || i?.instance?.instanceName === inst.name || i?.instanceName === inst.name);
        evolution.push({ name: inst.name, deleted: del.ok, verified_gone: !stillThere });
      }
    }

    // ---- 2) Storage: remove por prefixo (best-effort) ----
    const storage: Record<string, number> = {};
    for (const t of STORAGE_TARGETS) {
      try {
        const { data: files } = await admin.storage.from(t.bucket).list(t.prefix(orgId), { limit: 1000 });
        if (files?.length) {
          const paths = files.map((f: any) => `${t.prefix(orgId)}/${f.name}`);
          await admin.storage.from(t.bucket).remove(paths);
          storage[t.bucket] = paths.length;
        }
      } catch { /* bucket pode não existir — best-effort */ }
    }

    // ---- 3-7) DB wipe (RPC) ----
    const { data: dbRes, error: rpcErr } = await admin.rpc("wipe_demo_org_data", { p_org: orgId });
    if (rpcErr) { console.error("[wipe-demo-org] rpc error:", rpcErr.message); return json({ error: "db_wipe_failed", detail: rpcErr.message }, 500); }

    // ---- 8) Audit da orquestração (a org já não existe — entity_id é só o uuid) ----
    const allVerified = evolution.every((e) => e.verified_gone);
    try {
      await admin.from("platform_audit_logs").insert({
        action: "demo_org_wiped",
        entity_type: "organization",
        entity_id: orgId,
        metadata: { db: dbRes, evolution, evolution_all_verified: allVerified, storage, wiped_at: new Date().toISOString() },
      });
    } catch (_) { /* audit non-fatal */ }

    return json({ ok: true, organization_id: orgId, db: dbRes, evolution, evolution_all_verified: allVerified, storage });
  } catch (err: any) {
    console.error("[wipe-demo-org] error:", err?.message || String(err));
    return json({ error: err?.message || "internal_error" }, 500);
  }
});
