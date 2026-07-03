// platform-push-dispatch — internal dispatcher for the PLATFORM CRM.
// Invoked server-to-server (service role) by other platform edges.
// v1: NO preference_key gate — broadcasts to all subscribed super-admins.
// Fans out to BOTH Web Push and Telegram, best-effort: one channel failing
// does NOT stop the other (both run via Promise.all, each swallows its errors).
// Body: { title, body?, url?, tag?, icon?, badge?, data?, requireInteraction?, user_ids? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPlatformPush } from "../_shared/platform-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID_MARCELO") || "";

async function sendTelegram(
  title: string,
  text: string,
  url?: string,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, skipped: true };
  try {
    const parts = [`🔔 ${title}`];
    if (text) parts.push(text);
    if (url) parts.push(url);
    const resp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: parts.join("\n"),
          disable_web_page_preview: true,
        }),
      },
    );
    const j = await resp.json().catch(() => ({}));
    if (!j?.ok) console.warn("[platform-push-dispatch] telegram not ok", j?.description);
    return { ok: !!j?.ok };
  } catch (err: any) {
    console.warn("[platform-push-dispatch] telegram failed", err?.message || err);
    return { ok: false };
  }
}

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

    // Both channels fire independently — best-effort.
    const [push, telegram] = await Promise.all([
      sendPlatformPush(
        admin,
        { title, body: text || "", url, tag, icon, badge, data, requireInteraction },
        Array.isArray(user_ids) ? user_ids : undefined,
      ),
      sendTelegram(title, text || "", url),
    ]);

    return new Response(JSON.stringify({ ok: true, push, telegram }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[platform-push-dispatch]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
