// ============================================================================
// demo-start — ESTEIRA F1: cria a org provisória (demo) + o link do wizard.
//
// Endpoint PÚBLICO (verify_jwt=false). A lead pré-venda chama com nome + whats
// (+ email/ticket opcionais). Provisiona:
//   - organizations {plan_status:'demo', cakto_customer_email, demo_expires_at:+72h}
//   - onboarding_submissions {mode:'demo', token_hash, expires_at} — token 32B
//     base64url + sha256 hex (mesmo esquema de create_onboarding_link, mas SEM o
//     gate super_admin, reproduzido aqui com service_role).
// Devolve /implantacao/<token> (a rota pública do wizard já existe).
//
// Anti-abuso (R4): honeypot (campo isca `website`) + rate-limit DURÁVEL por
// telefone (1/min) e por IP (10/h) via public.demo_start_attempts. NÃO cria
// instância Evolution aqui (lazy no demo-evolution `connect` — D6).
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

const clean = (v: unknown, max = 200): string =>
  (typeof v === "string" ? v.trim().slice(0, max) : "");

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || "").trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") || "unknown";
}

// 32 bytes aleatórios → base64url (mesmo formato de create_onboarding_link)
function makeToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TTL_MS = 72 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({} as any));

    // Honeypot: campo isca que humano nunca preenche. Se veio → responde 200
    // benigno SEM criar nada (não revela a defesa).
    if (clean(body.website, 100) !== "") {
      return json({ ok: true, url: null });
    }

    const nome = clean(body.nome ?? body.nome_fantasia, 120);
    const phone = normalizePhoneBR(clean(body.whatsapp ?? body.telefone, 30));
    const email = clean(body.email, 160).toLowerCase() || null;
    if (!nome) return json({ error: "nome_obrigatorio" }, 400);
    if (!phone) return json({ error: "whatsapp_invalido" }, 400);

    const ip = clientIp(req);
    const nowMs = Date.now();

    // ---- Rate-limit durável ----
    // mesmo telefone em <60s → 429 (check binário do roadmap)
    const { count: samePhone } = await admin
      .from("demo_start_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", new Date(nowMs - 60_000).toISOString());
    if ((samePhone ?? 0) > 0) return json({ error: "rate_limited", scope: "phone" }, 429);

    // mesmo IP >=10 na última hora → 429
    if (ip && ip !== "unknown") {
      const { count: sameIp } = await admin
        .from("demo_start_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", new Date(nowMs - 3_600_000).toISOString());
      if ((sameIp ?? 0) >= 10) return json({ error: "rate_limited", scope: "ip" }, 429);
    }

    await admin.from("demo_start_attempts").insert({ ip, phone });

    // ---- Cria a org demo ----
    const expiresIso = new Date(nowMs + TTL_MS).toISOString();
    const ticket = Number(body.ticket_medio);
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: nome,
        plan_status: "demo",
        email,
        phone,
        cakto_customer_email: email,
        demo_expires_at: expiresIso,
        enabled_modules: [],
        // slug deixado NULL de propósito (página pública /s/<slug> dá 404 na demo)
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      console.error("[demo-start] org insert error:", orgErr?.message);
      return json({ error: "org_create_failed" }, 500);
    }

    // ---- Token + submission mode='demo' ----
    const token = makeToken();
    const tokenHash = await sha256Hex(token);
    const payload = {
      empresa: {
        nome_fantasia: nome,
        whatsapp: phone,
        segmento: clean(body.segmento, 80) || null,
        ticket_medio: Number.isFinite(ticket) && ticket > 0 ? ticket : null,
      },
    };
    const { error: subErr } = await admin.from("onboarding_submissions").insert({
      organization_id: org.id,
      token_hash: tokenHash,
      mode: "demo",
      status: "draft",
      expires_at: expiresIso,
      payload,
    });
    if (subErr) {
      // limpa a org órfã se a submission falhou (idempotência)
      await admin.from("organizations").delete().eq("id", org.id);
      console.error("[demo-start] submission insert error:", subErr.message);
      return json({ error: "submission_create_failed" }, 500);
    }

    console.log(`[demo-start] demo org=${org.id} phone=${phone} email=${email ?? "-"}`);
    return json({ ok: true, url: `/implantacao/${token}`, organization_id: org.id });
  } catch (err: any) {
    console.error("[demo-start] error:", err?.message || String(err));
    return json({ error: err?.message || "internal_error" }, 500);
  }
});
