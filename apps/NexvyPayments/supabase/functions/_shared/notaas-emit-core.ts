// _shared/notaas-emit-core.ts
//
// Núcleo PURO de orquestração da emissão NFS-e via NotaAS (Entregável C1). Contém
// TODA a lógica de idempotência e de lote, com TODO efeito externo injetado por
// dependência (`EmitDeps`) — por isso roda 100% offline nos testes (mock in-memory,
// zero rede, zero banco, zero Deno.env). A edge `notaas-emit/index.ts` provê a
// implementação real das deps (fetch NotaAS + service client + cofre).
//
// CHAMADORES:
//   - notaas-emit/index.ts: monta as EmitDeps reais e chama `emitInvoices`.
//   - _shared/__tests__/notaas-emit-core.test.ts: injeta deps mockadas.
//
// CONTRATO DE IDEMPOTÊNCIA (critério binário C1 + report §D/§97-98 — NotaAS NÃO
// deduplica por conta própria):
//   Para CADA fatura, em ordem:
//     1) CONSULTA STATUS por `referencia` (getStatusByReferencia). Se a nota já
//        existe do lado NotaAS (issued/processing/queued) => NÃO reenvia; apenas
//        reconcilia (grava notaas_invoice_id/batchId se ainda faltarem) e conta
//        como 'skipped_already'. Isto é o "NUNCA reenvia sem consultar status".
//     2) Só as faturas SEM nota do lado NotaAS entram no lote a emitir.
//   Antes de CADA POST:
//     3) ENQUEUE no outbox (enqueueOutbox) com a `referencia` — a intenção é
//        gravada ANTES do efeito externo (B2). Se o worker crashar após o POST, o
//        próximo run relê o status por `referencia` (passo 1) e NÃO duplica.
//   Após o POST:
//     4) grava `notaas_batch_id` por fatura do lote (recordBatchId) e marca
//        status principal -> 'emitindo' (markEmitting; pré-fiscal, editável, o
//        webhook C2 leva a 'emitida'). notaas_invoice_id vem depois pelo webhook
//        (a emissão é assíncrona: 202 batchId, sem invoiceId por item).
//
// LOTE: itens a emitir são partidos em lotes ≤100 (chunkItems). >100 => múltiplos
// POST /emitir/batch. Um POST falho de um lote NÃO impede os demais (isola falha).

import {
  buildEmitItem,
  chunkItems,
  type ContractRow,
  type InvoiceRow,
  type NotaasEmitItem,
  type PayerRow,
} from './notaas-emit-payload.ts';

/** Linha completa que a emissão consome: fatura + tomador + contrato já juntados. */
export interface EmitTriple {
  invoice: InvoiceRow;
  payer: PayerRow;
  contract: ContractRow;
}

/** Status de uma nota do lado NotaAS, consultado por `referencia` (report §H.2). */
export interface NotaasStatus {
  found: boolean; // existe nota para essa referencia?
  status?: string; // queued|processing|issued|error|cancelled
  invoiceId?: string; // id da nota do lado NotaAS (notaas_invoice_id)
  batchId?: string; // batchId, quando aplicável
}

/** Resposta de um POST /emitir/batch (report §18/§95: 202 {batchId, ...}). */
export interface BatchPostResult {
  ok: boolean;
  batchId?: string;
  status?: number; // HTTP status (p/ diagnóstico)
  error?: string;
}

/**
 * Dependências de efeito externo. TODAS injetadas — o núcleo não conhece fetch,
 * Supabase nem env. Os testes passam mocks; a edge passa as reais.
 */
export interface EmitDeps {
  /** Consulta a nota por `referencia` (GET status). É o gate anti-reenvio. */
  getStatusByReferencia(referencia: string): Promise<NotaasStatus>;
  /** POST /api/v1/emitir/batch de um lote (≤100 itens). Retorna batchId. */
  postBatch(items: NotaasEmitItem[]): Promise<BatchPostResult>;
  /** Grava a intenção de emissão no outbox ANTES do POST (idempotência B2). */
  enqueueOutbox(referencia: string, invoiceId: string, extra?: Record<string, unknown>): Promise<void>;
  /** Marca a fatura interna -> status 'emitindo' (pré-fiscal). */
  markEmitting(invoiceId: string): Promise<void>;
  /** Persiste notaas_batch_id (e opcionalmente notaas_invoice_id) na fatura. */
  recordBatchId(invoiceId: string, batchId: string, notaasInvoiceId?: string): Promise<void>;
  /** Reconcilia uma fatura cuja nota JÁ existe no NotaAS (grava ids faltantes). */
  reconcileExisting?(invoiceId: string, st: NotaasStatus): Promise<void>;
  /** Log estruturado (nunca lança). Default: console. */
  logError?(msg: string, err: unknown): void;
}

/** Destino de uma fatura no resultado da emissão. */
export type EmitOutcome =
  | 'emitted' // entrou num lote e foi POSTada com sucesso
  | 'skipped_already' // já tinha nota no NotaAS (consultado por referencia) — NÃO reenviou
  | 'skipped_error'; // erro ao montar payload / consultar status / POST — não emitiu

export interface EmitInvoiceResult {
  invoiceId: string;
  referencia: string;
  outcome: EmitOutcome;
  batchId?: string;
  reason?: string;
}

export interface EmitInvoicesResult {
  total: number;
  emitted: number;
  skippedAlready: number;
  skippedError: number;
  batches: number;
  results: EmitInvoiceResult[];
}

function referenciaOf(t: EmitTriple): string {
  return t.invoice.referencia ? String(t.invoice.referencia) : t.invoice.id;
}

/**
 * Emite (ou reconcilia) uma lista de faturas via NotaAS, respeitando idempotência
 * e o limite de 100 itens por lote. Ver o cabeçalho para o contrato completo.
 *
 * NÃO lança: acumula erros por-fatura em `results` (uma fatura ruim não derruba o
 * lote inteiro). Retorna o sumário para a edge devolver ao caller/cron.
 */
export async function emitInvoices(
  deps: EmitDeps,
  triples: readonly EmitTriple[],
): Promise<EmitInvoicesResult> {
  const log = deps.logError ?? ((m: string, e: unknown) => console.error(m, e));
  const results: EmitInvoiceResult[] = [];

  // ── Fase 1: consulta status por referencia; separa "já existe" de "a emitir" ──
  // Este é o gate "NUNCA reenvia sem consultar status por referencia primeiro".
  const toEmit: Array<{ triple: EmitTriple; item: NotaasEmitItem; referencia: string }> = [];

  for (const triple of triples) {
    const referencia = referenciaOf(triple);
    const invoiceId = triple.invoice.id;
    try {
      const st = await deps.getStatusByReferencia(referencia);
      if (st.found) {
        // Nota já existe no NotaAS: NÃO reenviar (evita nota duplicada — report §98).
        // Reconciliar ids que ainda faltem no nosso lado (best-effort).
        if (deps.reconcileExisting) {
          try {
            await deps.reconcileExisting(invoiceId, st);
          } catch (e) {
            log(`[notaas-emit] reconcile falhou p/ ${invoiceId} (non-fatal)`, e);
          }
        }
        results.push({
          invoiceId,
          referencia,
          outcome: 'skipped_already',
          batchId: st.batchId,
          reason: `nota já existe no NotaAS (status=${st.status ?? 'desconhecido'})`,
        });
        continue;
      }

      // Sem nota do lado NotaAS: monta o item e entra na fila do lote.
      const item = buildEmitItem(triple.invoice, triple.payer, triple.contract);
      toEmit.push({ triple, item, referencia });
    } catch (e) {
      // Erro ao consultar status OU ao montar payload: não emite esta fatura.
      // (Consulta falha => NÃO assumimos "não existe" e postamos às cegas — isso
      // arriscaria duplicar. Preferimos pular e deixar o próximo run reconsultar.)
      log(`[notaas-emit] preparação falhou p/ ${invoiceId}`, e);
      results.push({
        invoiceId,
        referencia,
        outcome: 'skipped_error',
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Fase 2: split em lotes ≤100 e POST /emitir/batch por lote ──────────────
  const batches = chunkItems(toEmit, 100);
  let emitted = 0;
  let postedBatches = 0;

  for (const batch of batches) {
    // 2a) ENQUEUE no outbox ANTES do POST — para CADA fatura do lote (B2). Se um
    // enqueue falhar, essa fatura sai do lote (não postamos sem intenção gravada).
    const enqueued: typeof batch = [];
    for (const entry of batch) {
      try {
        await deps.enqueueOutbox(entry.referencia, entry.triple.invoice.id, {
          competencia: entry.triple.invoice.competencia ?? null,
          kind: 'notaas_emit',
        });
        enqueued.push(entry);
      } catch (e) {
        log(`[notaas-emit] enqueue outbox falhou p/ ${entry.triple.invoice.id}`, e);
        results.push({
          invoiceId: entry.triple.invoice.id,
          referencia: entry.referencia,
          outcome: 'skipped_error',
          reason: 'falha ao gravar intenção no outbox (não postado)',
        });
      }
    }
    if (enqueued.length === 0) continue;

    // 2b) POST do lote.
    let post: BatchPostResult;
    try {
      post = await deps.postBatch(enqueued.map((e) => e.item));
    } catch (e) {
      log('[notaas-emit] postBatch lançou', e);
      post = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    postedBatches++;

    if (!post.ok) {
      // Lote falhou: nenhuma fatura do lote foi emitida. O outbox já tem a intenção
      // — o próximo run reconsulta status por referencia (fase 1) e, como a nota
      // NÃO existe, tentará de novo. Sem duplicação.
      for (const entry of enqueued) {
        results.push({
          invoiceId: entry.triple.invoice.id,
          referencia: entry.referencia,
          outcome: 'skipped_error',
          reason: `POST /emitir/batch falhou: ${post.error ?? `HTTP ${post.status ?? '?'}`}`,
        });
      }
      continue;
    }

    // 2c) Sucesso do lote: grava batchId por fatura + marca 'emitindo'. O
    // notaas_invoice_id por fatura vem depois pelo webhook C2 (emissão assíncrona).
    const batchId = post.batchId ?? '';
    for (const entry of enqueued) {
      const invoiceId = entry.triple.invoice.id;
      try {
        if (batchId) await deps.recordBatchId(invoiceId, batchId);
        await deps.markEmitting(invoiceId);
      } catch (e) {
        // O POST já foi feito (nota vai nascer); falha ao gravar nosso estado é
        // non-fatal p/ a emissão em si — logamos, mas contamos como emitida (o
        // webhook C2 reconcilia). Nunca re-POSTamos por causa disso.
        log(`[notaas-emit] pós-POST (recordBatchId/markEmitting) falhou p/ ${invoiceId}`, e);
      }
      emitted++;
      results.push({
        invoiceId,
        referencia: entry.referencia,
        outcome: 'emitted',
        batchId: batchId || undefined,
      });
    }
  }

  return {
    total: triples.length,
    emitted,
    skippedAlready: results.filter((r) => r.outcome === 'skipped_already').length,
    skippedError: results.filter((r) => r.outcome === 'skipped_error').length,
    batches: postedBatches,
    results,
  };
}
