// Testes do núcleo puro do motor de payout (Fase 5).
// Rodar: deno test apps/NexvyBeauty/supabase/functions/affiliate-payout/payout-core.test.ts
// Mocka a porta PayoutDb (sem banco) — prova agregação, criação de lote, marcação
// idempotente approved→paid, e o adapter STUB que NÃO move dinheiro.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type CommissionRow,
  confirmItem,
  createBatch,
  groupApproved,
  listApproved,
  type PayoutBatchRow,
  type PayoutDb,
  type PayoutItemRow,
  processBatch,
} from './payout-core.ts';

// In-memory fake do PayoutDb: simula banco + guard idempotente approved→paid.
function makeFakeDb(seed?: {
  commissions?: CommissionRow[];
  affiliates?: Record<string, { name: string; pix_key: string | null }>;
}) {
  const commissions: CommissionRow[] = (seed?.commissions ?? []).map((c) => ({ ...c }));
  const affiliates = seed?.affiliates ?? {};
  const batches: PayoutBatchRow[] = [];
  const items: PayoutItemRow[] = [];
  let seq = 0;
  const nid = (p: string) => `${p}-${++seq}`;

  const db: PayoutDb = {
    listApprovedCommissions() {
      return Promise.resolve(
        commissions.filter((c) => c.status === 'approved' && c.payout_item_id == null),
      );
    },
    getAffiliates(ids) {
      const out: Record<string, { name: string; pix_key: string | null }> = {};
      for (const id of ids) if (affiliates[id]) out[id] = affiliates[id];
      return Promise.resolve(out);
    },
    insertBatch(row) {
      const b: PayoutBatchRow = { id: nid('batch'), ...row };
      batches.push(b);
      return Promise.resolve(b);
    },
    insertItems(rows) {
      const created = rows.map((r) => {
        const it: PayoutItemRow = {
          id: nid('item'),
          batch_id: r.batch_id,
          affiliate_id: r.affiliate_id,
          amount_cents: r.amount_cents,
          pix_key: r.pix_key,
          commission_ids: r.commission_ids,
          status: r.status,
          provider_ref: null,
          paid_at: null,
          error: null,
        };
        items.push(it);
        return it;
      });
      return Promise.resolve(created);
    },
    getBatch(id) {
      return Promise.resolve(batches.find((b) => b.id === id) ?? null);
    },
    getItem(id) {
      return Promise.resolve(items.find((i) => i.id === id) ?? null);
    },
    listItemsByBatch(batchId) {
      return Promise.resolve(items.filter((i) => i.batch_id === batchId));
    },
    listBatches(limit, offset) {
      return Promise.resolve({ batches: batches.slice(offset, offset + limit), total: batches.length });
    },
    updateItem(id, patch) {
      const it = items.find((i) => i.id === id);
      if (!it) return Promise.resolve(null);
      Object.assign(it, patch);
      return Promise.resolve({ ...it });
    },
    updateBatch(id, patch) {
      const b = batches.find((x) => x.id === id);
      if (!b) return Promise.resolve(null);
      Object.assign(b, patch);
      return Promise.resolve({ ...b });
    },
    markCommissionsPaid(ids, payoutItemId) {
      let n = 0;
      for (const c of commissions) {
        if (ids.includes(c.id) && c.status === 'approved') {
          c.status = 'paid';
          c.payout_item_id = payoutItemId;
          n++;
        }
      }
      return Promise.resolve(n);
    },
  };
  return { db, commissions, batches, items };
}

const AFFS = {
  'aff-1': { name: 'Maria', pix_key: 'maria@pix' },
  'aff-2': { name: 'João', pix_key: null },
};

function approved(id: string, aff: string, cents: number): CommissionRow {
  return { id, affiliate_id: aff, amount_cents: cents, status: 'approved', payout_item_id: null };
}

Deno.test('groupApproved soma por afiliado e coleta commission_ids', () => {
  const groups = groupApproved(
    [approved('c1', 'aff-1', 3000), approved('c2', 'aff-1', 2000), approved('c3', 'aff-2', 1500)],
    AFFS,
  );
  const g1 = groups.find((g) => g.affiliate_id === 'aff-1')!;
  assertEquals(g1.amount_cents, 5000);
  assertEquals(g1.commissions_count, 2);
  assertEquals(g1.commission_ids.sort(), ['c1', 'c2']);
  assertEquals(g1.affiliate_name, 'Maria');
  assertEquals(g1.pix_key, 'maria@pix');
});

Deno.test('list_approved agrupa, soma total e conta afiliados', async () => {
  const { db } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000), approved('c2', 'aff-2', 1500)],
    affiliates: AFFS,
  });
  const res = await listApproved(db);
  assertEquals(res.affiliates_count, 2);
  assertEquals(res.total_cents, 4500);
});

Deno.test('create_batch cria draft + itens pending, sem marcar comissões', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000), approved('c2', 'aff-1', 2000)],
    affiliates: AFFS,
  });
  const res = await createBatch(db, { provider: 'manual', createdBy: 'super-1' });
  if (!res.ok) throw new Error('esperava ok');
  assertEquals(res.batch.status, 'draft');
  assertEquals(res.batch.total_cents, 5000);
  assertEquals(res.batch.items_count, 1);
  assertEquals(res.items[0].status, 'pending');
  assertEquals(res.items[0].pix_key, 'maria@pix');
  // comissões continuam approved até o processamento
  assertEquals(commissions.every((c) => c.status === 'approved'), true);
});

Deno.test('create_batch sem aprovadas → erro 400', async () => {
  const { db } = makeFakeDb({ commissions: [], affiliates: AFFS });
  const res = await createBatch(db, { provider: 'manual' });
  assertEquals(res.ok, false);
  if (res.ok) throw new Error('esperava falha');
  assertEquals(res.status, 400);
});

Deno.test('process_batch (manual) marca item paid + comissões approved→paid', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000)],
    affiliates: AFFS,
  });
  const created = await createBatch(db, { provider: 'manual' });
  if (!created.ok) throw new Error('setup');
  const res = await processBatch(db, created.batch.id);
  if (!res.ok) throw new Error('esperava ok');
  assertEquals(res.paid_count, 1);
  assertEquals(res.failed_count, 0);
  assertEquals(res.items[0].status, 'paid');
  assertEquals(res.batch?.status, 'completed');
  assertEquals(commissions[0].status, 'paid');
  assertEquals(commissions[0].payout_item_id, res.items[0].id);
});

Deno.test('process_batch idempotente: reprocessar não re-paga (paid_count estável)', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000)],
    affiliates: AFFS,
  });
  const created = await createBatch(db, { provider: 'manual' });
  if (!created.ok) throw new Error('setup');
  await processBatch(db, created.batch.id);
  // segunda passada: item já paid → pulado, comissão continua paid (não duplica)
  const second = await processBatch(db, created.batch.id);
  if (!second.ok) throw new Error('esperava ok');
  assertEquals(second.items[0].status, 'paid');
  assertEquals(second.batch?.status, 'completed');
  assertEquals(commissions[0].status, 'paid');
});

Deno.test('process_batch (manual) sem pix_key → item failed, comissão fica approved', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-2', 1500)], // aff-2 sem pix_key
    affiliates: AFFS,
  });
  const created = await createBatch(db, { provider: 'manual' });
  if (!created.ok) throw new Error('setup');
  const res = await processBatch(db, created.batch.id);
  if (!res.ok) throw new Error('esperava ok');
  assertEquals(res.failed_count, 1);
  assertEquals(res.items[0].status, 'failed');
  assertEquals(res.batch?.status, 'failed');
  assertEquals(commissions[0].status, 'approved'); // não pagou
});

Deno.test('process_batch com provider=asaas (STUB) → falha sem mover dinheiro', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000)],
    affiliates: AFFS,
  });
  const created = await createBatch(db, { provider: 'asaas' });
  if (!created.ok) throw new Error('setup');
  const res = await processBatch(db, created.batch.id);
  if (!res.ok) throw new Error('esperava ok (erro capturado por item)');
  assertEquals(res.failed_count, 1);
  assertEquals(res.items[0].status, 'failed');
  assertEquals(commissions[0].status, 'approved'); // STUB não pagou
});

Deno.test('confirm_item marca paid + comissões paid; reconfirmar → 409', async () => {
  const { db, commissions } = makeFakeDb({
    commissions: [approved('c1', 'aff-1', 3000)],
    affiliates: AFFS,
  });
  const created = await createBatch(db, { provider: 'manual' });
  if (!created.ok) throw new Error('setup');
  const itemId = created.items[0].id;

  const ok = await confirmItem(db, { itemId, providerRef: 'comprovante-123' });
  if (!ok.ok) throw new Error('esperava ok');
  assertEquals(ok.item?.status, 'paid');
  assertEquals(ok.item?.provider_ref, 'comprovante-123');
  assertEquals(commissions[0].status, 'paid');

  const again = await confirmItem(db, { itemId });
  assertEquals(again.ok, false);
  if (again.ok) throw new Error('esperava 409');
  assertEquals(again.status, 409);
});
