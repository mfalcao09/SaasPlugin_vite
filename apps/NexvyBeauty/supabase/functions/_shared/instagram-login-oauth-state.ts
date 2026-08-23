// State HMAC do Instagram Login (mesmo primitivo do Ads OAuth).
// Token: `<base64url(JSON)>.<hmac_hex>`. Segredo: STATE_SIGNING_SECRET
// (fallback SERVICE_ROLE). Payload carrega organization_id do tenant.

import { hmacSha256Hex, timingSafeEqual } from './meta-graph.ts';

export interface InstagramLoginStatePayload {
  organization_id: string;
  connected_by: string | null;
  nonce: string;
  ts: number;
}

export function getStateSecret(): string {
  const s = Deno.env.get('STATE_SIGNING_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!s) throw new Error('state secret ausente: defina STATE_SIGNING_SECRET');
  return s;
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

export async function signState(payload: InstagramLoginStatePayload, secret: string): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, body);
  return `${body}.${sig}`;
}

export async function verifyState(
  token: string,
  secret: string,
  maxAgeMs = 15 * 60 * 1000,
): Promise<InstagramLoginStatePayload | null> {
  if (!token || !token.includes('.')) return null;
  const dot = token.lastIndexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as InstagramLoginStatePayload;
    if (!payload?.organization_id || typeof payload.ts !== 'number') return null;
    if (Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}
