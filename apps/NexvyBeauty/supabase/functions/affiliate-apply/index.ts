// Inscrição pública no programa de afiliados. Sem JWT.
// Cria affiliates.status='pending' — super-admin aprova em affiliate-admin.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseAffiliateApplication } from "../_shared/affiliate-apply-core.ts";
import { DEFAULT_COMMISSION_PCT } from "../_shared/affiliate-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const parsed = parseAffiliateApplication(await req.json());
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: affiliate, error } = await admin
      .from("affiliates")
      .insert({
        name: parsed.value.name,
        email: parsed.value.email,
        phone: parsed.value.phone,
        status: "pending",
        commission_pct: DEFAULT_COMMISSION_PCT,
        notes: parsed.value.notes,
      })
      .select("id, status")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ error: "Este e-mail já está na fila ou no programa." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, id: affiliate.id, status: affiliate.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
