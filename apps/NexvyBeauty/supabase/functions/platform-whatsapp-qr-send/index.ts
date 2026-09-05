// platform-whatsapp-qr-send — envio WhatsApp via QR (Z-API) no CRM de plataforma.
// Alias legado: platform-evolution-send (forwarder).
// Auth: Bearer/apikey == SERVICE_ROLE_KEY. Canal Meta oficial NÃO passa por aqui.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  pickLidFromWhatsappNumbersRecords,
  pickLidJidFromEvolutionMessageRecords,
  requiresLidSend,
  resolveEvolutionSendNumber,
} from "../_shared/evolution-baileys-jid.ts";
import {
  extractLidFromPhoneExists,
  zapiPhoneExists,
  zapiSendAudio,
  zapiSendImage,
  zapiSendText,
} from "../_shared/zapi-client.ts";
import {
  instanceLooksZapi,
  loadPlatformQrProviderConfig,
  zapiCredsFromInstance,
} from "../_shared/platform-qr-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SendBody {
  product_id?: string;
  instance_id?: string; // id da row em platform_crm_evolution_instances (o burner)
  type: "text" | "media" | "audio" | "presence";
  to: string; // dígitos PN, JID, ou já `…@lid`
  /** LID conhecido (ex.: conversation.metadata.wa_lid). Preferido sobre PN. */
  wa_lid?: string | null;
  payload: Record<string, any>;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth interno: só service-role (chamado server-to-server pelo motor cold).
  //
  // MEDIDO em 2026-08-04, no primeiro tráfego real deste canal: `functions.invoke`
  // de um client service-role manda a chave no header `apikey`, e o `Authorization`
  // que ele monta NÃO casa com SERVICE_ROLE_KEY. Conferir só o Authorization
  // rejeitava TODOS os chamadores (cold-outreach, sales-brain, post-sale,
  // start-whatsapp-conversation) — nenhum envio jamais saiu por aqui, e as bolhas
  // da BDR ficaram gravadas no banco com delivery_status='failed'.
  //
  // O platform-sales-brain (index.ts:183) já aceita as DUAS portas, e é
  // exatamente por isso que ele é o único invoke que passava. Espelhado aqui.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const apikeyHeader = (req.headers.get("apikey") ?? "").trim();
  if (!serviceKey || (bearer !== serviceKey && apikeyHeader !== serviceKey)) {
    // INSTRUMENTO: recusa MUDA foi o que fez esta função rejeitar todos os
    // chamadores sem ninguém descobrir por quê. O corpo abaixo é lido pelo
    // platform-sales-brain e gravado em platform_crm_messages.metadata — só
    // TAMANHOS e resultados de comparação, NUNCA o valor de nenhuma chave.
    return json({
      error: "unauthorized (internal only)",
      diag: {
        service_key_len: serviceKey.length,
        bearer_len: bearer.length,
        apikey_len: apikeyHeader.length,
        bearer_matches: bearer === serviceKey,
        apikey_matches: apikeyHeader === serviceKey,
        bearer_eq_apikey: bearer === apikeyHeader,
      },
    }, 401);
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = (await req.json()) as SendBody;
    const { product_id, instance_id, type, to, payload } = body;
    const waLid = body.wa_lid ?? null;

    if (!type || !to || !payload) return json({ error: "Missing type/to/payload" }, 400);
    if (!product_id) return json({ error: "product_id required" }, 400);

    // Resolve a instância BURNER: por id (preferido) OU a melhor conectada do produto.
    let instance: any;
    if (instance_id) {
      const { data } = await supabase
        .from("platform_crm_wa_qr_instances").select("*")
        .eq("id", instance_id).eq("product_id", product_id).maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from("platform_crm_wa_qr_instances").select("*")
        .eq("product_id", product_id)
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      instance = data;
    }
    if (!instance) return json({ error: "No platform WhatsApp QR instance found" }, 404);

    // Z-API only (sanitização A+B 2026-09-01) — motor Evolution Go removido deste edge.
    const qrCfg = await loadPlatformQrProviderConfig(supabase);
    const useZapi = qrCfg.provider === "zapi" || instanceLooksZapi(instance);
    if (!useZapi) {
      return json({
        error: "evolution_motor_disabled",
        detail: "Platform WhatsApp QR is Z-API only. Set whatsapp_qr_provider=zapi.",
      }, 503);
    }
    if (!qrCfg.zapi) {
      return json({ error: "Z-API client-token not configured" }, 400);
    }
    const creds = zapiCredsFromInstance(instance);
    if (!creds) return json({ error: "Instance missing Z-API id/token" }, 400);

    if (type === "presence") {
      return json({ ok: true, status: 200, body: { ignored: "zapi_presence_via_delayTyping" }, provider: "zapi" });
    }

    const mustLid = requiresLidSend(instance);
    const maskPhone = (d: string | null | undefined) => `***${String(d ?? "").slice(-4)}`;
    let effectiveWaLid = waLid;
    let addr = resolveEvolutionSendNumber({ to, waLid: effectiveWaLid });

    if (mustLid && !addr.usedLid && addr.phoneDigits) {
      const exists = await zapiPhoneExists(qrCfg.zapi, creds, addr.phoneDigits);
      const lid = extractLidFromPhoneExists(exists.body);
      if (lid) {
        effectiveWaLid = lid;
        addr = resolveEvolutionSendNumber({ to, waLid: effectiveWaLid });
        console.log(
          `[platform-whatsapp-qr-send] Z-API LID lookup ok phone=${maskPhone(addr.phoneDigits)}`,
        );
      }
    }

    if (mustLid && !addr.usedLid) {
      return json({
        error: "lid_required",
        reason: "Camila sends must use @lid (PN causes ACK 463)",
        phone_digits: addr.phoneDigits || null,
        provider: "zapi",
      }, 409);
    }
    if (!addr.number) return json({ error: "Missing destination number" }, 400);

    const phone = addr.number;
    const quotedId = payload?.quoted?.key?.id;
    const delayTypingRaw = Number(payload?.delay ?? payload?.delayTyping);
    const delayTyping = Number.isFinite(delayTypingRaw)
      ? Math.max(0, Math.min(15, Math.round(delayTypingRaw / 1000) || delayTypingRaw))
      : undefined;

    let res;
    if (type === "text") {
      res = await zapiSendText(qrCfg.zapi, creds, {
        phone,
        message: String(payload.text ?? ""),
        messageId: typeof quotedId === "string" ? quotedId : undefined,
        delayTyping,
      });
    } else if (type === "media") {
      const mediatype = String(payload.mediatype || "image");
      const mediaUrl = String(payload.url ?? payload.media ?? "");
      if (mediatype === "image" || mediatype === "sticker") {
        res = await zapiSendImage(qrCfg.zapi, creds, {
          phone,
          image: mediaUrl,
          caption: payload.caption != null ? String(payload.caption) : undefined,
          messageId: typeof quotedId === "string" ? quotedId : undefined,
        });
      } else {
        res = await zapiSendText(qrCfg.zapi, creds, {
          phone,
          message: String(payload.caption || mediaUrl || "[mídia]"),
          messageId: typeof quotedId === "string" ? quotedId : undefined,
        });
      }
    } else if (type === "audio") {
      res = await zapiSendAudio(qrCfg.zapi, creds, {
        phone,
        audio: String(payload.url ?? payload.audio ?? ""),
        messageId: typeof quotedId === "string" ? quotedId : undefined,
      });
    } else {
      return json({ error: `Unknown type: ${type}` }, 400);
    }

    const envelope = {
      ok: res.ok,
      status: res.status,
      body: res.body,
      send_address: phone,
      used_lid: addr.usedLid,
      fell_back_to_pn: false,
      provider: "zapi",
      message: res.message,
    };
    return json(envelope, res.ok ? 200 : (res.status >= 400 ? res.status : 502));
  } catch (err: any) {
    console.error("[platform-whatsapp-qr-send] exception:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
