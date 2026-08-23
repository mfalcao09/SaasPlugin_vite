// deno test — refine de produto (regra B) compartilhado por lead manual, import, agenda e tarefa.
//   deno test --no-check apps/NexvyBeauty/src/components/superadmin/crm/leads/createPlatformCrmLeadProduct.test.ts
//
// NÃO é grupoCrmHost (F5 rejeitado; esse arquivo não volta).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isCreateLeadProductRequired,
  resolveCreateLeadProductId,
  validateCreateLeadProduct,
} from './createPlatformCrmLeadProduct.ts';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';

Deno.test('Todos + catálogo: produto é obrigatório — refine recusa vazio', () => {
  assertEquals(isCreateLeadProductRequired(null, true), true);
  const r = validateCreateLeadProduct({
    lockedProductId: null,
    selectedProductId: '',
    catalogHasProducts: true,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.length > 0, true);
});

Deno.test('Todos + catálogo: aceita o produto escolhido (não o primeiro da lista)', () => {
  const r = validateCreateLeadProduct({
    lockedProductId: null,
    selectedProductId: P2,
    catalogHasProducts: true,
  });
  assertEquals(r, { ok: true, productId: P2 });
  assertEquals(
    resolveCreateLeadProductId({
      lockedProductId: null,
      selectedProductId: P2,
      catalogHasProducts: true,
    }),
    P2,
  );
});

Deno.test('Switcher com produto ativo: locked vence — selected vazio ou outro id não muda o carimbo', () => {
  assertEquals(isCreateLeadProductRequired(P1, true), false);
  assertEquals(
    validateCreateLeadProduct({
      lockedProductId: P1,
      selectedProductId: '',
      catalogHasProducts: true,
    }),
    { ok: true, productId: P1 },
  );
  assertEquals(
    resolveCreateLeadProductId({
      lockedProductId: P1,
      selectedProductId: P2,
      catalogHasProducts: true,
    }),
    P1,
  );
});

Deno.test('Catálogo vazio: sem campo — product_id null (degenerado)', () => {
  assertEquals(isCreateLeadProductRequired(null, false), false);
  assertEquals(
    validateCreateLeadProduct({
      lockedProductId: null,
      selectedProductId: undefined,
      catalogHasProducts: false,
    }),
    { ok: true, productId: null },
  );
});

Deno.test('Nunca cai em products[0] / effectiveProductId', () => {
  const firstOfCatalog = P1;
  const resolved = resolveCreateLeadProductId({
    lockedProductId: null,
    selectedProductId: '',
    catalogHasProducts: true,
  });
  assertEquals(resolved, null);
  assertEquals(resolved === firstOfCatalog, false);
});
