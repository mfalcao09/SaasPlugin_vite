// Núcleo puro do motor de payout de comissões de afiliado (Fase 5).
// Testável sem rede/Deno.serve: toda a I/O passa por uma porta PayoutDb injetada.
// Consumido por: ./index.ts (com client Supabase real) e ./payout-core.test.ts (mock).
//
// Garantias travadas:
//  - approved → paid SEMPRE com guard .eq('status','approved') (idempotente; pago nunca é re-tocado).
//  - item já 'paid' é pulado em process/confirm (reprocessar não duplica pagamento).

import {
  getPixAdapter,
  type PayoutResult,
} from '../_shared/payout-adapter.ts';

// ---------------------------------------------------------------------------
// Tipos de linha (subconjunto das colunas usadas; espelham a migration 20260620).
// ---------------------------------------------------------------------------
export interface CommissionRow {
  id: string;
  affiliate_id: string;
  amount_cents: number;
  status: string;
  payout_item_id: string | null;
}
export interface PayoutBatchRow {
  id: string;
  status: string;
  provider: string;
  total_cents: number;
  items_count: number;
  created_by: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}
export interface PayoutItemRow {
  id: string;
  batch_id: string;
  affiliate_id: string;
  amount_cents: number;
  pix_key: string | null;
  commission_ids: string[];
  status: string;
  provider_ref: string | null;
  paid_at: string | null;
  error: string | null;
}

export interface ApprovedGroup {
  affiliate_id: string;
  affiliate_name: string;
  pix_key: string | null;
  amount_cents: number;
  commissions_count: number;
  commission_ids: string[];
}

// ---------------------------------------------------------------------------
// Porta de dados (injetada). O index.ts implementa com Supabase; testes mockam.
// ---------------------------------------------------------------------------
export interface PayoutDb {
  // Comissões 'approved' sem item de payout ainda (payout_item_id IS NULL).
  listApprovedCommissions(): Promise<CommissionRow[]>;
  // Mapa affiliate_id -> {name, pix_key} para os ids dados.
  getAffiliates(ids: string[]): Promise<Record<string, { name: string; pix_key: string | null }>>;

  insertBatch(row: {
    status: string;
    provider: string;
    total_cents: number;
    items_count: number;
    created_by: string | null;
    notes: string | null;
  }): Promise<PayoutBatchRow>;
  insertItems(rows: Array<{
    batch_id: string;
    affiliate_id: string;
    amount_cents: number;
    pix_key: string | null;
    commission_ids: string[];
    status: string;
  }>): Promise<PayoutItemRow[]>;

  getBatch(batchId: string): Promise<PayoutBatchRow | null>;
  getItem(itemId: string): Promise<PayoutItemRow | null>;
  listItemsByBatch(batchId: string): Promise<PayoutItemRow[]>;
  listBatches(limit: number, offset: number): Promise<{ batches: PayoutBatchRow[]; total: number }>;

  updateItem(itemId: string, patch: Partial<PayoutItemRow>): Promise<PayoutItemRow | null>;
  updateBatch(batchId: string, patch: Partial<PayoutBatchRow>): Promise<PayoutBatchRow | null>;

  // Marca approved → paid (guard .eq('status','approved')). Devolve quantas linhas mudaram.
  markCommissionsPaid(commissionIds: string[], payoutItemId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Agregação (pura): comissões approved → grupos por afiliado.
// ---------------------------------------------------------------------------
export function groupApproved(
  commissions: CommissionRow[],
  affiliates: Record<string, { name: string; pix_key: string | null }>,
): ApprovedGroup[] {
  const byAff = new Map<string, ApprovedGroup>();
  for (const c of commissions) {
    let g = byAff.get(c.affiliate_id);
    if (!g) {
      const a = affiliates[c.affiliate_id];
      g = {
        affiliate_id: c.affiliate_id,
        affiliate_name: a?.name ?? '—',
        pix_key: a?.pix_key ?? null,
        amount_cents: 0,
        commissions_count: 0,
        commission_ids: [],
      };
      byAff.set(c.affiliate_id, g);
    }
    g.amount_cents += Number(c.amount_cents ?? 0);
    g.commissions_count += 1;
    g.commission_ids.push(c.id);
  }
  return [...byAff.values()];
}

// ---------------------------------------------------------------------------
// Ações de orquestração (impuras só pela porta injetada — fáceis de testar).
// ---------------------------------------------------------------------------

export async function listApproved(db: PayoutDb): Promise<{
  ok: true;
  groups: ApprovedGroup[];
  total_cents: number;
  affiliates_count: number;
}> {
  const commissions = await db.listApprovedCommissions();
  const ids = [...new Set(commissions.map((c) => c.affiliate_id))];
  const affiliates = ids.length ? await db.getAffiliates(ids) : {};
  const groups = groupApproved(commissions, affiliates);
  const total_cents = groups.reduce((s, g) => s + g.amount_cents, 0);
  return { ok: true, groups, total_cents, affiliates_count: groups.length };
}

export async function createBatch(db: PayoutDb, args: {
  provider?: string;
  affiliateIds?: string[];
  notes?: string | null;
  createdBy?: string | null;
}): Promise<
  | { ok: true; batch: PayoutBatchRow; items: PayoutItemRow[] }
  | { ok: false; error: string; status: number }
> {
  const provider = args.provider || 'manual';
  const commissions = await db.listApprovedCommissions();
  const ids = [...new Set(commissions.map((c) => c.affiliate_id))];
  const affiliates = ids.length ? await db.getAffiliates(ids) : {};
  let groups = groupApproved(commissions, affiliates);

  if (args.affiliateIds && args.affiliateIds.length > 0) {
    const want = new Set(args.affiliateIds);
    groups = groups.filter((g) => want.has(g.affiliate_id));
  }
  if (groups.length === 0) {
    return { ok: false, error: 'nenhuma comissão aprovada para pagar', status: 400 };
  }

  const total_cents = groups.reduce((s, g) => s + g.amount_cents, 0);
  const batch = await db.insertBatch({
    status: 'draft',
    provider,
    total_cents,
    items_count: groups.length,
    created_by: args.createdBy ?? null,
    notes: args.notes ?? null,
  });

  const items = await db.insertItems(
    groups.map((g) => ({
      batch_id: batch.id,
      affiliate_id: g.affiliate_id,
      amount_cents: g.amount_cents,
      pix_key: g.pix_key,
      commission_ids: g.commission_ids,
      status: 'pending',
    })),
  );

  return { ok: true, batch, items };
}

/** Paga (ou confirma) UM item via adapter, marcando comissões approved → paid (idempotente). */
async function payItem(
  db: PayoutDb,
  batchProvider: string,
  item: PayoutItemRow,
): Promise<PayoutItemRow> {
  if (item.status === 'paid') return item; // idempotente: não re-paga

  const adapter = getPixAdapter(batchProvider);
  let result: PayoutResult;
  try {
    result = await adapter.pay({
      affiliateId: item.affiliate_id,
      amountCents: item.amount_cents,
      pixKey: item.pix_key,
      reference: `${item.batch_id}:${item.id}`,
    });
  } catch (e) {
    result = { ok: false, error: String((e as Error)?.message ?? e) };
  }

  if (result.ok) {
    // Marca comissões approved → paid ANTES de fechar o item (guard idempotente).
    if (item.commission_ids.length > 0) {
      await db.markCommissionsPaid(item.commission_ids, item.id);
    }
    const updated = await db.updateItem(item.id, {
      status: 'paid',
      provider_ref: result.providerRef ?? null,
      paid_at: new Date().toISOString(),
      error: null,
    });
    return updated ?? { ...item, status: 'paid', provider_ref: result.providerRef ?? null };
  }

  const updated = await db.updateItem(item.id, {
    status: 'failed',
    error: result.error ?? 'falha desconhecida',
  });
  return updated ?? { ...item, status: 'failed', error: result.error ?? 'falha desconhecida' };
}

/** Recalcula status do batch a partir dos itens (completed só se todos paid). */
async function recomputeBatchStatus(db: PayoutDb, batchId: string): Promise<PayoutBatchRow | null> {
  const items = await db.listItemsByBatch(batchId);
  const allPaid = items.length > 0 && items.every((i) => i.status === 'paid');
  const anyFailed = items.some((i) => i.status === 'failed');
  const status = allPaid ? 'completed' : anyFailed ? 'failed' : 'processing';
  return await db.updateBatch(batchId, { status, updated_at: new Date().toISOString() });
}

export async function processBatch(db: PayoutDb, batchId: string): Promise<
  | { ok: true; batch: PayoutBatchRow | null; items: PayoutItemRow[]; paid_count: number; failed_count: number }
  | { ok: false; error: string; status: number }
> {
  const batch = await db.getBatch(batchId);
  if (!batch) return { ok: false, error: 'lote não encontrado', status: 404 };

  const items = await db.listItemsByBatch(batchId);
  const processed: PayoutItemRow[] = [];
  for (const item of items) {
    processed.push(await payItem(db, batch.provider, item));
  }
  const updatedBatch = await recomputeBatchStatus(db, batchId);
  const paid_count = processed.filter((i) => i.status === 'paid').length;
  const failed_count = processed.filter((i) => i.status === 'failed').length;
  return { ok: true, batch: updatedBatch, items: processed, paid_count, failed_count };
}

export async function confirmItem(db: PayoutDb, args: {
  itemId: string;
  providerRef?: string | null;
}): Promise<
  | { ok: true; item: PayoutItemRow | null }
  | { ok: false; error: string; status: number }
> {
  const item = await db.getItem(args.itemId);
  if (!item) return { ok: false, error: 'item não encontrado', status: 404 };
  if (item.status === 'paid') return { ok: false, error: 'item já pago', status: 409 };

  if (item.commission_ids.length > 0) {
    await db.markCommissionsPaid(item.commission_ids, item.id);
  }
  const updated = await db.updateItem(item.id, {
    status: 'paid',
    provider_ref: args.providerRef ?? `manual:${item.batch_id}:${item.id}`,
    paid_at: new Date().toISOString(),
    error: null,
  });
  await recomputeBatchStatus(db, item.batch_id);
  return { ok: true, item: updated };
}

export async function listBatches(db: PayoutDb, args: { limit?: number; offset?: number }): Promise<{
  ok: true;
  batches: Array<PayoutBatchRow & { items: PayoutItemRow[] }>;
  total: number;
}> {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const { batches, total } = await db.listBatches(limit, offset);
  const withItems = [];
  for (const b of batches) {
    const items = await db.listItemsByBatch(b.id);
    withItems.push({ ...b, items });
  }
  return { ok: true, batches: withItems, total };
}
