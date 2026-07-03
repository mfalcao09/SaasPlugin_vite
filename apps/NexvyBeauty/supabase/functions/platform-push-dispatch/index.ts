// platform-push-dispatch — internal dispatcher for the PLATFORM CRM.
// Invoked server-to-server (service role) by other platform edges.
// v1: NO preference_key gate — broadcasts to all subscribed super-admins.
// Body: { title, body?, url?, tag?, icon?, badge?, data?, requireInteraction?, user_ids? }
// (Telegram fan-out is added in D9.4.)

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPlatformPush } from "../_shared/platform-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      title, body: text, url, tag, icon, badge, data, requireInteraction, user_ids,
    } = body || {};

    if (!title) {
      return new Response(JSON.stringify({ error: "title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await sendPlatformPush(
      admin,
      { title, body: text || "", url, tag, icon, badge, data, requireInteraction },
      Array.isArray(user_ids) ? user_ids : undefined,
    );

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[platform-push-dispatch]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
