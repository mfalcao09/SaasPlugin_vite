// Edge Function: process-scheduled-messages
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: false (chamado por cron)
//
// Responsabilidades:
// 1. Validar HMAC via header X-Cron-Secret (comparação timing-safe)
// 2. SELECT * FROM inbox_scheduled_messages WHERE status='pending' AND scheduled_at <= now()
// 3. Para cada: chamar evolution API, persistir em inbox_messages, UPDATE status='sent'/'failed'
//
// Env vars: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

/** Comparação timing-safe para evitar timing attack na validação do secret */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface ScheduledMessage {
  id: string;
  empresa_id: string;
  conversation_id: string;
  content: string;
  scheduled_at: string;
}

interface ConversationRow {
  contact_phone: string;
  evolution_instances: { instance_id: string; instance_token: string | null } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validar CRON_SECRET via header X-Cron-Secret (timing-safe)
  const providedSecret = req.headers.get("X-Cron-Secret") ?? "";
  if (!CRON_SECRET || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Buscar mensagens pendentes com scheduled_at <= agora
    const { data: pending, error: fetchErr } = await supabase
      .from("inbox_scheduled_messages")
      .select("id,empresa_id,conversation_id,content,scheduled_at")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (fetchErr) {
      console.error("[process-scheduled-messages] fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msgs = (pending ?? []) as ScheduledMessage[];
    const results: { id: string; status: "sent" | "failed"; error?: string }[] = [];

    for (const msg of msgs) {
      try {
        // 2. Resolver instância Evolution da conversa
        const { data: conv } = await supabase
          .from("inbox_conversations")
          .select("contact_phone,evolution_instances(instance_id,instance_token)")
          .eq("id", msg.conversation_id)
          .single();

        const conversation = conv as ConversationRow | null;
        if (!conversation?.evolution_instances?.instance_id) {
          throw new Error("No Evolution instance attached to conversation");
        }

        const { instance_id, instance_token } = conversation.evolution_instances;
        const phone = conversation.contact_phone;

        // 3. Enviar via Evolution Go API (sendText)
        const evoRes = await fetch(`${EVO_URL}/message/sendText/${instance_id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: instance_token || EVO_KEY,
          },
          body: JSON.stringify({ number: phone, text: msg.content }),
        });

        if (!evoRes.ok) {
          const errText = await evoRes.text();
          throw new Error(`Evolution error ${evoRes.status}: ${errText}`);
        }

        // 4. Persistir mensagem enviada em inbox_messages
        await supabase.from("inbox_messages").insert({
          conversation_id: msg.conversation_id,
          direction: "outbound",
          sender_type: "agent",
          content: msg.content,
          content_type: "text",
          metadata: { scheduled: true },
        });

        // 5. Marcar como enviada
        await supabase
          .from("inbox_scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", msg.id);

        results.push({ id: msg.id, status: "sent" });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[process-scheduled-messages] msg ${msg.id} failed:`, errMsg);

        await supabase
          .from("inbox_scheduled_messages")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", msg.id);

        results.push({ id: msg.id, status: "failed", error: errMsg });
      }
    }

    return new Response(JSON.stringify({ processed: msgs.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[process-scheduled-messages] exception:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
