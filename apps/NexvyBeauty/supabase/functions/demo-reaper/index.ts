// ============================================================================
// demo-reaper — ESTEIRA F3: cron horário do TTL das orgs demo (72h).
//
// Auth: service_role (o cron injeta a service_role_key do vault, mesmo padrão do
// nina-health-scan-daily). NÃO público.
//
//   T-24h: orgs demo expirando nas próximas 24h e ainda não avisadas → aviso no
//          WhatsApp ("sua demo expira amanhã") + marca demo_warned_at. Best-effort.
//   T-0:   orgs demo com demo_expires_at < now() → chama wipe-demo-org (que faz o
//          wipe LGPD verificado). Idempotente.
//   Prune: limpa demo_start_attempts com mais de 24h.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer || bearer !== SERVICE) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const nowIso = new Date().toISOString();
    const in24hIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // ---- T-0: expiradas → wipe ----
    const { data: expired } = await admin.from("organizations")
      .select("id").eq("plan_status", "demo").lt("demo_expires_at", nowIso).limit(50);
    let wiped = 0;
    const wipeErrors: string[] = [];
    for (const o of expired ?? []) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/wipe-demo-org`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({ organization_id: o.id }),
        });
        if (r.ok) wiped++; else wipeErrors.push(`${o.id}:${r.status}`);
      } catch (e: any) { wipeErrors.push(`${o.id}:${e?.message}`); }
    }

    // ---- T-24h: aviso (best-effort) ----
    const { data: expiring } = await admin.from("organizations")
      .select("id, phone").eq("plan_status", "demo")
      .gte("demo_expires_at", nowIso).lt("demo_expires_at", in24hIso)
      .is("demo_warned_at", null).limit(50);
    let warned = 0;
    for (const o of expiring ?? []) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({
            organization_id: o.id, type: "text", to: o.phone,
            payload: { text: "Sua demonstração do NexvyBeauty expira amanhã — depois disso seus dados são apagados automaticamente. Se quiser manter a análise, é só assinar um plano. 💜" },
          }),
        });
        await admin.from("organizations").update({ demo_warned_at: nowIso }).eq("id", o.id);
        warned++;
      } catch (_) { /* best-effort */ }
    }

    // ---- Prune rate-limit antigo ----
    await admin.from("demo_start_attempts").delete().lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

    console.log(`[demo-reaper] wiped=${wiped} warned=${warned} errors=${wipeErrors.length}`);
    return json({ ok: true, wiped, warned, wipe_errors: wipeErrors });
  } catch (err: any) {
    console.error("[demo-reaper] error:", err?.message || String(err));
    return json({ error: err?.message || "internal_error" }, 500);
  }
});
