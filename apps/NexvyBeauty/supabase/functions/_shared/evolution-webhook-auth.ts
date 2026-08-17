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

/** Credenciais reenviadas pela Evolution no corpo e/ou nos headers. */
export function extractEvolutionWebhookCredentials(
  payload: unknown,
  headers: Headers,
): string[] {
  const body = payload as
    | { apikey?: unknown; data?: { apikey?: unknown } }
    | null;
  const bearer = (headers.get("authorization") || "").match(
    /^Bearer\s+(.+)$/i,
  );
  const candidates = [
    typeof body?.apikey === "string" ? body.apikey.trim() : "",
    typeof body?.data?.apikey === "string" ? body.data.apikey.trim() : "",
    (headers.get("apikey") || "").trim(),
    (headers.get("x-webhook-token") || "").trim(),
    bearer ? bearer[1].trim() : "",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

export function authenticateEvolutionWebhookCallback(
  expectedToken: string | null | undefined,
  payload: unknown,
  headers: Headers,
): EvolutionWebhookAuthResult {
  const receivedTokens = extractEvolutionWebhookCredentials(payload, headers);
  if (receivedTokens.length === 0) return { ok: false, reason: "no_token" };

  const knownToken = String(expectedToken ?? "").trim();
  let matched = false;
  for (const receivedToken of receivedTokens) {
    matched = timingSafeEqual(receivedToken, knownToken) || matched;
  }
  if (!knownToken || !matched) {
    return { ok: false, reason: "token_mismatch" };
  }
  return { ok: true };
}

/** Flip: `supabase secrets set TENANT_WEBHOOK_AUTH_ENFORCE=true`. Default off. */
export function isTenantWebhookAuthEnforceEnabled(
  raw: string | undefined | null = Deno.env.get("TENANT_WEBHOOK_AUTH_ENFORCE"),
): boolean {
  return String(raw ?? "").trim().toLowerCase() === "true";
}

export function tenantWebhookUnauthorizedResponse(
  reason: string,
  corsHeaders?: HeadersInit,
): Response {
  console.warn(`[evolution-webhook] 401 auth reason=${reason}`);
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
