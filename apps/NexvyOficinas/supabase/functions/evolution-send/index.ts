// Edge Function: evolution-send (v3)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: true (chamado pelo frontend autenticado)
//
// Responsabilidades:
// 1. Receber pedido de envio do frontend ({ conversation_id, type, content|url, metadata })
// 2. Resolver empresa + instância Evolution da conversa
// 3. Disparar Evolution Go API (sendText | sendMedia | sendWhatsAppAudio)
// 4. Persistir mensagem outbound em inbox_messages com metadata normalizado
//    (consistente com webhook v4 e bubbles do frontend)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface SendBody {
  conversation_id: string;
  type: "text" | "image" | "audio" | "video" | "document";
  content?: string;     // texto puro
  url?: string;         // URL pública da mídia (do bucket inbox-media)
  caption?: string;     // legenda da mídia
  // Metadados normalizados (consistentes com useMediaUpload no front + webhook v4):
  mime?: string;
  name?: string;
  size?: number;
  duration?: number;    // segundos (audio/video)
  width?: number;       // px (image/video)
  height?: number;
}

async function evoFetch(
  path: string,
  body: unknown,
  instanceToken?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${EVO_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: instanceToken || EVO_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/** Remove chaves undefined/null/"" antes de salvar no banco (metadata enxuto) */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: eu } = await supabase
      .from("empresa_users").select("empresa_id").eq("user_id", user.id).single();
    const empresaId = eu?.empresa_id;
    if (!empresaId) {
      return new Response(JSON.stringify({ error: "No empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SendBody;
    const { conversation_id, type = "text", content, url, caption, mime, name, size, duration, width, height } = body;

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type !== "text" && !url) {
      return new Response(JSON.stringify({ error: `url required for type=${type}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conv } = await supabase
      .from("inbox_conversations")
      .select("*, evolution_instances(instance_id, instance_token)")
      .eq("id", conversation_id)
      .eq("empresa_id", empresaId)
      .single();

    if (!conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inst = conv.evolution_instances as Record<string, any>;
    if (!inst?.instance_id) {
      return new Response(JSON.stringify({ error: "No Evolution instance attached" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = conv.contact_phone;
    const instanceToken = inst.instance_token || undefined;
    let evo: { ok: boolean; status: number; data: unknown };

    switch (type) {
      case "text":
        evo = await evoFetch(`/message/sendText/${inst.instance_id}`, {
          number: phone,
          text: content ?? "",
        }, instanceToken);
        break;
      case "image":
      case "video":
      case "document":
        evo = await evoFetch(`/message/sendMedia/${inst.instance_id}`, {
          number: phone,
          mediatype: type,
          url,
          caption: caption ?? "",
          fileName: name,        // Evolution Go espera fileName
          mimetype: mime,        // Evolution Go espera mimetype
        }, instanceToken);
        break;
      case "audio":
        // Endpoint específico de áudio PTT (voice note) na Evolution Go
        evo = await evoFetch(`/message/sendWhatsAppAudio/${inst.instance_id}`, {
          number: phone,
          audio: url,
          encoding: true,
        }, instanceToken);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!evo.ok) {
      console.error("[evolution-send] Evolution API error:", evo.status, evo.data);
      return new Response(JSON.stringify({ error: "Evolution API error", detail: evo.data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Salva mensagem outbound com metadata normalizado
    const evoData = evo.data as Record<string, any>;
    const metadata = type === "text"
      ? {}
      : stripUndefined({ url, mime, name, size, duration, width, height });

    const { data: savedMsg, error: insertErr } = await supabase.from("inbox_messages").insert({
      conversation_id,
      direction: "outbound",
      sender_type: "agent",
      sender_id: user.id,
      content: content ?? caption ?? null,
      content_type: type,
      wa_message_id: evoData?.key?.id ?? null,
      metadata,
    }).select().single();

    if (insertErr) {
      console.warn("[evolution-send] message saved to WhatsApp but DB insert failed:", insertErr.message);
    }

    return new Response(JSON.stringify({ ok: true, message: savedMsg, evo: evo.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[evolution-send] exception:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
