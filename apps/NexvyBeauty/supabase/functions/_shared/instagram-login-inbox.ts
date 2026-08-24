// Inbox do tenant (app.*) para Instagram Login — graph.instagram.com.
// NÃO é Page / Messenger / platform-instagram-webhook.
// Persistência: webchat_conversations.channel='instagram' + instagram_login_connections.
// Nunca gravar em platform_crm_*.

import { DEFAULT_GRAPH_VERSION } from './instagram-login-oauth.ts';
import { hmacSha256Hex, timingSafeEqual } from './meta-graph.ts';

export const IG_LOGIN_GRAPH_HOST = 'https://graph.instagram.com';

export const IG_LOGIN_SUBSCRIBE_FIELDS = [
  'messages',
  'message_reactions',
  'messaging_postbacks',
  'messaging_referral',
  'messaging_seen',
  'messaging_optins',
] as const;

export function instagramLoginGraphVersion(override?: string): string {
  if (override && override.trim()) return override.trim();
  try {
    const fromEnv = Deno.env.get('INSTAGRAM_LOGIN_GRAPH_VERSION');
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  } catch {
    /* testes sem Deno.env */
  }
  return DEFAULT_GRAPH_VERSION;
}

export function instagramLoginGraphBase(version?: string): string {
  return `${IG_LOGIN_GRAPH_HOST}/${instagramLoginGraphVersion(version)}`;
}

export function instagramLoginSendUrl(version?: string): string {
  const url = `${instagramLoginGraphBase(version)}/me/messages`;
  assertNotFacebookGraph(url);
  return url;
}

/** Documentado em tasks/INSTAGRAM-LOGIN-WEBHOOK-SUBSCRIBE-2026-08-23.md — não é gate de Live. */
export function instagramLoginSubscribeUrl(igUserId: string, version?: string): string {
  const id = String(igUserId || '').trim();
  if (!id) throw new Error('instagram user id ausente');
  const url = `${instagramLoginGraphBase(version)}/${encodeURIComponent(id)}/subscribed_apps`;
  assertNotFacebookGraph(url);
  return url;
}

export function instagramLoginSubscribeFieldsCsv(): string {
  return IG_LOGIN_SUBSCRIBE_FIELDS.join(',');
}

export function assertNotFacebookGraph(url: string): void {
  if (url.includes('graph.facebook.com')) {
    throw new Error('Instagram Login deve usar graph.instagram.com, não graph.facebook.com');
  }
}

export function normalizeInstagramUsername(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const u = String(raw).trim().replace(/^@+/, '');
  if (!u) return null;
  if (!/^[A-Za-z0-9._]{1,40}$/.test(u)) return null;
  return u;
}

export function normalizeIgsid(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s.toLowerCase().startsWith('ig:')) s = s.slice(3);
  if (s.startsWith('@')) return null;
  if (!/^\d{5,128}$/.test(s)) return null;
  return s;
}

export type InstagramIdentity = {
  visitorId: string;
  igsid: string | null;
  username: string | null;
  displayName: string;
};

export function parseInstagramIdentity(input: {
  igsid?: string | null;
  username?: string | null;
  name?: string | null;
}): InstagramIdentity | null {
  const igsid = normalizeIgsid(input.igsid ?? null);
  const username = normalizeInstagramUsername(input.username ?? null);
  const name = typeof input.name === 'string' ? input.name.trim() || null : null;
  if (!igsid && !username) return null;
  const visitorId = igsid ? `ig:${igsid}` : `ig:@${username}`;
  const displayName = name
    || (username ? `@${username}` : `Instagram ${String(igsid).slice(-4)}`);
  return { visitorId, igsid, username, displayName };
}

export function igsidFromVisitorId(visitorId: string | null | undefined): string | null {
  return normalizeIgsid(visitorId);
}

function uuidOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

export function connectionIdFromConversationMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  return uuidOrNull(m.instagram_login_connection_id)
    ?? uuidOrNull(m.instagram_connection_id);
}

export function buildConversationMetadata(
  connectionId: string,
  identity: InstagramIdentity,
): Record<string, unknown> {
  return {
    channel: 'instagram',
    instagram_login_connection_id: connectionId,
    instagram_connection_id: connectionId,
    ...(identity.igsid ? { ig_sender_id: identity.igsid } : {}),
    ...(identity.username ? { ig_username: identity.username } : {}),
  };
}

export type InstagramInboundDm = {
  accountId: string;
  senderId: string;
  recipientId: string;
  mid: string;
  text: string | null;
  isEcho: boolean;
  attachmentType: string | null;
  attachmentUrl: string | null;
};

export function extractInboundDms(payload: unknown): InstagramInboundDm[] {
  const root = payload as Record<string, unknown> | null;
  if (!root || root['object'] !== 'instagram') return [];
  const entries = Array.isArray(root['entry']) ? root['entry'] : [];
  const out: InstagramInboundDm[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const accountId = String(e['id'] ?? '');
    const messaging = Array.isArray(e['messaging']) ? e['messaging'] : [];
    for (const evt of messaging) {
      if (!evt || typeof evt !== 'object') continue;
      const ev = evt as Record<string, unknown>;
      const msg = (ev['message'] as Record<string, unknown> | undefined) ?? {};
      const sender = (ev['sender'] as Record<string, unknown> | undefined) ?? {};
      const recipient = (ev['recipient'] as Record<string, unknown> | undefined) ?? {};
      const atts = Array.isArray(msg['attachments']) ? msg['attachments'] as Record<string, unknown>[] : [];
      const first = atts[0];
      const attPayload = (first?.['payload'] as Record<string, unknown> | undefined) ?? undefined;
      out.push({
        accountId,
        senderId: String(sender['id'] ?? ''),
        recipientId: String(recipient['id'] ?? ''),
        mid: String(msg['mid'] ?? ''),
        text: typeof msg['text'] === 'string' ? msg['text'] : null,
        isEcho: Boolean(msg['is_echo']) || Boolean(ev['is_self']),
        attachmentType: first ? String(first['type'] ?? 'file') : null,
        attachmentUrl: attPayload && typeof attPayload['url'] === 'string'
          ? String(attPayload['url'])
          : null,
      });
    }
  }
  return out;
}

export function matchVerifyChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string;
}): { ok: true; challenge: string } | { ok: false; status: 400 | 403 } {
  if (input.mode !== 'subscribe' || !input.token || !input.challenge) {
    return { ok: false, status: 400 };
  }
  if (!input.expectedToken || input.token !== input.expectedToken) {
    return { ok: false, status: 403 };
  }
  return { ok: true, challenge: input.challenge };
}

export async function verifyInstagramLoginSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!appSecret || !signatureHeader) return false;
  const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
  return timingSafeEqual(expected, signatureHeader);
}

export function buildInstagramLoginMessageBody(opts: {
  recipientId: string;
  text?: string;
  media?: { url: string; type?: string };
}): Record<string, unknown> {
  const recipientId = String(opts.recipientId ?? '').trim();
  if (!recipientId) throw new Error('recipient IGSID ausente');
  const recipient = { id: recipientId };
  if (opts.media?.url) {
    const t = String(opts.media.type ?? 'image');
    const type = ['image', 'video', 'audio', 'file'].includes(t) ? t : 'image';
    return {
      recipient,
      message: {
        attachment: {
          type,
          payload: { url: opts.media.url },
        },
      },
    };
  }
  return {
    recipient,
    message: { text: String(opts.text ?? '') },
  };
}

export type InstagramLoginSendResult =
  | { ok: true; message_id: string | null }
  | { ok: false; error: string; status: number };

export type InstagramLoginSubscribeResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/** POST /{ig-user-id}/subscribed_apps — Instagram Login, token só no Bearer. */
export function instagramLoginSubscribeRequestUrl(
  igUserId: string,
  version?: string,
): string {
  const url = new URL(instagramLoginSubscribeUrl(igUserId, version));
  url.searchParams.set('subscribed_fields', instagramLoginSubscribeFieldsCsv());
  assertNotFacebookGraph(url.toString());
  return url.toString();
}

export async function postInstagramLoginSubscribe(opts: {
  accessToken: string;
  instagramUserId: string;
  graphVersion?: string;
  fetchFn?: typeof fetch;
}): Promise<InstagramLoginSubscribeResult> {
  if (!String(opts.accessToken ?? '').trim()) {
    return { ok: false, error: 'access token ausente', status: 0 };
  }
  let url: string;
  try {
    url = instagramLoginSubscribeRequestUrl(opts.instagramUserId, opts.graphVersion);
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e), status: 0 };
  }
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    const json = await res.json().catch(() => ({})) as {
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.error?.message ?? `subscribed_apps ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e), status: 0 };
  }
}

export async function postInstagramLoginMessage(opts: {
  accessToken: string;
  recipientId: string;
  text?: string;
  media?: { url: string; type?: string };
  graphVersion?: string;
  fetchFn?: typeof fetch;
}): Promise<InstagramLoginSendResult> {
  const url = instagramLoginSendUrl(opts.graphVersion);
  const body = buildInstagramLoginMessageBody({
    recipientId: opts.recipientId,
    text: opts.text,
    media: opts.media,
  });
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as {
    message_id?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.error?.message ?? `instagram send ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, message_id: json.message_id ?? null };
}
