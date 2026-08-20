// Roteamento do webhook Cloud API — plataforma vs tenant vs colisão.
// Roda: deno test --no-lock supabase/functions/_shared/meta-webhook-routing.test.ts
//
// Procurado antes de criar: supabase/functions/**/*.test.ts,
// *webhook*test*, COLISÃO/collision/scope_collision. Nenhum teste cobria
// este resolvedor. A lógica viva estava só em platform-meta-whatsapp-webhook.

import {
  decideMetaWebhookRoute,
  lookupMetaWebhookConnections,
  SCOPE_COLLISION_STATUS,
  SCOPE_COLLISION_ERROR,
} from './meta-webhook-routing.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg} — esperado ${expected}, veio ${actual}`);
}

const PLATFORM = { id: 'plat-vendas', product_id: 'prod-1' };
const TENANT = { id: 'ten-salon', organization_id: 'org-1' };

Deno.test('platform-only → inbox plataforma, 200', () => {
  const d = decideMetaWebhookRoute(PLATFORM, null);
  eq(d.scope, 'platform', 'scope');
  eq(d.inbox, 'platform', 'inbox');
  eq(d.connectionId, PLATFORM.id, 'connectionId');
  eq(d.httpStatus, 200, 'http');
  assert(d.httpStatus < 400, 'não é 4xx');
});

Deno.test('tenant-only → inbox tenant, 200', () => {
  const d = decideMetaWebhookRoute(null, TENANT);
  eq(d.scope, 'tenant', 'scope');
  eq(d.inbox, 'tenant', 'inbox');
  eq(d.connectionId, TENANT.id, 'connectionId');
  eq(d.httpStatus, 200, 'http');
});

Deno.test('colisão → nenhuma inbox, 4xx', () => {
  const d = decideMetaWebhookRoute(PLATFORM, TENANT);
  eq(d.scope, 'collision', 'scope');
  eq(d.inbox, null, 'inbox');
  eq(d.connectionId, null, 'connectionId');
  assert(d.httpStatus >= 400 && d.httpStatus < 500, 'http 4xx');
  eq(d.httpStatus, SCOPE_COLLISION_STATUS, 'status 409');
  eq(SCOPE_COLLISION_ERROR, 'scope_collision', 'error code');
});

Deno.test('nenhum lado → none, sem inbox', () => {
  const d = decideMetaWebhookRoute(null, null);
  eq(d.scope, 'none', 'scope');
  eq(d.inbox, null, 'inbox');
  eq(d.httpStatus, 200, 'ack sem atribuição');
});

function fakeDualTables(opts: {
  platform?: { id: string; product_id?: string | null } | null;
  tenant?: { id: string; organization_id?: string | null } | null;
}) {
  return {
    from(table: string) {
      const row =
        table === 'platform_crm_whatsapp_meta_connections'
          ? opts.platform ?? null
          : table === 'whatsapp_meta_connections'
            ? opts.tenant ?? null
            : null;
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

Deno.test('lookup platform-only → decide inbox plataforma', async () => {
  const found = await lookupMetaWebhookConnections(
    fakeDualTables({ platform: PLATFORM }),
    'pn-1',
  );
  const d = decideMetaWebhookRoute(found.platform, found.tenant);
  eq(d.inbox, 'platform', 'inbox via lookup');
  eq(d.scope, 'platform', 'scope via lookup');
});

Deno.test('lookup colisão → 4xx, sem inbox', async () => {
  const found = await lookupMetaWebhookConnections(
    fakeDualTables({ platform: PLATFORM, tenant: TENANT }),
    'pn-dup',
  );
  const d = decideMetaWebhookRoute(found.platform, found.tenant);
  eq(d.scope, 'collision', 'scope via lookup');
  eq(d.inbox, null, 'sem inbox');
  assert(d.httpStatus >= 400 && d.httpStatus < 500, '4xx via lookup');
});
