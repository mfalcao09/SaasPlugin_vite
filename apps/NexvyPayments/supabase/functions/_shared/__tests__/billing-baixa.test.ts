// _shared/__tests__/billing-baixa.test.ts
//
// Suíte `deno test` PURA (mock em memória, ZERO rede) para a BAIXA MANUAL do E1
// (_shared/billing-baixa.ts). Mock do client supabase com fake-DB por tabela +
// query-builder encadeável — mesma estratégia do tools-cobranca.test.ts:47-152.
//
// Cobre o critério binário §3.2 E1 (baixa manual):
//   - baixa de fatura 'vencida'/'emitida'/'enviada' -> status 'paga' E grava
//     billing_events{ tipo:'paga', origem:'manual' }.
//   - anti-IDOR: fatura de OUTRA org -> "não encontrada", nada gravado.
//   - idempotência: fatura já 'paga' -> no-op (nenhum evento novo).
//   - status não-baixável (rascunho/cancelada) -> recusa, nada gravado.
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import { darBaixaManual, BAIXAVEL_DE } from '../billing-baixa.ts';

const ORG = 'org-aaaa-1111';
const ORG_OUTRA = 'org-bbbb-9999';

// ---------------------------------------------------------------------------
// Fake-DB + client mock (portado de tools-cobranca.test.ts). Builder acumula
// filtros `eq`; `insert` empurra linha com id sintético; `update` aplica patch
// às linhas que casam os `eq`.
// ---------------------------------------------------------------------------
let _idSeq = 0;
function newId(prefix: string) {
  _idSeq++;
  return `${prefix}-${String(_idSeq).padStart(4, '0')}-abcdefaa`;
}

function makeSupabaseMock(seed: { invoices?: any[]; billing_events?: any[] }) {
  const db: Record<string, any[]> = {
    invoices: seed.invoices ? [...seed.invoices] : [],
    billing_events: seed.billing_events ? [...seed.billing_events] : [],
  };

  function makeBuilder(table: string) {
    const eqs: Array<[string, any]> = [];
    let pendingInsert: any[] | null = null;
    let pendingUpdate: any | null = null;

    function applyFilters(rows: any[]): any[] {
      return rows.filter((r) => eqs.every(([c, v]) => r[c] === v));
    }

    const builder: any = {
      select(_cols?: string) {
        return builder;
      },
      eq(col: string, val: any) {
        eqs.push([col, val]);
        return builder;
      },
      insert(rowOrRows: any) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        pendingInsert = rows.map((r) => ({ id: r.id ?? newId(table.slice(0, 3)), ...r }));
        db[table].push(...pendingInsert);
        return builder;
      },
      update(patch: any) {
        pendingUpdate = patch;
        return builder;
      },
      async maybeSingle() {
        const rows = applyFilters(db[table]);
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return { data: pendingInsert[0], error: null };
        const rows = applyFilters(db[table]);
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: any) => void) {
        if (pendingInsert) {
          resolve({ data: pendingInsert, error: null });
          return;
        }
        if (pendingUpdate) {
          const targets = db[table].filter((r) => eqs.every(([c, v]) => r[c] === v));
          for (const t of targets) Object.assign(t, pendingUpdate);
          resolve({ data: targets, error: null });
          return;
        }
        resolve({ data: applyFilters(db[table]), error: null });
      },
    };
    return builder;
  }

  return {
    _db: db,
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

function inv(overrides: any = {}) {
  return {
    id: 'inv-orig-0001',
    organization_id: ORG,
    contract_id: 'ctr-1',
    payer_id: 'pay-1',
    competencia: '2026-05',
    referencia: 'REF-2026-05-0001',
    valor_original: 217,
    valor_total: 217,
    valor_pago: null,
    pago_em: null,
    vencimento: '2026-05-10',
    status: 'vencida',
    ...overrides,
  };
}

// ===========================================================================
// CRITÉRIO E1: baixa manual -> status 'paga' + billing_events{origem:'manual'}
// ===========================================================================
Deno.test("baixa manual de fatura vencida -> status 'paga' + evento origem='manual'", async () => {
  const sb = makeSupabaseMock({ invoices: [inv()] });
  const r = await darBaixaManual(sb, ORG, {
    invoiceId: 'inv-orig-0001',
    meio: 'pix',
    observacao: 'TED recebida 12h',
  });

  assertEquals(r.success, true);
  assertEquals(r.data?.status, 'paga');

  // Fatura ficou 'paga' com valor/pago_em preenchidos.
  const row = sb._db.invoices.find((i) => i.id === 'inv-orig-0001');
  assertEquals(row.status, 'paga');
  assertEquals(Number(row.valor_pago), 217);
  assert(row.pago_em, 'pago_em deve ser preenchido');

  // CRITÉRIO BINÁRIO: exatamente 1 billing_events, tipo='paga', origem='manual'.
  assertEquals(sb._db.billing_events.length, 1);
  const ev = sb._db.billing_events[0];
  assertEquals(ev.tipo, 'paga');
  assertEquals(ev.origem, 'manual');
  assertEquals(ev.invoice_id, 'inv-orig-0001');
  assertEquals(ev.payload.meio, 'pix');
  assertEquals(ev.payload.baixa, 'manual');
});

Deno.test("baixa manual aceita 'emitida' e 'enviada' (não só vencida)", async () => {
  for (const st of ['emitida', 'enviada']) {
    const sb = makeSupabaseMock({ invoices: [inv({ status: st })] });
    const r = await darBaixaManual(sb, ORG, { invoiceId: 'inv-orig-0001' });
    assertEquals(r.success, true, `status ${st} deveria ser baixável`);
    assertEquals(sb._db.billing_events[0].origem, 'manual');
    assert(BAIXAVEL_DE.has(st));
  }
});

Deno.test('baixa manual usa valor_total quando valor_pago não é informado', async () => {
  const sb = makeSupabaseMock({ invoices: [inv({ valor_total: 387 })] });
  const r = await darBaixaManual(sb, ORG, { invoiceId: 'inv-orig-0001' });
  assertEquals(r.success, true);
  assertEquals(Number(r.data?.valor_pago), 387);
  assertEquals(Number(sb._db.billing_events[0].payload.valor_pago), 387);
});

// ===========================================================================
// Anti-IDOR
// ===========================================================================
Deno.test('baixa manual NÃO enxerga fatura de outra org (anti-IDOR)', async () => {
  const sb = makeSupabaseMock({ invoices: [inv({ organization_id: ORG_OUTRA })] });
  const r = await darBaixaManual(sb, ORG, { invoiceId: 'inv-orig-0001' });
  assertEquals(r.success, false);
  assert((r.error ?? '').includes('não encontrada'));
  // Nada gravado.
  assertEquals(sb._db.billing_events.length, 0);
  assertEquals(sb._db.invoices[0].status, 'vencida');
});

// ===========================================================================
// Idempotência de estado
// ===========================================================================
Deno.test('baixa de fatura já paga é no-op (idempotente, sem novo evento)', async () => {
  const sb = makeSupabaseMock({
    invoices: [inv({ status: 'paga', valor_pago: 217, pago_em: '2026-05-11T10:00:00.000Z' })],
  });
  const r = await darBaixaManual(sb, ORG, { invoiceId: 'inv-orig-0001' });
  assertEquals(r.success, true);
  assertEquals(r.data?.status, 'paga');
  // Nenhum evento novo gravado.
  assertEquals(sb._db.billing_events.length, 0);
});

// ===========================================================================
// Status não-baixável
// ===========================================================================
Deno.test('baixa recusa status pré-fiscal/terminal e nada grava', async () => {
  for (const st of ['rascunho', 'aprovada', 'emitindo', 'cancelada', 'substituida']) {
    const sb = makeSupabaseMock({ invoices: [inv({ status: st })] });
    const r = await darBaixaManual(sb, ORG, { invoiceId: 'inv-orig-0001' });
    assertEquals(r.success, false, `status ${st} não deveria ser baixável`);
    assertEquals(sb._db.billing_events.length, 0);
    assertEquals(sb._db.invoices[0].status, st);
  }
});
