// platform-evolution-webhook — recebe eventos do Evolution Go p/ o CRM de
// PLATAFORMA (público, verify_jwt=false). Escreve em platform_crm_evolution_instances.
//
// Porte 1:1 da PARTE de ciclo-de-vida-da-conexão do `evolution-webhook` do CRM
// Vendus (normalização + resolução de instância + eventos connection/qrcode),
// DESACOPLADO do tenant:
//   * Tabela: platform_crm_evolution_instances (SEM organization_id).
//   * Trata: CONNECTION_UPDATE/connection.update/Connected/PairSuccess/
//     Disconnected/LoggedOut  → status/phone_number/last_connected_at/qr_code;
//     QRCODE_UPDATED/qrcode.updated/QRCode/QR  → qr_code/qr_code_updated_at/status.
//   * Ignora (200) qualquer outro evento.
//
// TODO(inbox): ingestão de mensagens (MESSAGES_UPSERT / Message / SendMessage /
//   receipts / reactions / bot-flows) NÃO é portada aqui — pertence à fase do
//   INBOX de plataforma (platform_crm_conversations/messages), a "fase central
//   depois". Este webhook cobre só o que faz o painel Conexões ficar vivo (QR/status).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Normalized =
  | { kind: "connection"; instance: string; state: "open" | "connecting" | "close"; phone?: string }
  | { kind: "qrcode"; instance: string; qr: string }
  | { kind: "unknown"; instance: string; event: string };

function extractInstance(payload: any): string {
  const candidates = [
    payload?.instance,
    payload?.instanceName,
    payload?.Instance,
    payload?.instance_name,
    payload?.instanceId,
    payload?.instance_id,
    typeof payload?.instance === "object" ? payload?.instance?.instanceName : null,
    typeof payload?.instance === "object" ? payload?.instance?.name : null,
    typeof payload?.instance === "object" ? payload?.instance?.id : null,
    payload?.data?.instance,
    payload?.data?.Instance,
    payload?.data?.instanceName,
    payload?.data?.instance_name,
    typeof payload?.data?.instance === "object" ? payload?.data?.instance?.name : null,
    typeof payload?.data?.instance === "object" ? payload?.data?.instance?.instanceName : null,
    payload?.sender?.instance,
    payload?.session,
    payload?.SessionID,
    payload?.session_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

function normalizePayload(payload: any): Normalized | null {
  const event: string = payload.event || payload.type || payload.Event || "";
  const instance: string = extractInstance(payload);
  if (!instance) return null;
  const data = payload.data || payload;

  // ---- v2 events ----
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    return {
      kind: "connection",
      instance,
      state: data.state === "open" ? "open" : data.state === "connecting" ? "connecting" : "close",
      phone: data.wuid || data.number,
    };
  }

  if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
    return { kind: "qrcode", instance, qr: normalizeQrString(data.qrcode?.base64 || data.qrcode?.code || data.base64 || data.code) || "" };
  }

  // ---- Evolution Go events ----
  if (event === "Connected" || event === "PairSuccess") {
    return { kind: "connection", instance, state: "open", phone: data.JID || data.jid };
  }
  if (event === "LoggedOut" || event === "Disconnected") {
    return { kind: "connection", instance, state: "close" };
  }
  if (event === "QRCode" || event === "QR" || event === "QRCodeUpdated") {
    const candidates = [
      data.QRCode, data.qrcode, data.qr, data.Qr, data.code, data.Code,
      data.base64, data.Base64,
      data?.qrcode?.base64, data?.qrcode?.code,
      data?.QRCode?.Base64, data?.QRCode?.Code,
      data?.data?.qrcode, data?.data?.base64, data?.data?.code,
      payload.QRCode, payload.qrcode, payload.qr, payload.code, payload.base64,
    ];
    let qr = "";
    for (const c of candidates) {
      const normalizedQr = normalizeQrString(c);
      if (normalizedQr) { qr = normalizedQr; break; }
    }
    if (!qr) {
      try {
        console.warn("[platform-evolution-webhook] QRCode event sem QR extraível — payload:",
          JSON.stringify(payload).slice(0, 2000));
      } catch { /* ignore */ }
    }
    return { kind: "qrcode", instance, qr };
  }

  // Demais eventos (mensagens/receipts/etc) — pertencem à fase do inbox.
  return { kind: "unknown", instance, event };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json().catch(() => ({}));
    const rawEvent = payload.event || payload.type || payload.Event;
    const rawInstance = extractInstance(payload);
    console.log("[platform-evolution-webhook] raw event:", rawEvent, "instance:", rawInstance || "<MISSING>");

    const norm = normalizePayload(payload);
    if (!norm) {
      // Return 200 so Evolution Go does not retry indefinitely
      return new Response(JSON.stringify({ ok: true, ignored: "missing_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ciclo-de-vida da conexão apenas; demais eventos são ignorados aqui.
    if (norm.kind === "unknown") {
      return new Response(JSON.stringify({ ok: true, ignored_event: norm.event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup instance by either instance_id (UUID) OR name OR metadata.instance_name.
    const { data: instances } = await supabase
      .from("platform_crm_evolution_instances")
      .select("*")
      .or(`instance_id.eq.${norm.instance},name.eq.${norm.instance}`);
    let instance = instances?.[0];

    if (!instance) {
      const { data: byMeta } = await supabase
        .from("platform_crm_evolution_instances")
        .select("*")
        .or(`metadata->>instance_name.eq.${norm.instance},metadata->>instance_uuid.eq.${norm.instance}`);
      instance = byMeta?.[0];
    }

    if (!instance) {
      console.warn("[platform-evolution-webhook] unknown instance:", norm.instance);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CONNECTION ----
    if (norm.kind === "connection") {
      const mapped =
        norm.state === "open" ? "connected" : norm.state === "connecting" ? "qr_pending" : "disconnected";
      const updates: any = { status: mapped };
      if (mapped === "connected") {
        updates.last_connected_at = new Date().toISOString();
        updates.qr_code = null;
        if (norm.phone) {
          updates.phone_number = String(norm.phone).split("@")[0].split(":")[0].replace(/\D/g, "");
        }
      }
      await supabase.from("platform_crm_evolution_instances").update(updates).eq("id", instance.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- QR CODE ----
    if (norm.kind === "qrcode") {
      if (norm.qr) {
        await supabase
          .from("platform_crm_evolution_instances")
          .update({
            qr_code: norm.qr,
            qr_code_updated_at: new Date().toISOString(),
            status: "qr_pending",
          })
          .eq("id", instance.id);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("platform-evolution-webhook error:", err);
    // 200 to avoid Evolution retry storms.
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
