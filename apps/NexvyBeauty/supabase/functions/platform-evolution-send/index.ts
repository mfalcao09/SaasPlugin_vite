// platform-evolution-send — TWIN platform-side do tenant `evolution-send`.
//
// Envia WhatsApp via Evolution (servidor não-oficial) usando uma instância da
// PLATAFORMA (platform_crm_evolution_instances), escopada por product_id. É o
// canal do cold outreach por número BURNER — o número oficial Meta vive em
// OUTRA tabela (platform_crm_whatsapp_meta_connections) e NUNCA entra aqui.
//
// Diferenças vs o twin tenant: organization_id -> product_id; evolution_instances
// -> platform_crm_evolution_instances; servidor SEMPRE de platform_settings
// (single-row). Contrato de invocação já fixado em
// platform-process-post-sale-scheduled/index.ts:195-200.
//
// Auth (verify_jwt=false no gateway): SÓ interno — Bearer == SERVICE_ROLE_KEY.
// Nenhum front chama isto direto.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  product_id?: string;
  instance_id?: string; // id da row em platform_crm_evolution_instances (o burner)
  type: "text" | "media" | "audio" | "presence";
  to: string; // dígitos do telefone
  payload: Record<string, any>;
}

async function evoFetch(url: string, apikey: string, path: string, body: any) {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    console.error(`[platform-evolution-send] error status=${res.status} path=${path} body=${
      (typeof parsed === "string" ? parsed : JSON.stringify(parsed)).slice(0, 400)
    }`);
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth interno: só service-role (chamado server-to-server pelo motor cold).
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth.replace("Bearer ", "") !== serviceKey) {
    return json({ error: "unauthorized (internal only)" }, 401);
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = (await req.json()) as SendBody;
    const { product_id, instance_id, type, to, payload } = body;

    if (!type || !to || !payload) return json({ error: "Missing type/to/payload" }, 400);
    if (!product_id) return json({ error: "product_id required" }, 400);

    // Resolve a instância BURNER: por id (preferido) OU a melhor conectada do produto.
    let instance: any;
    if (instance_id) {
      const { data } = await supabase
        .from("platform_crm_evolution_instances").select("*")
        .eq("id", instance_id).eq("product_id", product_id).maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from("platform_crm_evolution_instances").select("*")
        .eq("product_id", product_id)
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      instance = data;
    }
    if (!instance) return json({ error: "No platform Evolution instance found" }, 404);

    // Servidor Evolution: single-row platform_settings (arquitetura atual).
    const { data: platformCfg } = await supabase
      .from("platform_settings")
      .select("evolution_go_url, evolution_go_global_api_key")
      .maybeSingle();
    const url = String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
    const globalKey = String((platformCfg as any)?.evolution_go_global_api_key || "");

    const apikey = instance.instance_token || globalKey;
    const instanceName = String(instance.name || "").trim();
    if (!url || !apikey) return json({ error: "Evolution server not configured (platform_settings)" }, 400);
    if (instanceName === "") return json({ error: "Instância sem name; sincronize do servidor" }, 400);

    const inst = encodeURIComponent(instanceName);
    const phone = to.replace(/\D/g, "");

    let res;
    switch (type) {
      case "text":
        res = await evoFetch(url, apikey, `/message/sendText/${inst}`, { number: phone, text: payload.text });
        break;
      case "presence": {
        // "digitando" humaniza a cadência (composing|recording|paused|available)
        const state = String(payload.state || payload.presence || "composing");
        res = await evoFetch(url, apikey, `/chat/sendPresence/${inst}`, { number: phone, presence: state });
        break;
      }
      case "media": {
        const rawMedia = payload.url ?? payload.media;
        res = await evoFetch(url, apikey, `/message/sendMedia/${inst}`, {
          number: phone,
          mediatype: payload.mediatype || "image",
          media: rawMedia,
          caption: payload.caption,
          fileName: payload.fileName,
        });
        break;
      }
      case "audio":
        res = await evoFetch(url, apikey, `/message/sendMedia/${inst}`, {
          number: phone,
          mediatype: "audio",
          media: payload.audio || payload.url || payload.media,
          mimetype: payload.mimetype || "audio/ogg",
          fileName: payload.fileName || "audio.ogg",
        });
        break;
      default:
        return json({ error: `Unknown type: ${type}` }, 400);
    }

    return json(res, res.ok ? 200 : res.status >= 400 ? res.status : 502);
  } catch (err: any) {
    console.error("[platform-evolution-send] exception:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
