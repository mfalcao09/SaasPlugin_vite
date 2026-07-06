// _shared/__tests__/notaas-emit-core.test.ts
//
// Suíte `deno test` PURA (mock de deps in-memory, ZERO rede/banco/env) para o
// núcleo de emissão NFS-e `_shared/notaas-emit-core.ts` — C1. Todo efeito externo
// (status/POST/outbox/updates) é injetado, então o teste roda 100% offline.
//
// Contrato exercitado (critério binário §3.2 C1):
//   - "NÃO reenvia sem consultar status por referencia primeiro": faturas cuja
//     nota JÁ existe no NotaAS (getStatusByReferencia -> found) NÃO entram em
//     nenhum POST (skipped_already) e são reconciliadas.
//   - ENQUEUE no outbox ANTES do POST: a ordem de eventos registra enqueue<POST.
//   - split de 101 faturas -> 2 lotes de POST ([100, 1]).
//   - sucesso do lote grava notaas_batch_id por fatura + marca 'emitindo'.
//   - POST falho isola o lote (não derruba os demais); intenção fica no outbox.
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import {
  type BatchPostResult,
  type EmitDeps,
  emitInvoices,
  type EmitTriple,
  type NotaasStatus,
} from '../notaas-emit-core.ts';
import type { ContractRow, InvoiceRow, NotaasEmitItem, PayerRow } from '../notaas-emit-payload.ts';

// ── Fábricas de triplas sintéticas ───────────────────────────────────────────
function triple(n: number, overrides: Partial<InvoiceRow> = {}): EmitTriple {
  const id = `inv-${String(n).padStart(4, '0')}`;
  const invoice: InvoiceRow = {
    id,
    organization_id: 'org-aaaa-1111',
    competencia: '2026-06',
    referencia: `NFSE-2026-06-${String(n).padStart(4, '0')}`,
    valor_total: 100 + n,
    iss_retido: false,
    retencoes: {},
    ...overrides,
  };
  const payer: PayerRow = { nome: `Pagador ${n}`, tipo_documento: 'cpf', documento: '11122233344' };
  const contract: ContractRow = { descricao: 'Mensalidade', codigo_servico_nfse: '010700', aliquota_iss: 2 };
  return { invoice, payer, contract };
}

// ── Rastreador de deps: registra a sequência de chamadas p/ asserção de ordem ─
interface Recorder {
  events: string[];
  posts: NotaasEmitItem[][]; // um array de itens por POST
  enqueued: string[]; // referencias enfileiradas
  batchIdRecorded: Record<string, string>; // invoiceId -> batchId
  emitting: string[]; // invoiceIds marcados 'emitindo'
  reconciled: string[]; // invoiceIds reconciliados
}

function makeDeps(opts: {
  existing?: Set<string>; // referencias que JÁ têm nota no NotaAS
  postResult?: (items: NotaasEmitItem[], batchIdx: number) => BatchPostResult;
  enqueueThrowsFor?: Set<string>; // referencias cujo enqueue falha
}): { deps: EmitDeps; rec: Recorder } {
  const rec: Recorder = {
    events: [],
    posts: [],
    enqueued: [],
    batchIdRecorded: {},
    emitting: [],
    reconciled: [],
  };
  let batchIdx = 0;

  const deps: EmitDeps = {
    async getStatusByReferencia(referencia: string): Promise<NotaasStatus> {
      rec.events.push(`status:${referencia}`);
      if (opts.existing?.has(referencia)) {
        return { found: true, invoiceId: `ntaas-${referencia}`, batchId: 'bat_existing', status: 'issued' };
      }
      return { found: false };
    },
    async postBatch(items: NotaasEmitItem[]): Promise<BatchPostResult> {
      rec.events.push(`POST:${items.length}`);
      rec.posts.push(items);
      const res = opts.postResult
        ? opts.postResult(items, batchIdx)
        : { ok: true, status: 202, batchId: `bat_${batchIdx}` };
      batchIdx++;
      return res;
    },
    async enqueueOutbox(referencia: string, invoiceId: string) {
      if (opts.enqueueThrowsFor?.has(referencia)) {
        throw new Error(`enqueue forçado a falhar p/ ${referencia}`);
      }
      rec.events.push(`enqueue:${referencia}`);
      rec.enqueued.push(referencia);
      void invoiceId;
    },
    async markEmitting(invoiceId: string) {
      rec.events.push(`emitting:${invoiceId}`);
      rec.emitting.push(invoiceId);
    },
    async recordBatchId(invoiceId: string, batchId: string) {
      rec.events.push(`batchId:${invoiceId}=${batchId}`);
      rec.batchIdRecorded[invoiceId] = batchId;
    },
    async reconcileExisting(invoiceId: string, _st: NotaasStatus) {
      rec.reconciled.push(invoiceId);
    },
    logError() {/* silêncio nos testes */},
  };
  return { deps, rec };
}

// ── "NÃO reenvia sem consultar status por referencia primeiro" ───────────────
Deno.test('nota já existente no NotaAS => NÃO entra em POST (skipped_already) e reconcilia', async () => {
  const triples = [triple(1), triple(2), triple(3)];
  // A fatura 2 já tem nota do lado NotaAS.
  const { deps, rec } = makeDeps({ existing: new Set(['NFSE-2026-06-0002']) });

  const res = await emitInvoices(deps, triples);

  // O status de TODAS foi consultado ANTES de qualquer decisão.
  assertEquals(rec.events.filter((e) => e.startsWith('status:')).length, 3);
  // A fatura 2 nunca aparece num POST.
  const postedRefs = rec.posts.flat().map((it) => it.referencia);
  assert(!postedRefs.includes('NFSE-2026-06-0002'), 'fatura já emitida NÃO pode ser re-POSTada');
  // Foi contada como skipped_already e reconciliada.
  assertEquals(res.skippedAlready, 1);
  assert(rec.reconciled.includes('inv-0002'));
  // As outras 2 foram emitidas normalmente.
  assertEquals(res.emitted, 2);
  assertEquals(postedRefs.sort(), ['NFSE-2026-06-0001', 'NFSE-2026-06-0003']);
});

Deno.test('TODAS já existentes => ZERO POST (nunca reenvia às cegas)', async () => {
  const triples = [triple(1), triple(2)];
  const { deps, rec } = makeDeps({
    existing: new Set(['NFSE-2026-06-0001', 'NFSE-2026-06-0002']),
  });
  const res = await emitInvoices(deps, triples);
  assertEquals(rec.posts.length, 0, 'nenhum POST deve ocorrer');
  assertEquals(res.skippedAlready, 2);
  assertEquals(res.emitted, 0);
});

Deno.test('falha ao CONSULTAR status => pula a fatura (não posta às cegas)', async () => {
  const triples = [triple(1)];
  const deps: EmitDeps = {
    async getStatusByReferencia() {
      throw new Error('rede caiu no GET status');
    },
    async postBatch() {
      throw new Error('POST NÃO deveria ser chamado');
    },
    async enqueueOutbox() {},
    async markEmitting() {},
    async recordBatchId() {},
    logError() {},
  };
  const res = await emitInvoices(deps, triples);
  assertEquals(res.emitted, 0);
  assertEquals(res.skippedError, 1);
});

// ── ENQUEUE no outbox ANTES do POST ──────────────────────────────────────────
Deno.test('enqueue no outbox acontece ANTES do POST (ordem de eventos)', async () => {
  const triples = [triple(1)];
  const { deps, rec } = makeDeps({});
  await emitInvoices(deps, triples);

  const idxEnqueue = rec.events.findIndex((e) => e.startsWith('enqueue:'));
  const idxPost = rec.events.findIndex((e) => e.startsWith('POST:'));
  assert(idxEnqueue >= 0 && idxPost >= 0, 'ambos devem ocorrer');
  assert(idxEnqueue < idxPost, 'a intenção no outbox deve preceder o POST (idempotência B2)');
  assertEquals(rec.enqueued, ['NFSE-2026-06-0001']);
});

Deno.test('enqueue que falha => fatura sai do lote (não é postada)', async () => {
  const triples = [triple(1), triple(2)];
  const { deps, rec } = makeDeps({ enqueueThrowsFor: new Set(['NFSE-2026-06-0001']) });
  const res = await emitInvoices(deps, triples);
  // Só a fatura 2 (enqueue ok) foi postada.
  const postedRefs = rec.posts.flat().map((it) => it.referencia);
  assertEquals(postedRefs, ['NFSE-2026-06-0002']);
  assertEquals(res.emitted, 1);
  assertEquals(res.skippedError, 1);
});

// ── split de 101 faturas -> 2 lotes de POST [100, 1] ─────────────────────────
Deno.test('101 faturas => 2 POST /emitir/batch de tamanhos [100, 1]', async () => {
  const triples = Array.from({ length: 101 }, (_, i) => triple(i + 1));
  const { deps, rec } = makeDeps({});

  const res = await emitInvoices(deps, triples);

  assertEquals(rec.posts.length, 2, 'exatamente 2 chamadas de batch');
  assertEquals(rec.posts[0].length, 100);
  assertEquals(rec.posts[1].length, 1);
  assertEquals(res.batches, 2);
  assertEquals(res.emitted, 101);
  // Nenhuma referência duplicada nos POSTs (101 únicas).
  const refs = rec.posts.flat().map((it) => it.referencia);
  assertEquals(new Set(refs).size, 101);
});

Deno.test('250 faturas => 3 lotes [100,100,50]', async () => {
  const triples = Array.from({ length: 250 }, (_, i) => triple(i + 1));
  const { deps, rec } = makeDeps({});
  const res = await emitInvoices(deps, triples);
  assertEquals(rec.posts.map((p) => p.length), [100, 100, 50]);
  assertEquals(res.emitted, 250);
});

// ── sucesso do lote grava batchId por fatura + marca 'emitindo' ──────────────
Deno.test('sucesso: grava notaas_batch_id por fatura e marca status emitindo', async () => {
  const triples = [triple(1), triple(2)];
  const { deps, rec } = makeDeps({
    postResult: () => ({ ok: true, status: 202, batchId: 'bat_abc123' }),
  });
  const res = await emitInvoices(deps, triples);

  assertEquals(rec.batchIdRecorded['inv-0001'], 'bat_abc123');
  assertEquals(rec.batchIdRecorded['inv-0002'], 'bat_abc123');
  assert(rec.emitting.includes('inv-0001'));
  assert(rec.emitting.includes('inv-0002'));
  // batchId propagado no resultado por fatura.
  assert(res.results.every((r) => r.outcome !== 'emitted' || r.batchId === 'bat_abc123'));
});

// ── POST falho isola o lote ──────────────────────────────────────────────────
Deno.test('1º lote falha, 2º sucede => falha isolada (o 2º lote emite normalmente)', async () => {
  const triples = Array.from({ length: 150 }, (_, i) => triple(i + 1)); // 2 lotes: 100 + 50
  const { deps, rec } = makeDeps({
    // Só o 1º lote (batchIdx 0) falha.
    postResult: (_items, batchIdx) =>
      batchIdx === 0
        ? { ok: false, status: 500, error: 'erro NotaAS no 1º lote' }
        : { ok: true, status: 202, batchId: 'bat_ok_2' },
  });

  const res = await emitInvoices(deps, triples);

  // Ambos os lotes foram tentados.
  assertEquals(rec.posts.length, 2);
  // 100 do 1º lote falharam; 50 do 2º emitiram.
  assertEquals(res.emitted, 50);
  assertEquals(res.skippedError, 100);
  // Nenhuma fatura do 1º lote recebeu batchId nem 'emitindo'.
  assertEquals(Object.keys(rec.batchIdRecorded).length, 50);
});

Deno.test('sumário coerente: total = emitted + skippedAlready + skippedError', async () => {
  const triples = [triple(1), triple(2), triple(3)];
  const { deps } = makeDeps({ existing: new Set(['NFSE-2026-06-0003']) });
  const res = await emitInvoices(deps, triples);
  assertEquals(res.total, 3);
  assertEquals(res.emitted + res.skippedAlready + res.skippedError, res.total);
});
