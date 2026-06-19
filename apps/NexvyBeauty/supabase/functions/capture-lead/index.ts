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
