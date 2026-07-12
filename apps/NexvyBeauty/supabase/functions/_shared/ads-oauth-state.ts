// _shared/ads-oauth-state.ts
// State ASSINADO (HMAC-SHA256) do OAuth de Meta Ads. O `state` viaja pelo
// browser do usuário (start -> Facebook -> callback), então NÃO pode ser
// confiável: assinamos o payload com um segredo server-only e validamos a
// assinatura no callback antes de tocar o banco.
//
// Formato do token: `<base64url(JSON payload)>.<hmac_hex>`.
// Segredo: STATE_SIGNING_SECRET (Function secret) com fallback para a
// SERVICE_ROLE key — ambos existem só no servidor e nunca chegam ao client.
// Reusa hmacSha256Hex/timingSafeEqual de meta-graph.ts (mesmo primitivo do
// X-Hub-Signature dos webhooks).

import { hmacSha256Hex, timingSafeEqual } from './meta-graph.ts';

export interface AdsOAuthStatePayload {
  product_id: string;
  /** uuid do super_admin que iniciou o fluxo (grava em connected_by). */
  connected_by: string | null;
  /** entropia anti-CSRF por request. NÃO há replay-store server-side: o replay
   *  é barrado pelo `code` single-use da Meta + a janela de 15min (ts), não pelo nonce. */
  nonce: string;
  /** epoch ms de emissão (validamos janela de expiração no callback). */
  ts: number;
}

/** Segredo de assinatura: env dedicada > SERVICE_ROLE (ambos server-only). */
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

/** Assina o payload e devolve o token `<b64url>.<hmac>` para o parâmetro state. */
export async function signState(payload: AdsOAuthStatePayload, secret: string): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, body);
  return `${body}.${sig}`;
}

/**
 * Valida assinatura (timing-safe) + janela de expiração e devolve o payload.
 * Retorna null em qualquer falha (assinatura inválida, formato quebrado, expirado).
 */
export async function verifyState(
  token: string,
  secret: string,
  maxAgeMs = 15 * 60 * 1000,
): Promise<AdsOAuthStatePayload | null> {
  if (!token || !token.includes('.')) return null;
  const dot = token.lastIndexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as AdsOAuthStatePayload;
    if (!payload?.product_id || typeof payload.ts !== 'number') return null;
    if (Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}
