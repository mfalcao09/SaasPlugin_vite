export type EvolutionWebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: "no_token" | "token_mismatch" };

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < aBytes.length; index++) {
    difference |= aBytes[index] ^ bBytes[index];
  }
  return difference === 0;
}

/** Token reenviado pela Evolution: corpo (apikey, v2) OU header (fallback). */
export function extractEvolutionWebhookToken(
  payload: unknown,
  headers: Headers,
): string {
  const body = payload as
    | { apikey?: unknown; data?: { apikey?: unknown } }
    | null;
  const bodyToken = (typeof body?.apikey === "string" && body.apikey.trim()) ||
    (typeof body?.data?.apikey === "string" && body.data.apikey.trim()) ||
    "";
  if (bodyToken) return bodyToken;

  const headerToken = (
    headers.get("apikey") ||
    headers.get("x-webhook-token") ||
    ""
  ).trim();
  if (headerToken) return headerToken;

  const bearer = (headers.get("authorization") || "").match(
    /^Bearer\s+(.+)$/i,
  );
  return bearer ? bearer[1].trim() : "";
}

export function authenticateEvolutionWebhookCallback(
  expectedToken: string | null | undefined,
  payload: unknown,
  headers: Headers,
): EvolutionWebhookAuthResult {
  const receivedToken = extractEvolutionWebhookToken(payload, headers);
  if (!receivedToken) return { ok: false, reason: "no_token" };

  const knownToken = String(expectedToken ?? "").trim();
  if (!knownToken || !timingSafeEqual(receivedToken, knownToken)) {
    return { ok: false, reason: "token_mismatch" };
  }
  return { ok: true };
}
