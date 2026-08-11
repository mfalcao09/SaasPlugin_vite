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
//
// Destino: preferir `@lid` quando conhecido (wa_lid / to com @lid); senão PN
// dígitos. Cold first-touch sem LID continua PN (não-Camila).
// Camila (nome ou metadata.require_lid_send): SOMENTE `@lid` — sem fallback PN
// (PN → ACK 463). Resolve via body.wa_lid ou findMessages por remoteJidAlt.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  pickLidJidFromEvolutionMessageRecords,
  requiresLidSend,
  resolveEvolutionSendNumber,
} from "../_shared/evolution-baileys-jid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  product_id?: string;
  instance_id?: string; // id da row em platform_crm_evolution_instances (o burner)
  type: "text" | "media" | "audio" | "presence";
  to: string; // dígitos PN, JID, ou já `…@lid`
  /** LID conhecido (ex.: conversation.metadata.wa_lid). Preferido sobre PN. */
  wa_lid?: string | null;
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

function buildSendBody(
  type: SendBody["type"],
  number: string,
  payload: Record<string, any>,
): Record<string, any> {
  switch (type) {
    case "text":
      return { number, text: payload.text };
    case "presence": {
      const state = String(payload.state || payload.presence || "composing");
      return { number, presence: state };
    }
    case "media": {
      const rawMedia = payload.url ?? payload.media;
      return {
        number,
        mediatype: payload.mediatype || "image",
        media: rawMedia,
        caption: payload.caption,
        fileName: payload.fileName,
      };
    }
    case "audio":
      return {
        number,
        mediatype: "audio",
        media: payload.audio || payload.url || payload.media,
        mimetype: payload.mimetype || "audio/ogg",
        fileName: payload.fileName || "audio.ogg",
      };
    default:
      return { number };
  }
}

function evoPath(type: SendBody["type"], inst: string): string {
  switch (type) {
    case "text":
      return `/message/sendText/${inst}`;
    case "presence":
      return `/chat/sendPresence/${inst}`;
    case "media":
    case "audio":
      return `/message/sendMedia/${inst}`;
    default:
      return "";
  }
}


/** Camila: recupera `@lid` via findMessages quando o caller só tem PN. */
async function lookupLidJidByPhoneAlt(
  url: string,
  apikey: string,
  instanceName: string,
  phoneDigits: string,
): Promise<string> {
  if (!url || !apikey || !instanceName || !phoneDigits) return "";
  try {
    const res = await fetch(
      `${url}/chat/findMessages/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({
          where: { key: { remoteJidAlt: `${phoneDigits}@s.whatsapp.net` } },
          page: 1,
          offset: 20,
        }),
      },
    );
    const parsed = await res.json().catch(() => null);
    const records = parsed?.messages?.records ?? parsed?.records ?? [];
    return pickLidJidFromEvolutionMessageRecords(records);
  } catch (e) {
    console.warn(
      "[platform-evolution-send] LID lookup exception:",
      String(e).slice(0, 200),
    );
    return "";
  }
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
    const mustLid = requiresLidSend(instance);
    let effectiveWaLid = waLid;
    let addr = resolveEvolutionSendNumber({ to, waLid: effectiveWaLid });

    // Camila: se não veio wa_lid, tenta store Evolution por Alt PN.
    if (mustLid && !addr.usedLid && addr.phoneDigits) {
      const lookedUp = await lookupLidJidByPhoneAlt(url, apikey, instanceName, addr.phoneDigits);
      if (lookedUp) {
        effectiveWaLid = lookedUp;
        addr = resolveEvolutionSendNumber({ to, waLid: effectiveWaLid });
        console.log(
          `[platform-evolution-send] LID lookup ok phone=${addr.phoneDigits} lid=${lookedUp}`,
        );
      }
    }

    if (mustLid && !addr.usedLid) {
      return json({
        error: "lid_required",
        reason: "Camila sends must use @lid (PN causes ACK 463)",
        phone_digits: addr.phoneDigits || null,
      }, 409);
    }

    if (!addr.number) return json({ error: "Missing destination number" }, 400);

    const path = evoPath(type, inst);
    if (!path) return json({ error: `Unknown type: ${type}` }, 400);

    let res = await evoFetch(url, apikey, path, buildSendBody(type, addr.number, payload));
    let usedLid = addr.usedLid;
    let fellBackToPn = false;

    // Não-Camila: LID falhou e temos PN → uma retry. Camila: NUNCA fallback PN.
    if (
      !mustLid &&
      !res.ok &&
      addr.usedLid &&
      addr.phoneDigits &&
      addr.phoneDigits !== addr.number
    ) {
      console.warn(
        `[platform-evolution-send] LID send failed status=${res.status}; retry PN digits=${addr.phoneDigits}`,
      );
      res = await evoFetch(url, apikey, path, buildSendBody(type, addr.phoneDigits, payload));
      usedLid = false;
      fellBackToPn = true;
    }

    const envelope = {
      ...res,
      send_address: usedLid ? addr.number : (fellBackToPn ? addr.phoneDigits : addr.number),
      used_lid: usedLid,
      fell_back_to_pn: fellBackToPn,
    };
    return json(envelope, res.ok ? 200 : res.status >= 400 ? res.status : 502);
  } catch (err: any) {
    console.error("[platform-evolution-send] exception:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
