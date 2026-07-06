// ─── capture-lead ───────────────────────────────────────────────────────────
// Captura pública do lead da LP de vendas (anônimo) com tagueamento de canal
// (afiliado) + plataforma (UTM). Roda com SERVICE_ROLE: resolve ref→affiliate_id
// e grava o lead em sales_leads ANTES do checkout (provider-agnóstico). A
// atribuição mora aqui, na nossa camada — o meio de pagamento é só um adaptador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CaptureBody {
  name?: string;
  email?: string;
  whatsapp?: string;
  instagram?: string;
  main_pain?: string;
  salon_name?: string;
  accept?: boolean;
  terms_version?: string;
  privacy_version?: string;
  consent_text?: string;
  tracking?: Record<string, string>;
}

const clean = (s: unknown, max = 255): string =>
  typeof s === "string" ? s.trim().slice(0, max) : "";
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const onlyDigits = (s: string) => s.replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as CaptureBody;
    const name = clean(body.name, 120);
    const email = clean(body.email, 255).toLowerCase();
    const whatsapp = clean(body.whatsapp, 25);

    // validação mínima (anti-lixo) — Seção 11.3
    if (!name || !isEmail(email) || onlyDigits(whatsapp).length < 10) {
      return new Response(JSON.stringify({ error: "Dados inválidos. Confira nome, e-mail e WhatsApp." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const t = body.tracking ?? {};
    const ref = clean(t.ref, 60) || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // resolve canal (afiliado) server-side — nunca confiar no client
    let affiliateId: string | null = null;
    if (ref) {
      const { data } = await admin.rpc("resolve_affiliate_ref", { p_ref: ref });
      affiliateId = (data as string | null) ?? null;
    }

    const row = {
      contact_name: name,
      email,
      whatsapp,
      phone: whatsapp,
      company_name: clean(body.salon_name, 120) || null,
      segment: "salao",
      main_challenge: clean(body.main_pain, 500) || null,
      message: body.instagram ? `Instagram: ${clean(body.instagram, 120)}` : null,
      status: "novo",
      lead_channel: ref ? `afiliado:${ref}` : "organico",
      ref_code: ref,
      affiliate_id: affiliateId,
      utm_source: clean(t.utm_source, 120) || null,
      utm_medium: clean(t.utm_medium, 120) || null,
      utm_campaign: clean(t.utm_campaign, 200) || null,
      utm_term: clean(t.utm_term, 120) || null,
      utm_content: clean(t.utm_content, 200) || null,
      src: clean(t.src, 120) || null,
      sck: clean(t.sck, 200) || null,
      fbc: clean(t.fbc, 255) || null,
      fbp: clean(t.fbp, 255) || null,
      referrer_url: clean(t.referrer_url, 500) || null,
      landing_page: clean(t.landing_page, 500) || null,
    };

    const { data: inserted, error } = await admin
      .from("sales_leads")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;

    // ── Prova de consentimento LGPD (best-effort; nunca bloqueia a captura) ──
    if (body.accept === true) {
      try {
        const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ||
          req.headers.get("x-real-ip") ||
          req.headers.get("cf-connecting-ip") || "").trim() || null;
        const ua = req.headers.get("user-agent");

        let country: string | null = null, region: string | null = null, city: string | null = null;
        if (ip) {
          try {
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 2500);
            const geo = await fetch(`https://ipapi.co/${ip}/json/`, { signal: ctrl.signal });
            clearTimeout(to);
            if (geo.ok) {
              const g = await geo.json();
              country = g.country_name ?? g.country ?? null;
              region = g.region ?? null;
              city = g.city ?? null;
            }
          } catch { /* geo e opcional */ }
        }

        await admin.from("lgpd_consents").insert({
          lead_id: inserted.id,
          email,
          scope: "lead_capture",
          accepted: true,
          terms_version: clean(body.terms_version, 40) || null,
          privacy_version: clean(body.privacy_version, 40) || null,
          consent_text: clean(body.consent_text, 1000) || null,
          ip,
          user_agent: ua ? ua.slice(0, 500) : null,
          country, region, city,
          metadata: {
            referrer_url: clean(t.referrer_url, 500) || null,
            landing_page: clean(t.landing_page, 500) || null,
            ref_code: ref,
          },
        });
      } catch (_) { /* consentimento best-effort: nao derruba a captura do lead */ }
    }

    return new Response(
      JSON.stringify({ ok: true, lead_id: inserted.id, affiliate_resolved: !!affiliateId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
