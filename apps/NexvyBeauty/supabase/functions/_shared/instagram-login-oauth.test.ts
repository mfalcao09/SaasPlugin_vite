// Pronto = esta URL tem os 2 escopos Direct e NÃO tem publish/comments/insights.
// deno test --no-lock supabase/functions/_shared/instagram-login-oauth.test.ts

import {
  buildAuthorizeUrl,
  FORBIDDEN_INSTAGRAM_SCOPES,
  SCOPES_INSTAGRAM_LOGIN,
  parseTokenExchange,
} from './instagram-login-oauth.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('authorize URL: Direct-only scopes, no content/comments/insights', () => {
  const url = buildAuthorizeUrl({
    clientId: '1929207701368774',
    redirectUri: 'https://app.nexvybeauty.com.br/instagram/oauth-return',
    state: 'test-state',
  });

  assert(url.includes('instagram.com/oauth/authorize'), `host Instagram Login: ${url}`);
  assert(!url.includes('facebook.com/dialog/oauth'), `não é Facebook Login: ${url}`);
  assert(url.includes('client_id=1929207701368774'), `client_id IGLOG: ${url}`);
  assert(url.includes('instagram_business_basic'), `falta basic: ${url}`);
  assert(url.includes('instagram_business_manage_messages'), `falta manage_messages: ${url}`);

  for (const forbidden of FORBIDDEN_INSTAGRAM_SCOPES) {
    assert(!url.includes(forbidden), `escopo proibido ${forbidden} na URL: ${url}`);
  }
  assert(!url.includes('content_publish'), url);
  assert(!url.includes('manage_comments'), url);
  assert(!url.includes('manage_insights'), url);

  assert(SCOPES_INSTAGRAM_LOGIN.length === 2, 'só dois escopos Direct');
});

Deno.test('parseTokenExchange aceita payload plano e data[]', () => {
  const a = parseTokenExchange({ access_token: 'tok', user_id: '99' });
  assert(a.access_token === 'tok' && a.user_id === '99', JSON.stringify(a));
  const b = parseTokenExchange({ data: [{ access_token: 't2', user_id: '88' }] });
  assert(b.access_token === 't2' && b.user_id === '88', JSON.stringify(b));
});
