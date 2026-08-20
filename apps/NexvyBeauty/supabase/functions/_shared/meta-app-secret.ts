// Fonte DECLARADA do app secret do webhook Meta.
//
// Nunca inferir pela ausência de `app_secret_encrypted`. NULL significa só
// "não tem" — e ausência NEGA. `app_secret_source === 'platform'` é o único
// sinal de que o secret vive em env do app Nexvy.

import { decryptSecret } from './meta-crypto.ts';

export async function resolveDeclaredAppSecret(conn: {
  app_secret_source?: string | null;
  app_secret_encrypted?: string | null;
}): Promise<string> {
  if (conn.app_secret_source === 'platform') {
    return Deno.env.get('META_WHATSAPP_APP_SECRET') || Deno.env.get('META_ADS_APP_SECRET') || '';
  }
  if (conn.app_secret_encrypted) {
    return await decryptSecret(conn.app_secret_encrypted);
  }
  return '';
}
