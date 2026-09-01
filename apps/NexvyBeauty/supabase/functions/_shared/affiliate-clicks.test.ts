// Incremento de cliques em affiliate_links.
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-clicks.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { incrementAffiliateLinkClicks } from './affiliate-clicks.ts';

function makeAdmin(rpcResult: { data: unknown; error: unknown }) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    admin: {
      rpc: (name: string, args: unknown) => {
        calls.push({ name, args });
        return Promise.resolve(rpcResult);
      },
    },
    calls,
  };
}

Deno.test('?ref= válido incrementa clicks via record_affiliate_click', async () => {
  const { admin, calls } = makeAdmin({ data: 'aff-1', error: null });
  const res = await incrementAffiliateLinkClicks(admin, 'Maria', false);
  assertEquals(res.incremented, true);
  assertEquals(res.affiliateId, 'aff-1');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, 'record_affiliate_click');
  assertEquals((calls[0].args as { p_ref: string }).p_ref, 'Maria');
});

Deno.test('não incrementa se o clique já foi gravado (page-load)', async () => {
  const { admin, calls } = makeAdmin({ data: 'aff-1', error: null });
  const res = await incrementAffiliateLinkClicks(admin, 'Maria', true);
  assertEquals(res.incremented, false);
  assertEquals(calls.length, 0);
});

Deno.test('não incrementa sem ref', async () => {
  const { admin, calls } = makeAdmin({ data: 'aff-1', error: null });
  const res = await incrementAffiliateLinkClicks(admin, null, false);
  assertEquals(res.incremented, false);
  assertEquals(calls.length, 0);
});

Deno.test('ref inexistente não incrementa', async () => {
  const { admin, calls } = makeAdmin({ data: null, error: null });
  const res = await incrementAffiliateLinkClicks(admin, 'ghost', false);
  assertEquals(res.incremented, false);
  assertEquals(res.affiliateId, null);
  assertEquals(calls.length, 1);
});
