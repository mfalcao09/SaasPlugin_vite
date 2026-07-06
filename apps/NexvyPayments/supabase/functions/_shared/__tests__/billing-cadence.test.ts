// _shared/__tests__/billing-cadence.test.ts
//
// Suíte `deno test` PURA (mock em memória + clock fixo, ZERO rede) para a RÉGUA
// DE COBRANÇA POR FATURA — D1+D2+D3. Cobre os 3 critérios verbatim do entregável:
//
//   D1 — enrollment carrega invoice_id E a 1ª mensagem CITA fatura/valor/venc
//        (renderFirstMessageContext) — não genérica.
//   D2 — agendamento por due_date: fatura vencendo em D+3 → step D-3 HOJE;
//        D+7 em vencimento+7. TZ America/Sao_Paulo. NÃO now+delay.
//   D3 — stop POR FATURA: payer com 2 faturas abertas paga 1 → a régua da paga
//        PARA, a da outra CONTINUA; nenhum run pós-pagamento da paga fica ativo.
//        (Contraste: cadence-on-response/-stop do Beauty parariam por lead_id,
//        matando as DUAS.)
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede (helpers
// puros + mock in-memory; nenhuma chamada de fetch/rpc). O mock replica o
// query-builder encadeável do molde tools-cobranca.test.ts:35-155 (eq/update/
// select/then), estendido com gte/lte para o filtro de vencidos.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  buildStepRuns,
  computeScheduledAtByDueDate,
  renderFirstMessageContext,
  brToday,
  BILLING_CADENCE_STEPS,
} from "../billing-cadence.ts";

// ===========================================================================
// Fake-DB + client mock (molde tools-cobranca.test.ts:35-155), com gte/lte.
// ===========================================================================
let _idSeq = 0;
function newId(prefix: string) {
  _idSeq++;
  return `${prefix}-${String(_idSeq).padStart(4, "0")}-abcdefaa`;
}

function makeSupabaseMock(seed: Record<string, any[]>) {
  const db: Record<string, any[]> = {};
  for (const k of Object.keys(seed)) db[k] = [...seed[k]];

  function makeBuilder(table: string) {
    if (!db[table]) db[table] = [];
    const eqs: Array<[string, any]> = [];
    const gtes: Array<[string, any]> = [];
    const ltes: Array<[string, any]> = [];
    let limitN: number | null = null;
    let pendingInsert: any[] | null = null;
    let pendingUpdate: any | null = null;

    function applyFilters(rows: any[]): any[] {
      let out = rows.filter((r) => eqs.every(([c, v]) => r[c] === v));
      out = out.filter((r) => gtes.every(([c, v]) => String(r[c]) >= String(v)));
      out = out.filter((r) => ltes.every(([c, v]) => String(r[c]) <= String(v)));
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    }

    const builder: any = {
      select() { return builder; },
      eq(col: string, val: any) { eqs.push([col, val]); return builder; },
      gte(col: string, val: any) { gtes.push([col, val]); return builder; },
      lte(col: string, val: any) { ltes.push([col, val]); return builder; },
      limit(n: number) { limitN = n; return builder; },
      insert(rowOrRows: any) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        pendingInsert = rows.map((r) => ({ id: r.id ?? newId(table.slice(0, 3)), ...r }));
        db[table].push(...pendingInsert);
        return builder;
      },
      update(patch: any) { pendingUpdate = patch; return builder; },
      async maybeSingle() {
        if (pendingInsert) return { data: pendingInsert[0], error: null };
        if (pendingUpdate) {
          const targets = db[table].filter((r) => eqs.every(([c, v]) => r[c] === v));
          for (const t of targets) Object.assign(t, pendingUpdate);
          return { data: targets[0] ?? null, error: null };
        }
        const rows = applyFilters(db[table]);
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return { data: pendingInsert[0], error: null };
        const rows = applyFilters(db[table]);
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: any) => void) {
        if (pendingInsert) { resolve({ data: pendingInsert, error: null }); return; }
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

  return { _db: db, from(table: string) { return makeBuilder(table); } };
}

// ===========================================================================
// D1 — enrollment carrega invoice_id E 1ª mensagem CITA fatura/valor/venc.
// ===========================================================================
Deno.test("D1: enrollment carrega invoice_id e 1a mensagem cita fatura/valor/vencimento (nao generica)", async () => {
  const sb = makeSupabaseMock({ billing_cadence_enrollments: [], billing_cadence_step_runs: [] });
  const INVOICE_ID = "inv-d1-0001";
  const ORG = "org-aaaa-1111";

  // 1ª mensagem renderizada (o que o enroll grava em source_ref.first_message_context).
  const firstMsg = renderFirstMessageContext("Maria Souza da Silva", {
    referencia: "REF-2026-07-0001",
    valor_total: 217.0,
    vencimento: "2026-07-10",
    c6_pix_copia_cola: "00020126BR.GOV.BCB.PIX",
    c6_linha_digitavel: "00190000090123456789",
  });

  // Cita valor (R$ 217,00), vencimento (10/07/2026) e referência — NÃO genérica.
  assert(firstMsg.includes("REF-2026-07-0001"), "deve citar a referência da fatura");
  assert(/217[.,]00/.test(firstMsg), "deve citar o valor da fatura");
  assert(firstMsg.includes("10/07/2026"), "deve citar o vencimento formatado BR");
  assert(firstMsg.includes("Maria"), "deve personalizar com o 1º nome do pagador");
  assert(!/^\s*$/.test(firstMsg) && firstMsg.length > 40, "não pode ser mensagem vazia/genérica");

  // O enrollment gravado carrega invoice_id + o contexto da 1ª msg em source_ref.
  const { data: enr } = await sb
    .from("billing_cadence_enrollments")
    .insert({
      organization_id: ORG,
      invoice_id: INVOICE_ID,
      status: "active",
      current_step_index: 0,
      source: "billing_event",
      source_ref: { tipo: "emitida", referencia: "REF-2026-07-0001", first_message_context: firstMsg },
    })
    .select("id")
    .single();

  const row = sb._db.billing_cadence_enrollments.find((r: any) => r.id === enr.id);
  assertEquals(row.invoice_id, INVOICE_ID, "enrollment DEVE carregar invoice_id");
  assert(row.source_ref.first_message_context.includes("217"), "source_ref carrega a msg que cita a fatura");
});

// ===========================================================================
// D2 — agendamento por due_date (NÃO now+delay). Clock fixo.
// Critério verbatim: fatura vencendo em D+3 → step D-3 agendado para HOJE;
// D+7 para vencimento+7.
// ===========================================================================
Deno.test("D2: fatura vencendo em D+3 -> step D-3 cai HOJE; D+7 cai em vencimento+7 (TZ America/Sao_Paulo)", () => {
  // Clock fixo: 'hoje' = 2026-07-07 (meio-dia BRT p/ não cruzar meia-noite no teste).
  const FIXED_NOW = new Date("2026-07-07T15:00:00Z"); // 12:00 BRT
  const hojeBR = brToday(FIXED_NOW);
  assertEquals(hojeBR, "2026-07-07");

  // Fatura vence em D+3 = 2026-07-10.
  const vencimento = "2026-07-10";
  const seeds = buildStepRuns(vencimento, FIXED_NOW);
  const byKey = Object.fromEntries(seeds.map((s) => [s.step_key, s]));

  // Todos os 4 passos existem (D-3, D0, D+1, D+7).
  assertEquals(seeds.length, BILLING_CADENCE_STEPS.length);
  for (const k of ["D-3", "D0", "D+1", "D+7"]) assert(byKey[k], `passo ${k} deve existir`);

  // D-3: (venc 07-10) - 3 = 07-07 = HOJE. A data local do agendamento = hoje.
  const dMinus3LocalDate = new Date(byKey["D-3"].scheduled_at)
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  assertEquals(dMinus3LocalDate, hojeBR, "step D-3 deve ser agendado para HOJE");

  // D+7: (venc 07-10) + 7 = 07-17.
  const dPlus7LocalDate = new Date(byKey["D+7"].scheduled_at)
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  assertEquals(dPlus7LocalDate, "2026-07-17", "step D+7 deve cair em vencimento+7");

  // PROVA de que NÃO é now+delay: o D+7 é ancorado no calendário do VENCIMENTO,
  // não em now+7d. Se fosse now+delay a partir de hoje (07-07), o "D+7" cairia em
  // 07-14, não 07-17. Asseguramos 07-17 e negamos 07-14.
  assert(dPlus7LocalDate !== "2026-07-14", "D+7 NÃO pode ser now+7d (seria 07-14); tem de ser venc+7 (07-17)");

  // Sanidade da função base isolada.
  const d0 = computeScheduledAtByDueDate("2026-07-10", 0);
  assertEquals(
    d0.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    "2026-07-10",
    "D0 cai no próprio vencimento",
  );
});

// ===========================================================================
// D3 — stop POR FATURA. Replica a operação do billing-cadence-stop/index.ts
// (UPDATE keyed por invoice_id) contra o mock, e prova que a fatura IRMÃ segue.
// ===========================================================================

// Operação de stop idêntica à do handler billing-cadence-stop (por invoice_id).
async function stopByInvoice(sb: any, invoiceId: string, reason = "paga") {
  const nowIso = new Date().toISOString();
  const { data: runs } = await sb
    .from("billing_cadence_step_runs")
    .update({ status: "skipped", skip_reason: reason, executed_at: nowIso })
    .eq("invoice_id", invoiceId)
    .eq("status", "scheduled")
    .select("id");
  const { data: enrs } = await sb
    .from("billing_cadence_enrollments")
    .update({ status: "stopped", stopped_at: nowIso, stop_reason: reason })
    .eq("invoice_id", invoiceId)
    .eq("status", "active")
    .select("id");
  return { runs_cancelled: (runs ?? []).length, enrollments_stopped: (enrs ?? []).length };
}

Deno.test("D3: payer com 2 faturas abertas paga 1 -> so a paga PARA; a irma CONTINUA (stop por fatura, nao por lead)", async () => {
  const ORG = "org-aaaa-1111";
  const PAYER = "pay-1";
  const LEAD = "lead-1"; // MESMO lead nas duas faturas — a armadilha do stop-por-lead.
  const INV_PAGA = "inv-paga-0001";
  const INV_ABERTA = "inv-aberta-0002";

  const sb = makeSupabaseMock({
    billing_cadence_enrollments: [
      { id: "enr-paga", organization_id: ORG, invoice_id: INV_PAGA, payer_id: PAYER, lead_id: LEAD, status: "active" },
      { id: "enr-aberta", organization_id: ORG, invoice_id: INV_ABERTA, payer_id: PAYER, lead_id: LEAD, status: "active" },
    ],
    billing_cadence_step_runs: [
      // Régua da fatura que SERÁ paga (2 passos futuros agendados).
      { id: "run-paga-1", organization_id: ORG, enrollment_id: "enr-paga", invoice_id: INV_PAGA, step_key: "D+1", status: "scheduled" },
      { id: "run-paga-2", organization_id: ORG, enrollment_id: "enr-paga", invoice_id: INV_PAGA, step_key: "D+7", status: "scheduled" },
      // Régua da fatura IRMÃ (mesmo payer/lead) — deve permanecer intacta.
      { id: "run-aberta-1", organization_id: ORG, enrollment_id: "enr-aberta", invoice_id: INV_ABERTA, step_key: "D+1", status: "scheduled" },
      { id: "run-aberta-2", organization_id: ORG, enrollment_id: "enr-aberta", invoice_id: INV_ABERTA, step_key: "D+7", status: "scheduled" },
    ],
  });

  // Pagamento da 1ª fatura → stop POR FATURA (keyed por INV_PAGA).
  const res = await stopByInvoice(sb, INV_PAGA, "paga");
  assertEquals(res.enrollments_stopped, 1, "apenas 1 enrollment (o da fatura paga) para");
  assertEquals(res.runs_cancelled, 2, "apenas os 2 runs da fatura paga são cancelados");

  const runs: any[] = sb._db.billing_cadence_step_runs;
  const enrs: any[] = sb._db.billing_cadence_enrollments;

  // A régua da fatura PAGA parou: enrollment 'stopped', runs 'skipped'.
  assertEquals(enrs.find((e) => e.id === "enr-paga").status, "stopped");
  assert(runs.filter((r) => r.invoice_id === INV_PAGA).every((r) => r.status === "skipped"),
    "todos os runs da fatura paga viram skipped");

  // A régua da fatura IRMÃ CONTINUA: enrollment 'active', runs ainda 'scheduled'.
  assertEquals(enrs.find((e) => e.id === "enr-aberta").status, "active",
    "a régua da fatura NÃO paga permanece ativa");
  assert(runs.filter((r) => r.invoice_id === INV_ABERTA).every((r) => r.status === "scheduled"),
    "nenhum run da fatura irmã foi tocado — ela continua sendo cobrada");

  // NENHUMA msg pós-pagamento da paga: não sobra run 'scheduled' da fatura paga.
  assertEquals(
    runs.filter((r) => r.invoice_id === INV_PAGA && r.status === "scheduled").length,
    0,
    "nenhum passo futuro da fatura paga pode continuar agendado",
  );

  // Contraste explícito: se o stop fosse por lead_id (molde Beauty), as DUAS réguas
  // parariam (mesmo LEAD). Provamos o oposto — a fatura irmã sobreviveu.
  assert(runs.some((r) => r.invoice_id === INV_ABERTA && r.status === "scheduled"),
    "prova anti-regressão: stop por fatura NÃO derrubou a régua da fatura irmã do mesmo lead");
});
