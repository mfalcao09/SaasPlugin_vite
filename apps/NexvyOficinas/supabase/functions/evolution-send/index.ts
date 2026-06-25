import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendBody {
  organization_id?: string;
  instance_id?: string; // our DB id
  type:
    | "text"
    | "media"
    | "audio"
    | "sticker"
    | "location"
    | "contact"
    | "link"
    | "poll"
    | "reaction"
    | "edit"
    | "delete"
    | "markRead"
    | "presence";
  to: string; // phone digits only
  payload: Record<string, any>;
}

async function evoFetch(url: string, apikey: string, path: string, body: any) {
  const fullUrl = `${url}${path}`;
  console.log(`[evolution-send] POST ${path} body=${JSON.stringify(body).slice(0, 300)}`);
  const res = await fetch(fullUrl, {
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
    console.error(
      `[evolution-send] error: status=${res.status} path=${path} body=${
        typeof parsed === "string" ? parsed.slice(0, 500) : JSON.stringify(parsed).slice(0, 500)
      }`
    );
  } else {
    console.log(`[evolution-send] success: status=${res.status} path=${path}`);
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as SendBody;
    let { organization_id, instance_id, type, to, payload } = body;

    if (!type || !to || !payload) {
      return new Response(JSON.stringify({ error: "Missing type/to/payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: if Bearer present, derive org from user
    if (!organization_id) {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
        if (user) {
          const { data: profile } = await supabase
            .from("profiles").select("organization_id").eq("id", user.id).single();
          organization_id = profile?.organization_id || undefined;
        }
      }
    }

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve instance
    let instance: any;
    if (instance_id) {
      const { data } = await supabase
        .from("evolution_instances").select("*")
        .eq("id", instance_id).eq("organization_id", organization_id).single();
      instance = data;
    } else {
      // Sem instance_id: pega a melhor instância conectada da org (default primeiro, senão mais recente)
      const { data } = await supabase
        .from("evolution_instances").select("*")
        .eq("organization_id", organization_id)
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      instance = data;
    }
    if (!instance) {
      return new Response(JSON.stringify({ error: "No Evolution instance found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Org-level settings (legacy/per-org override)
    const { data: cfg } = await supabase
      .from("integration_settings").select("settings")
      .eq("organization_id", organization_id)
      .eq("integration_type", "whatsapp_provider").maybeSingle();
    const settings = cfg?.settings ?? {};
    let url = String(settings.evolution_go_url || "").replace(/\/$/, "");
    let globalKey = String(settings.evolution_go_global_api_key || "");

    // Fallback to platform-wide Evolution Go server (current architecture)
    if (!url || !globalKey) {
      const { data: platformCfg } = await supabase
        .from("platform_settings")
        .select("evolution_go_url, evolution_go_global_api_key")
        .maybeSingle();
      url = url || String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
      globalKey = globalKey || String((platformCfg as any)?.evolution_go_global_api_key || "");
    }

    // Evolution API v2.3.7: auth via apikey header (instance token or global key).
    const apikey = instance.instance_token || globalKey;
    // v2.3.7 addresses instances by instanceName (the `name` column), NOT the uuid.
    const instanceName = String(instance.name || "").trim();
    if (!url || !apikey) {
      console.error("[evolution-send] Evolution API not configured", {
        org_has_url: !!settings.evolution_go_url,
        platform_has_url: !!url,
        instance_has_token: !!instance.instance_token,
      });
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!instanceName) {
      return new Response(JSON.stringify({ error: "Instância sem nome (instanceName). Sincronize do servidor." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inst = encodeURIComponent(instanceName);

    const phone = to.replace(/\D/g, "");

    let res;
    switch (type) {
      case "text":
        // Evolution API v2.3.7: POST /message/sendText/{instanceName} { number, text }
        res = await evoFetch(url, apikey, `/message/sendText/${inst}`, {
          number: phone,
          text: payload.text,
        });
        break;
      case "media": {
        // Evolution API v2.3.7: POST /message/sendMedia/{instanceName}
        //   { number, mediatype: "image"|"video"|"document", media: <url|base64>, caption?, fileName? }
        const rawMedia = payload.url ?? payload.media;
        const mediaType = payload.mediatype || payload.type || "image";
        const isDataUrl = typeof rawMedia === "string" && rawMedia.startsWith("data:");
        const mediaPayload: Record<string, any> = {
          number: phone,
          mediatype: mediaType,
          media: rawMedia,
          caption: payload.caption,
          fileName: payload.fileName,
        };
        if (payload.mimetype) mediaPayload.mimetype = payload.mimetype;
        console.log(`[evolution-send] media transport=${isDataUrl ? "base64" : "url"} mediatype=${mediaType} mimetype=${payload.mimetype || "unknown"}`);
        res = await evoFetch(url, apikey, `/message/sendMedia/${inst}`, mediaPayload);
        break;
      }
      case "audio": {
        // v2.3.7: audio goes through sendMedia with mediatype=audio.
        const audioUrl = payload.audio || payload.url || payload.media;
        const isDataUrl = typeof audioUrl === "string" && audioUrl.startsWith("data:");
        const audioPayload: Record<string, any> = {
          number: phone,
          mediatype: "audio",
          media: audioUrl,
          mimetype: payload.mimetype || "audio/ogg",
          fileName: payload.fileName || `audio-${Date.now()}.ogg`,
        };
        console.log(`[evolution-send] audio routed to /message/sendMedia transport=${isDataUrl ? "base64" : "url"}`);
        res = await evoFetch(url, apikey, `/message/sendMedia/${inst}`, audioPayload);
        break;
      }
      case "sticker":
        res = await evoFetch(url, apikey, `/message/sendSticker/${inst}`, {
          number: phone,
          sticker: payload.sticker,
        });
        break;
      case "location":
        res = await evoFetch(url, apikey, `/message/sendLocation/${inst}`, {
          number: phone,
          latitude: payload.latitude,
          longitude: payload.longitude,
          name: payload.name,
          address: payload.address,
        });
        break;
      case "contact":
        res = await evoFetch(url, apikey, `/message/sendContact/${inst}`, {
          number: phone,
          contact: payload.contacts || payload.contact,
        });
        break;
      case "link":
        // v2.3.7 has no dedicated link endpoint — a link is just text with a URL.
        res = await evoFetch(url, apikey, `/message/sendText/${inst}`, {
          number: phone,
          text: payload.text ? `${payload.text}\n${payload.link}` : payload.link,
          linkPreview: true,
        });
        break;
      case "poll":
        res = await evoFetch(url, apikey, `/message/sendPoll/${inst}`, {
          number: phone,
          name: payload.name,
          selectableCount: payload.selectableCount || 1,
          values: payload.values,
        });
        break;
      case "reaction":
        res = await evoFetch(url, apikey, `/message/sendReaction/${inst}`, {
          key: payload.key,
          reaction: payload.reaction,
        });
        break;
      case "edit":
        res = await evoFetch(url, apikey, `/chat/updateMessage/${inst}`, {
          number: phone,
          key: payload.key,
          text: payload.text,
        });
        break;
      case "delete":
        res = await evoFetch(url, apikey, `/chat/deleteMessageForEveryone/${inst}`, {
          id: payload.id,
          remoteJid: payload.remoteJid,
          fromMe: payload.fromMe ?? true,
          participant: payload.participant,
        });
        break;
      case "markRead":
        res = await evoFetch(url, apikey, `/chat/markMessageAsRead/${inst}`, {
          readMessages: payload.readMessages,
        });
        break;
      case "presence": {
        // v2.3.7: POST /chat/sendPresence/{instanceName} { number, presence, delay? }
        // Baileys presence states: composing | recording | paused | available | unavailable
        const state = String(payload.state || payload.presence || "composing");
        res = await evoFetch(url, apikey, `/chat/sendPresence/${inst}`, {
          number: phone,
          presence: state,
        });
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Return real HTTP status when Evolution responds with error
    return new Response(JSON.stringify(res), {
      status: res.ok ? 200 : res.status >= 400 ? res.status : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[evolution-send] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
