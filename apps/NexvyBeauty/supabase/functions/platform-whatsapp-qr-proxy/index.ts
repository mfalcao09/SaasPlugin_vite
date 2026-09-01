// platform-whatsapp-qr-proxy — WhatsApp via QR (Z-API) do CRM de plataforma.
// Auth: super_admin via authenticatePlatformAgent.
// Motor Evolution Go removido (C residual 2026-09-01): só Z-API.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";
import { loadPlatformQrProviderConfig } from "../_shared/platform-qr-provider.ts";
import { handlePlatformZapiProxyAction } from "../_shared/platform-zapi-proxy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
      ? await req.json().catch(() => ({}))
      : {};

    const { errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      body,
    );
    if (errorResponse) return errorResponse;

    const action = body.action || new URL(req.url).searchParams.get("action");

    const qrCfg = await loadPlatformQrProviderConfig(supabase);
    if (qrCfg.provider !== "zapi") {
      return new Response(
        JSON.stringify({
          error: "evolution_motor_disabled",
          detail: "Platform WhatsApp QR is Z-API only. Set whatsapp_qr_provider=zapi.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const zapiRes = await handlePlatformZapiProxyAction({
      action: String(action || ""),
      body,
      supabase,
      corsHeaders,
      qrCfg,
      supabaseUrl,
    });
    if (zapiRes) return zapiRes;

    return new Response(
      JSON.stringify({ error: "Unknown or unsupported action", action }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("platform-whatsapp-qr-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
