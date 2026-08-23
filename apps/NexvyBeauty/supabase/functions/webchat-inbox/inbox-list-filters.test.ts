// deno test --no-lock supabase/functions/webchat-inbox/inbox-list-filters.test.ts
import { normalizeInboxChannels, parseConnectionKeys, TENANT_INBOX_CHANNELS } from './inbox-list-filters.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('p_channel=instagram é aceito (sem 500 / sem rejeitar canal)', () => {
  assert(TENANT_INBOX_CHANNELS.includes('instagram'), 'instagram está na lista tenant');
  assert(normalizeInboxChannels('instagram') === 'instagram', 'instagram normaliza para si');
  assert(normalizeInboxChannels('INSTAGRAM') === 'instagram', 'instagram case-insensitive');
});

Deno.test('channel vira lista Site + WhatsApp QR + Instagram', () => {
  assert(
    normalizeInboxChannels('whatsapp,instagram,webchat') === 'whatsapp,instagram,webchat',
    'lista canônica',
  );
  assert(normalizeInboxChannels('whatsapp, oficial, email') === 'whatsapp', 'descarta Oficial/Email');
  assert(normalizeInboxChannels('sms,evolution') === null, 'sem canais inválidos');
});

Deno.test('connection keys evolution|instagram', () => {
  const evo = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const ig = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const parsed = parseConnectionKeys(`evolution:${evo},instagram:${ig},meta:${evo}`);
  assert(parsed?.length === 2, `esperava 2 keys, veio ${parsed?.length}`);
  assert(parsed?.[0] === `evolution:${evo}`, 'evolution key');
  assert(parsed?.[1] === `instagram:${ig}`, 'instagram key');
});
