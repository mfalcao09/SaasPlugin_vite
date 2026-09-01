// Provider do canal WhatsApp-via-QR da PLATAFORMA (Camila).
// Canônico desde 2026-09-01: Z-API. 'evolution' = legado (edges platform recusam).
// Env vars sobrescrevem platform_settings (útil em deploy sem DDL aplicado).

import type { ZapiConfig, ZapiInstanceCreds } from "./zapi-client.ts";

export type WhatsappQrProvider = "evolution" | "zapi";

/** Nome canônico das edges (aliases platform-evolution-* ainda encaminham). */
export const PLATFORM_WA_QR_WEBHOOK = "platform-whatsapp-qr-webhook";
export const PLATFORM_WA_QR_SEND = "platform-whatsapp-qr-send";
export const PLATFORM_WA_QR_PROXY = "platform-whatsapp-qr-proxy";

export interface PlatformQrProviderConfig {
  provider: WhatsappQrProvider;
  zapi: ZapiConfig | null;
  /** Instância bootstrap (teste): uma conta Z-API pré-criada no painel. */
  bootstrap: ZapiInstanceCreds | null;
}

function asProvider(raw: unknown): WhatsappQrProvider {
  const v = String(raw ?? "").trim().toLowerCase();
  // Default zapi (sanitização A+B). Só 'evolution' explícito mantém o valor legado.
  if (v === "evolution") return "evolution";
  return "zapi";
}

export async function loadPlatformQrProviderConfig(
  supabase: { from: (t: string) => any },
): Promise<PlatformQrProviderConfig> {
  const envProvider = Deno.env.get("WHATSAPP_QR_PROVIDER");
  const envClient = Deno.env.get("ZAPI_CLIENT_TOKEN");
  const envBase = Deno.env.get("ZAPI_BASE_URL");
  const envIid = Deno.env.get("ZAPI_INSTANCE_ID");
  const envItok = Deno.env.get("ZAPI_INSTANCE_TOKEN");

  let row: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from("platform_settings")
      .select(
        "whatsapp_qr_provider, zapi_client_token, zapi_base_url, zapi_bootstrap_instance_id, zapi_bootstrap_instance_token",
      )
      .limit(1)
      .maybeSingle();
    row = data as Record<string, unknown> | null;
  } catch {
    row = null;
  }

  const provider = asProvider(envProvider || row?.whatsapp_qr_provider || "zapi");
  const clientToken = String(envClient || row?.zapi_client_token || "").trim();
  const baseUrl = String(envBase || row?.zapi_base_url || "https://api.z-api.io")
    .trim()
    .replace(/\/$/, "") || "https://api.z-api.io";
  const instanceId = String(envIid || row?.zapi_bootstrap_instance_id || "").trim();
  const instanceToken = String(envItok || row?.zapi_bootstrap_instance_token || "").trim();

  return {
    provider,
    zapi: clientToken ? { baseUrl, clientToken } : null,
    bootstrap: instanceId && instanceToken
      ? { instanceId, instanceToken }
      : null,
  };
}

export function instanceLooksZapi(row: {
  metadata?: unknown;
  instance_id?: string | null;
}): boolean {
  const meta = (row.metadata && typeof row.metadata === "object")
    ? row.metadata as Record<string, unknown>
    : {};
  if (String(meta.provider ?? "").toLowerCase() === "zapi") return true;
  return false;
}

export function zapiCredsFromInstance(row: {
  instance_id?: string | null;
  instance_token?: string | null;
  metadata?: unknown;
}): ZapiInstanceCreds | null {
  const meta = (row.metadata && typeof row.metadata === "object")
    ? row.metadata as Record<string, unknown>
    : {};
  const instanceId = String(
    row.instance_id || meta.zapi_instance_id || "",
  ).trim();
  const instanceToken = String(
    row.instance_token || meta.zapi_instance_token || "",
  ).trim();
  if (!instanceId || !instanceToken) return null;
  return { instanceId, instanceToken };
}

export function buildZapiWebhookUrl(
  supabaseUrl: string,
  creds: ZapiInstanceCreds,
  webhookKey?: string | null,
): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const u = new URL(`${base}/functions/v1/${PLATFORM_WA_QR_WEBHOOK}`);
  u.searchParams.set("provider", "zapi");
  const key = String(webhookKey || Deno.env.get("ZAPI_WEBHOOK_KEY") || "").trim();
  if (key) u.searchParams.set("k", key);
  else {
    u.searchParams.set("iid", creds.instanceId);
    u.searchParams.set("tok", creds.instanceToken);
  }
  return u.toString();
}
