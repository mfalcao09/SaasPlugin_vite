// Cliente HTTP fino da Z-API (WhatsApp QR / não-oficial).
// Usado pelo motor da Camila (platform-evolution-*) quando
// whatsapp_qr_provider = 'zapi'. Não loga tokens em claro.

export interface ZapiConfig {
  baseUrl: string;
  clientToken: string;
}

export interface ZapiInstanceCreds {
  instanceId: string;
  instanceToken: string;
}

export interface ZapiFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
  message?: string;
}

function mask(s: string): string {
  if (!s) return "(empty)";
  return s.length <= 8 ? "***" : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function maskSecret(s: string | null | undefined): string {
  return mask(String(s ?? ""));
}

export function zapiInstanceBase(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
): string {
  const root = config.baseUrl.replace(/\/$/, "");
  return `${root}/instances/${encodeURIComponent(creds.instanceId)}/token/${encodeURIComponent(creds.instanceToken)}`;
}

export async function zapiFetch(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  path: string,
  init: RequestInit = {},
): Promise<ZapiFetchResult> {
  const url = `${zapiInstanceBase(config, creds)}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Client-Token": config.clientToken,
    ...(init.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      body: null,
      message: `Falha ao conectar Z-API (${mask(config.baseUrl)}): ${msg}`,
    };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  let message: string | undefined;
  if (!res.ok) {
    if (typeof body === "string") {
      message = `Z-API ${res.status}: ${body.slice(0, 200)}`;
    } else if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      message = String(o.error ?? o.message ?? `Z-API ${res.status}`);
    } else {
      message = `Z-API ${res.status}`;
    }
  }
  return { ok: res.ok, status: res.status, body, message };
}

/** Status da instância. */
export async function zapiStatus(config: ZapiConfig, creds: ZapiInstanceCreds) {
  return zapiFetch(config, creds, "/status", { method: "GET" });
}

/** QR em base64 (data URI ou raw). */
export async function zapiQrImage(config: ZapiConfig, creds: ZapiInstanceCreds) {
  return zapiFetch(config, creds, "/qr-code/image", { method: "GET" });
}

export async function zapiDisconnect(config: ZapiConfig, creds: ZapiInstanceCreds) {
  return zapiFetch(config, creds, "/disconnect", { method: "GET" });
}

export async function zapiMe(config: ZapiConfig, creds: ZapiInstanceCreds) {
  return zapiFetch(config, creds, "/me", { method: "GET" });
}

/** Aponta todos os webhooks para a mesma URL (HTTPS). */
export async function zapiUpdateEveryWebhooks(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  webhookUrl: string,
  notifySentByMe = true,
) {
  return zapiFetch(config, creds, "/update-every-webhooks", {
    method: "PUT",
    body: JSON.stringify({ value: webhookUrl, notifySentByMe }),
  });
}

export async function zapiSendText(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  body: {
    phone: string;
    message: string;
    messageId?: string;
    delayTyping?: number;
    delayMessage?: number;
  },
) {
  return zapiFetch(config, creds, "/send-text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function zapiSendImage(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  body: { phone: string; image: string; caption?: string; messageId?: string },
) {
  return zapiFetch(config, creds, "/send-image", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function zapiSendAudio(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  body: { phone: string; audio: string },
) {
  return zapiFetch(config, creds, "/send-audio", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function zapiSendDocument(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  body: { phone: string; document: string; fileName?: string; caption?: string },
) {
  return zapiFetch(config, creds, "/send-document/pdf", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Verifica número e, quando disponível, retorna @lid. */
export async function zapiPhoneExists(
  config: ZapiConfig,
  creds: ZapiInstanceCreds,
  phone: string,
) {
  const digits = phone.replace(/\D/g, "");
  return zapiFetch(config, creds, `/phone-exists/${encodeURIComponent(digits)}`, {
    method: "GET",
  });
}

export function extractZapiQr(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") {
    const s = body.trim();
    if (s.startsWith("data:image") || s.length > 40) return s;
    return null;
  }
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["value", "qrcode", "qrCode", "base64", "image", "valueBase64"]) {
      const v = o[k];
      if (typeof v === "string" && v.length > 40) {
        return v.startsWith("data:") ? v : (v.startsWith("iVBOR") || v.startsWith("/9j/")
          ? `data:image/png;base64,${v}`
          : v);
      }
    }
  }
  return null;
}

export function extractConnectedPhone(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const raw = o.phone ?? o.connectedPhone ?? o.msisdn ??
    (typeof o.device === "object" && o.device
      ? (o.device as Record<string, unknown>).phone
      : null);
  if (raw == null) return null;
  const digits = String(raw).split("@")[0].replace(/\D/g, "");
  return digits || null;
}

export function extractLidFromPhoneExists(body: unknown): string {
  const rows = Array.isArray(body) ? body : (body && typeof body === "object" ? [body] : []);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const candidates = [o.lid, o.chatLid, o.phoneLid, o.zapiLid];
    for (const c of candidates) {
      if (typeof c === "string" && c.includes("@lid")) return c;
      if (typeof c === "string" && /^\d{10,}$/.test(c)) return `${c}@lid`;
    }
    if (typeof o.phone === "string" && o.phone.includes("@lid")) return o.phone;
  }
  return "";
}
