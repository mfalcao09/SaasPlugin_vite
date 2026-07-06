// _shared/__tests__/invoice-batch-generate.test.ts
//
// Suíte `deno test` PURA (mock em memória, ZERO rede real) para o B3
// invoice-batch-generate. Cobre o critério binário do blueprint §3.2 B3:
//
//   (A) IDEMPOTÊNCIA: 2 execuções da MESMA competência → count de faturas igual
//       (0 duplicadas). Provado em DOIS níveis:
//        A1) núcleo puro computeInvoiceRows: na 2ª passada, com a competência já
//            no existingContractIds, planeja 0 inserts (skip 'ja_existe').
//        A2) integração via fake-DB que replica o UNIQUE(org,contract,competencia):
//            o 2º insert do mesmo (org,contract,competencia) devolve erro 23505;
//            o batch o captura como SKIP e o total de invoices NÃO cresce.
//
//   (B) DIA ÚTIL: vencimento em SÁBADO → SEGUNDA-feira; DOMINGO → SEGUNDA;
//       FERIADO (2026-05-01, sexta) → 2026-05-04 (segunda). A regra de dia útil
//       é injetada como fn JS que ESPELHA a SQL billing_next_business_day
//       (sáb/dom + tabela de feriados). Clamp de dia_vencimento em mês curto.
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede em runtime
// (o núcleo é puro; o mock resolve tudo em memória). `--allow-net` só porque o
// import do módulo por URL (deno.land/jsr) exige a permissão de fetch do módulo.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import {
  batchReferencia,
  computeInvoiceRows,
  daysInMonth,
  isUniqueViolation,
  isValidCompetencia,
  rawDueDate,
  type ContractRow,
} from '../../invoice-batch-generate/index.ts';

const ORG = 'org-aaaa-1111';

// ---------------------------------------------------------------------------
// nextBusinessDay de referência em JS — ESPELHA billing_next_business_day (SQL).
// Feriados sintéticos (nacional). Para o DOW usamos Date.UTC (TZ-safe).
// ---------------------------------------------------------------------------
const FERIADOS = new Set<string>(['2026-05-01']); // Dia do Trabalho (sexta)

function dowUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom .. 6=sáb
}
function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
function isBusinessDay(iso: string): boolean {
  const dow = dowUTC(iso);
  return dow !== 0 && dow !== 6 && !FERIADOS.has(iso);
}
function nextBusinessDay(iso: string): string {
  let cur = iso;
  let guard = 0;
  while (!isBusinessDay(cur) && guard < 30) {
    cur = addOneDay(cur);
    guard++;
  }
  return cur;
}

function contract(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 'ctr-0001',
    organization_id: ORG,
    payer_id: 'pay-0001',
    descricao: 'Mensalidade',
    modo_valor: 'fixo',
    valor_fixo: 150,
    dia_vencimento: 10,
    status: 'ativo',
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// Helpers puros de data/competência
// ===========================================================================
Deno.test('isValidCompetencia aceita YYYY-MM e rejeita o resto', () => {
  assert(isValidCompetencia('2026-05'));
  assert(isValidCompetencia('2026-12'));
  assert(!isValidCompetencia('2026-13'));
  assert(!isValidCompetencia('2026-00'));
  assert(!isValidCompetencia('2026-5'));
  assert(!isValidCompetencia('2026-05-01'));
  assert(!isValidCompetencia(''));
});

Deno.test('daysInMonth: fevereiro bissexto/comum e meses de 30/31', () => {
  assertEquals(daysInMonth('2026-02'), 28);
  assertEquals(daysInMonth('2024-02'), 29); // bissexto
  assertEquals(daysInMonth('2026-04'), 30);
  assertEquals(daysInMonth('2026-05'), 31);
});

Deno.test('rawDueDate clampa dia_vencimento ao tamanho do mês', () => {
  assertEquals(rawDueDate('2026-05', 10), '2026-05-10');
  assertEquals(rawDueDate('2026-02', 28), '2026-02-28');
  assertEquals(rawDueDate('2026-02', 31), '2026-02-28'); // clamp superior
  assertEquals(rawDueDate('2026-05', 0), '2026-05-01');  // clamp inferior
});

// ===========================================================================
// (B) DIA ÚTIL — sábado→segunda, domingo→segunda, feriado→próximo útil
// ===========================================================================
Deno.test('B: vencimento em SÁBADO rola para SEGUNDA', () => {
  assertEquals(dowUTC('2026-05-09'), 6, 'pré-condição: 09/05/2026 é sábado');
  const rows = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts: [contract({ dia_vencimento: 9 })], // cai no sábado
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].invoice!.vencimento, '2026-05-11'); // segunda-feira
  assertEquals(dowUTC('2026-05-11'), 1, 'saída é segunda-feira');
});

Deno.test('B: vencimento em DOMINGO rola para SEGUNDA', () => {
  assertEquals(dowUTC('2026-05-10'), 0, 'pré-condição: 10/05/2026 é domingo');
  const rows = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts: [contract({ dia_vencimento: 10 })],
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  assertEquals(rows[0].invoice!.vencimento, '2026-05-11');
});

Deno.test('B: vencimento em FERIADO (sexta 01/05) rola para segunda 04/05', () => {
  assertEquals(dowUTC('2026-05-01'), 5, 'pré-condição: 01/05/2026 é sexta');
  assert(FERIADOS.has('2026-05-01'), 'pré-condição: 01/05 é feriado');
  const rows = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts: [contract({ dia_vencimento: 1 })],
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  // 01(feriado)->02(sáb)->03(dom)->04(seg)
  assertEquals(rows[0].invoice!.vencimento, '2026-05-04');
  assertEquals(dowUTC('2026-05-04'), 1);
});

Deno.test('B: dia útil normal NÃO rola (idempotente na data)', () => {
  assertEquals(dowUTC('2026-05-11'), 1, 'segunda');
  const rows = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts: [contract({ dia_vencimento: 11 })],
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  assertEquals(rows[0].invoice!.vencimento, '2026-05-11');
});

// ===========================================================================
// (A1) IDEMPOTÊNCIA — núcleo puro: 2ª passada não planeja nada
// ===========================================================================
Deno.test('A1: computeInvoiceRows na 2ª passada planeja 0 inserts (skip ja_existe)', () => {
  const contracts = [
    contract({ id: 'ctr-A', dia_vencimento: 11 }),
    contract({ id: 'ctr-B', dia_vencimento: 12, payer_id: 'pay-B' }),
  ];
  const first = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts,
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  const created1 = first.filter((r) => r.invoice).map((r) => r.contract_id);
  assertEquals(created1.sort(), ['ctr-A', 'ctr-B']);

  const second = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts,
    existingContractIds: new Set(created1),
    nextBusinessDay,
  });
  assertEquals(second.filter((r) => r.invoice).length, 0);
  assert(second.every((r) => r.skipReason === 'ja_existe'));
});

Deno.test('A1: skip de contrato sem valor, variável, e sem dia_vencimento', () => {
  const rows = computeInvoiceRows({
    organizationId: ORG,
    competencia: '2026-05',
    contracts: [
      contract({ id: 'ctr-semvalor', modo_valor: 'fixo', valor_fixo: 0 }),
      contract({ id: 'ctr-variavel', modo_valor: 'variavel', valor_fixo: null, dia_vencimento: 10 }),
      contract({ id: 'ctr-semdia', dia_vencimento: null }),
    ],
    existingContractIds: new Set(),
    nextBusinessDay,
  });
  assertEquals(rows.filter((r) => r.invoice).length, 0);
  const reasons = Object.fromEntries(rows.map((r) => [r.contract_id, r.skipReason]));
  assertEquals(reasons['ctr-semvalor'], 'sem_valor');
  assertEquals(reasons['ctr-variavel'], 'sem_valor');
  assertEquals(reasons['ctr-semdia'], 'dia_venc_ausente');
});

Deno.test('isUniqueViolation reconhece 23505 e "duplicate key"', () => {
  assert(isUniqueViolation({ code: '23505' }));
  assert(isUniqueViolation({ message: 'duplicate key value violates unique constraint' }));
  assert(!isUniqueViolation({ code: '23503', message: 'foreign key' }));
  assert(!isUniqueViolation(null));
});

// ===========================================================================
// (A2) IDEMPOTÊNCIA — INTEGRAÇÃO: fake-DB que replica o UNIQUE(org,contract,
// competencia). Roda o "efetiva" 2× e prova que o count de invoices NÃO cresce.
// Espelha a estratégia de fake-DB de tools-cobranca.test.ts (insert respeitando
// a constraint). A lógica do "efetiva" reproduz o index.ts: insert -> se 23505,
// SKIP; senão created++.
// ===========================================================================

function makeInvoicesStore() {
  const rows: any[] = [];
  return {
    rows,
    insert(row: any): { data: any | null; error: { code: string; message: string } | null } {
      const dup = rows.some(
        (r) =>
          r.organization_id === row.organization_id &&
          r.contract_id === row.contract_id &&
          r.competencia === row.competencia,
      );
      if (dup) {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "invoices_org_contract_comp"' },
        };
      }
      const saved = { id: `inv-${rows.length + 1}`, ...row };
      rows.push(saved);
      return { data: saved, error: null };
    },
    existingContractIdsFor(competencia: string): Set<string> {
      return new Set(rows.filter((r) => r.competencia === competencia).map((r) => r.contract_id));
    },
  };
}

function runBatchEffective(store: ReturnType<typeof makeInvoicesStore>, contracts: ContractRow[], competencia: string) {
  const planned = computeInvoiceRows({
    organizationId: ORG,
    competencia,
    contracts,
    existingContractIds: store.existingContractIdsFor(competencia),
    nextBusinessDay,
  });
  let created = 0;
  let skipped = planned.filter((p) => !p.invoice).length;
  for (const p of planned) {
    if (!p.invoice) continue;
    const { error } = store.insert(p.invoice);
    if (error) {
      if (isUniqueViolation(error)) { skipped++; continue; }
      throw new Error('erro inesperado no insert: ' + error.message);
    }
    created++;
  }
  return { created, skipped, total: store.rows.length };
}

Deno.test('A2: 2x a mesma competência → 0 faturas duplicadas (count igual)', () => {
  const store = makeInvoicesStore();
  const contracts = [
    contract({ id: 'ctr-A', dia_vencimento: 11 }),
    contract({ id: 'ctr-B', dia_vencimento: 12, payer_id: 'pay-B' }),
    contract({ id: 'ctr-C', dia_vencimento: 9, payer_id: 'pay-C' }), // sábado → rola
  ];

  const run1 = runBatchEffective(store, contracts, '2026-05');
  assertEquals(run1.created, 3);
  assertEquals(run1.total, 3);

  const run2 = runBatchEffective(store, contracts, '2026-05');
  assertEquals(run2.created, 0, 'nenhuma fatura nova na 2ª rodada');
  assertEquals(run2.total, 3, 'count de faturas permanece 3 (0 duplicadas)');

  // Dia-útil também nos dados gravados: ctr-C (dia 9 = sábado) virou 11 (segunda).
  const invC = store.rows.find((r) => r.contract_id === 'ctr-C');
  assertEquals(invC.vencimento, '2026-05-11');

  // Referências determinísticas e únicas por contrato.
  const refs = store.rows.map((r) => r.referencia);
  assertEquals(new Set(refs).size, refs.length, 'referências únicas');
  assertEquals(
    store.rows.find((r) => r.contract_id === 'ctr-A').referencia,
    batchReferencia('2026-05', 'ctr-A'),
  );
});

Deno.test('A2: 3ª execução após adicionar 1 contrato novo → só o novo é criado', () => {
  const store = makeInvoicesStore();
  const base = [contract({ id: 'ctr-A', dia_vencimento: 11 })];
  runBatchEffective(store, base, '2026-06');
  assertEquals(store.rows.length, 1);

  const comMaisUm = [...base, contract({ id: 'ctr-NOVO', dia_vencimento: 15, payer_id: 'pay-N' })];
  const run = runBatchEffective(store, comMaisUm, '2026-06');
  assertEquals(run.created, 1, 'só o contrato novo gera fatura');
  assertEquals(run.skipped, 1, 'o antigo é skip ja_existe');
  assertEquals(store.rows.length, 2);
});
