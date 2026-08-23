// Pronto = identidade IG sem telefone; send/subscribe em graph.instagram.com;
// challenge GET + HMAC; zero platform_crm_*.
// deno test --no-lock supabase/functions/_shared/instagram-login-inbox.test.ts

import {
  buildConversationMetadata,
  buildInstagramLoginMessageBody,
  connectionIdFromConversationMetadata,
  extractInboundDms,
  igsidFromVisitorId,
  instagramLoginSendUrl,
  instagramLoginSubscribeFieldsCsv,
  instagramLoginSubscribeUrl,
  matchVerifyChallenge,
  parseInstagramIdentity,
  postInstagramLoginMessage,
  verifyInstagramLoginSignature,
} from './instagram-login-inbox.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('identidade: IGSID / @username, sem visitor_phone', () => {
  const byId = parseInstagramIdentity({ igsid: '17841400000000001' });
  assert(byId?.visitorId === 'ig:17841400000000001', JSON.stringify(byId));
  assert(byId?.igsid === '17841400000000001', JSON.stringify(byId));
  assert(byId?.displayName.startsWith('Instagram '), JSON.stringify(byId));

  const byUser = parseInstagramIdentity({ username: '@falconurbanismo' });
  assert(byUser?.visitorId === 'ig:@falconurbanismo', JSON.stringify(byUser));
  assert(byUser?.username === 'falconurbanismo', JSON.stringify(byUser));
  assert(byUser?.displayName === '@falconurbanismo', JSON.stringify(byUser));

  assert(parseInstagramIdentity({ igsid: '', username: '' }) === null, 'vazio deve falhar');
  assert(parseInstagramIdentity({ igsid: 'abc' }) === null, 'IGSID não numérico');
  assert(igsidFromVisitorId('ig:17841400000000001') === '17841400000000001', 'visitor_id → IGSID');
  assert(igsidFromVisitorId('ig:@falconurbanismo') === null, 'username não é IGSID');
});

Deno.test('metadata aponta para instagram_login_connections, não platform_crm', () => {
  const identity = parseInstagramIdentity({ igsid: '111222333', username: 'cliente' })!;
  const meta = buildConversationMetadata('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', identity);
  assert(meta.channel === 'instagram', JSON.stringify(meta));
  assert(meta.instagram_login_connection_id === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', JSON.stringify(meta));
  assert(meta.instagram_connection_id === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', JSON.stringify(meta));
  assert(meta.ig_sender_id === '111222333', JSON.stringify(meta));
  assert(!JSON.stringify(meta).includes('platform_crm'), JSON.stringify(meta));
  assert(
    connectionIdFromConversationMetadata(meta) === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'lê FK da conexão Login',
  );
  assert(
    connectionIdFromConversationMetadata({
      instagram_connection_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }) === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'lê legado instagram_connection_id',
  );
  assert(connectionIdFromConversationMetadata({ connection_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) === null,
    'não aceita connection_id genérico (evita Page/gestao)');
});

Deno.test('extractInboundDms: object instagram, skip page, marca echo', () => {
  assert(extractInboundDms({ object: 'page', entry: [] }).length === 0, 'page ignorado');
  const dms = extractInboundDms({
    object: 'instagram',
    entry: [{
      id: '17841405822304914',
      messaging: [
        {
          sender: { id: '1343857058977357' },
          recipient: { id: '17841405822304914' },
          message: { mid: 'mid.1', text: 'oi' },
        },
        {
          sender: { id: '17841405822304914' },
          recipient: { id: '1343857058977357' },
          message: { mid: 'mid.echo', text: 'echo', is_echo: true },
        },
      ],
    }],
  });
  assert(dms.length === 2, String(dms.length));
  assert(dms[0].senderId === '1343857058977357' && dms[0].text === 'oi' && !dms[0].isEcho, JSON.stringify(dms[0]));
  assert(dms[1].isEcho === true, JSON.stringify(dms[1]));
});

Deno.test('send e subscribe usam graph.instagram.com, nunca facebook.com', () => {
  const send = instagramLoginSendUrl('v21.0');
  assert(send === 'https://graph.instagram.com/v21.0/me/messages', send);
  assert(!send.includes('facebook.com'), send);
  const sub = instagramLoginSubscribeUrl('17841405822304914', 'v21.0');
  assert(sub.startsWith('https://graph.instagram.com/v21.0/17841405822304914/subscribed_apps'), sub);
  assert(instagramLoginSubscribeFieldsCsv().includes('messages'), instagramLoginSubscribeFieldsCsv());
  const body = buildInstagramLoginMessageBody({ recipientId: '1343857058977357', text: 'resposta' });
  assert((body.recipient as { id: string }).id === '1343857058977357', JSON.stringify(body));
  assert((body.message as { text: string }).text === 'resposta', JSON.stringify(body));
});

Deno.test('GET challenge: subscribe + token certo', () => {
  const bad = matchVerifyChallenge({ mode: 'subscribe', token: null, challenge: '1', expectedToken: 'tok' });
  assert(bad.ok === false && bad.status === 400, JSON.stringify(bad));
  const forbid = matchVerifyChallenge({
    mode: 'subscribe', token: 'errado', challenge: '99', expectedToken: 'tok',
  });
  assert(forbid.ok === false && forbid.status === 403, JSON.stringify(forbid));
  const ok = matchVerifyChallenge({
    mode: 'subscribe', token: 'tok', challenge: '1158201444', expectedToken: 'tok',
  });
  assert(ok.ok === true && ok.challenge === '1158201444', JSON.stringify(ok));
});

Deno.test('HMAC X-Hub-Signature-256 aceita só o app secret Login', async () => {
  const body = '{"object":"instagram"}';
  const okHeader = `sha256=${await (await import('./meta-graph.ts')).hmacSha256Hex('ig-app-secret', body)}`;
  assert(await verifyInstagramLoginSignature('ig-app-secret', body, okHeader), 'assinatura válida');
  assert(!(await verifyInstagramLoginSignature('outro-secret', body, okHeader)), 'secret errado');
  assert(!(await verifyInstagramLoginSignature('ig-app-secret', body, '')), 'sem header');
});

Deno.test('postInstagramLoginMessage chama /me/messages com Bearer', async () => {
  let seenUrl = '';
  let seenAuth = '';
  const fakeFetch = (async (input: URL | Request | string, init?: { headers?: HeadersInit; body?: BodyInit }) => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers).get('Authorization') ?? '';
    assert(String(init?.body ?? '').includes('1343857058977357'), String(init?.body));
    return new Response(JSON.stringify({ message_id: 'mid.out' }), { status: 200 });
  }) as typeof fetch;
  const res = await postInstagramLoginMessage({
    accessToken: 'IGTOKEN',
    recipientId: '1343857058977357',
    text: 'olá',
    fetchFn: fakeFetch,
  });
  assert(res.ok === true && res.ok && res.message_id === 'mid.out', JSON.stringify(res));
  assert(seenUrl.includes('graph.instagram.com') && seenUrl.includes('/me/messages'), seenUrl);
  assert(!seenUrl.includes('facebook.com'), seenUrl);
  assert(seenAuth === 'Bearer IGTOKEN', seenAuth);
});
