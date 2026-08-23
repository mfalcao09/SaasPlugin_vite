// Protocolo do pop-up Instagram Login (tenant app.*). Ads continua same-tab.
export const INSTAGRAM_OAUTH_POPUP_NAME = 'nexvy-instagram-oauth';
export const INSTAGRAM_OAUTH_POPUP_FEATURES =
  'popup=yes,width=600,height=720,scrollbars=yes,resizable=yes';
export const INSTAGRAM_OAUTH_MESSAGE_SOURCE = 'nexvy-instagram-oauth';

export type InstagramOAuthPopupMessage = {
  source: typeof INSTAGRAM_OAUTH_MESSAGE_SOURCE;
  ok: boolean;
  error?: string;
};

export function isInstagramOAuthPopupMessage(
  data: unknown,
): data is InstagramOAuthPopupMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Partial<InstagramOAuthPopupMessage>;
  return msg.source === INSTAGRAM_OAUTH_MESSAGE_SOURCE && typeof msg.ok === 'boolean';
}

export function notifyInstagramOAuthOpener(payload: { ok: boolean; error?: string }): boolean {
  if (!window.opener || window.opener.closed) return false;
  const message: InstagramOAuthPopupMessage = {
    source: INSTAGRAM_OAUTH_MESSAGE_SOURCE,
    ok: payload.ok,
    ...(payload.error ? { error: payload.error } : {}),
  };
  window.opener.postMessage(message, window.location.origin);
  window.close();
  return true;
}
