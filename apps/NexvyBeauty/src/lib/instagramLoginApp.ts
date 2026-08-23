// App NEXVY - IGLOG (Instagram Login). NÃO é o app WhatsApp 1289456453376034.
// client_id público — o secret vive só em Function secrets.
export const INSTAGRAM_LOGIN_APP_ID = import.meta.env
  .VITE_META_INSTAGRAM_LOGIN_APP_ID as string | undefined;

export const INSTAGRAM_LOGIN_ENABLED = Boolean(INSTAGRAM_LOGIN_APP_ID);
