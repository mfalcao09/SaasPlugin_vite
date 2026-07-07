// Edge Function: webchat-handler (Sprint 10 F4)
// verify_jwt: false — recebe POSTs do widget embeddable em sites de clientes
// CORS aberto (widget roda em domínio do cliente, não o nosso)

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey) return jsonResponse({ error: "missing x-api-key" }, 401);

  let body: {
    contact_name?: string;
    message?: string;
    session_id?: string;
    contact_email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad json" }, 400);
  }

  const message = (body.message ?? "").trim();
  const sessionId = (body.session_id ?? "").trim();
  const contactName = (body.contact_name ?? "Visitante").trim();
  const contactEmail = body.contact_email?.trim() ?? null;

  if (!message || !sessionId) {
    return jsonResponse({ error: "missing message or session_id" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Validar api_key via hash SHA-256 (plaintext NUNCA persiste — Seção 11.1 CLAUDE.md)
  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await supabase
    .from("empresa_api_keys")
    .select("id, empresa_id, revoked_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!keyRow) return jsonResponse({ error: "invalid api key" }, 403);

  const empresaId = keyRow.empresa_id as string;
  const keyId = keyRow.id as string;

  // Touch last_used_at (fire-and-forget)
  supabase
    .from("empresa_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyId)
    .then(() => {});

  // 2. Buscar/criar conversa (channel=webchat). contact_phone = "webchat_" + sessionId
  const contactPhone = `webchat_${sessionId}`;

  const { data: existing } = await supabase
    .from("inbox_conversations")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("contact_phone", contactPhone)
    .limit(1)
    .single();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id as string;
    await supabase
      .from("inbox_conversations")
      .update({
        contact_name: contactName,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  } else {
    const { data: created, error: insErr } = await supabase
      .from("inbox_conversations")
      .insert({
        empresa_id: empresaId,
        contact_phone: contactPhone,
        contact_name: contactName,
        channel: "webchat",
        status: "waiting_human",
        last_message_at: new Date().toISOString(),
        metadata: contactEmail ? { contact_email: contactEmail } : {},
      })
      .select("id")
      .single();

    if (insErr || !created) {
      console.error("[webchat-handler] insert conversation error:", insErr?.message);
      return jsonResponse({ error: "failed to create conversation" }, 500);
    }
    conversationId = created.id as string;
  }

  // 3. INSERT mensagem do contato
  const { error: msgErr } = await supabase.from("inbox_messages").insert({
    conversation_id: conversationId,
    direction: "inbound",
    sender_type: "contact",
    content: message,
    content_type: "text",
    channel: "webchat",
    is_deleted: false,
  });

  if (msgErr) {
    console.error("[webchat-handler] insert message error:", msgErr.message);
    return jsonResponse({ error: "failed to save message" }, 500);
  }

  // PostgrestFilterBuilder is a PromiseLike without .catch; then(onFulfilled, onRejected) swallows errors (best-effort)
  await supabase.rpc("increment_unread_count", { conv_id: conversationId }).then(() => {}, () => {});

  return jsonResponse({
    conversation_id: conversationId,
    session_id: sessionId,
  });
});
