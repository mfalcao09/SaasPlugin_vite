// ─── evolution-core — mecânica compartilhada de conversa com o Evolution Go ───
//
// ⚠️ DÍVIDA CONHECIDA (2026-07-20): estas funções são CÓPIA VERBATIM do topo de
// `evolution-proxy/index.ts` (linhas 9-193). Hoje o Evolution Go é falado por
// SEIS cópias privadas do mesmo código (evolution-proxy, platform-evolution-proxy,
// demo-evolution, evolution-send, platform-evolution-send, wipe-demo-org) —
// nenhuma exportada. Este módulo nasceu para a `onboarding-evolution` não criar
// a sétima cópia à mão, e para que a unificação futura seja "apagar as cópias e
// importar daqui" em vez de arqueologia.
//
// Ao mexer em QUALQUER coisa aqui, mexa também no proxy (ou faça a unificação).
// O item mais sensível é `normalizeQrString`: o Evolution Go pode devolver
// "data:image/png;base64,…|2@pairing" e guardar o valor combinado produz um QR
// que PARECE válido e o WhatsApp rejeita.

export interface EvolutionConfig {
  url: string;
  globalApiKey: string;
}

/** Config GLOBAL do Evolution Go em `platform_settings` — fonte única. */
export async function getPlatformConfig(supabase: any): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from("platform_settings")
    .select("evolution_go_url, evolution_go_global_api_key")
    .limit(1)
    .maybeSingle();

  if (!data?.evolution_go_url || !data?.evolution_go_global_api_key) return null;

  return {
    url: String(data.evolution_go_url).replace(/\/$/, ""),
    globalApiKey: String(data.evolution_go_global_api_key),
  };
}

export async function evoFetch(
  config: EvolutionConfig,
  path: string,
  init: RequestInit = {},
  instanceToken?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: instanceToken || config.globalApiKey,
    ...(init.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, { ...init, headers });
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      message: `Falha ao conectar em ${config.url}: ${err.message}`,
    };
  }
  const text = await res.text();
  let body: any;
  let isJson = false;
  try {
    body = text ? JSON.parse(text) : null;
    isJson = true;
  } catch {
    body = text;
    isJson = false;
  }
  let message: string | undefined;
  if (!res.ok) {
    if (!isJson && typeof body === "string") {
      message = `Servidor respondeu ${res.status}: ${body.slice(0, 200)}`;
    } else if (isJson && body?.message) {
      message = String(body.message);
    } else if (isJson && body?.error) {
      message = String(body.error);
    }
  }
  return { ok: res.ok, status: res.status, body, message, isJson };
}

/** Nunca logar chave em claro (regra de segredos). */
export function maskKey(k?: string | null): string {
  if (!k) return "(empty)";
  return k.length <= 8 ? "***" : `${k.slice(0, 5)}***${k.slice(-3)}`;
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;

  // Evolution Go may return "data:image/png;base64,...|2@raw-pairing".
  // The QR must encode only the raw pairing string; storing the combined value
  // creates a QR that looks valid visually but WhatsApp rejects it.
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

export function extractQr(obj: any): string | null {
  if (!obj) return null;
  const normalized = normalizeQrString(obj);
  if (normalized) return normalized;

  const candidates = [
    obj.qrcode, obj.qr, obj.base64, obj.code, obj.QRCode, obj.qr_code,
    obj?.qrcode?.base64, obj?.qrcode?.code,
    obj?.data?.qrcode, obj?.data?.qr, obj?.data?.base64, obj?.data?.QRCode, obj?.data?.code,
    obj?.data?.qrcode?.base64, obj?.data?.qrcode?.code,
    obj?.instance?.qrcode, obj?.instance?.qr,
  ];
  for (const c of candidates) {
    const found = extractQr(c);
    if (found) return found;
  }
  return null;
}

// Eventos que o evolution-webhook realmente trata (nomes da v2.3.7).
// MESSAGES_SET/CHATS_SET/CONTACTS_SET = chunks de HISTÓRICO (syncFullHistory) —
// o evolution-webhook encaminha pra evolution-history-sync, que monta a carteira
// de clientes do salão (F6). Sem eles, o "raio-x" nasce vazio.
export const WEBHOOK_EVENTS = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "CHATS_SET",
  "CONTACTS_SET",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "SEND_MESSAGE",
];

// v2.3.7: webhook por instância via POST /webhook/set/{instanceName}.
// Instâncias são endereçadas por instanceName (coluna `name`), NÃO pelo uuid.
export async function configureWebhook(
  config: EvolutionConfig,
  instanceName: string,
  instanceToken: string | null | undefined,
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string; status?: number; response?: any }> {
  if (!instanceName) return { ok: false, error: "Nome da instância ausente." };
  if (!instanceToken) return { ok: false, error: "Token da instância ausente." };

  console.log(`[configureWebhook] name=${instanceName} apikey=${maskKey(instanceToken)}`);

  const res = await evoFetch(
    config,
    `/webhook/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: { enabled: true, url: webhookUrl, events: WEBHOOK_EVENTS },
      }),
    },
    instanceToken,
  );

  console.log(
    `[configureWebhook] name=${instanceName} status=${res.status} ok=${res.ok}`,
    typeof res.body === "string" ? res.body.slice(0, 200) : res.body,
  );

  if (res.ok) return { ok: true, status: res.status, response: res.body };

  return {
    ok: false,
    status: res.status,
    error: res.message || `Falha ao configurar webhook (status ${res.status}).`,
    response: res.body,
  };
}

/** Slug curto e seguro para prefixar o nome da instância (evita colisão global
 *  no Evolution Go, que tem namespace único entre TODOS os salões). */
export function orgSlugify(raw: string, max = 20): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}
