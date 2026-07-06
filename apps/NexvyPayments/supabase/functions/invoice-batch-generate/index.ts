// ─── invoice-batch-generate — geração de faturas do mês em lote (B3) ─────────
// Blueprint §3.2 B3. Materializa as `invoices` de uma competência (YYYY-MM) a
// partir dos `contracts` ATIVOS de uma org. Duas invariantes cravadas:
//
//   1) IDEMPOTÊNCIA (blueprint §7): re-rodar a MESMA competência NÃO duplica
//      fatura. A garantia dura é o UNIQUE(org, contract, competencia) em invoices
//      (billing_model.sql:314). Inserimos contrato-a-contrato e capturamos a
//      violação (SQLSTATE 23505 / "duplicate key") como SKIP — nunca como erro.
//      (Batch insert único abortaria a transação toda no 1º duplicado; por isso
//      1 insert por contrato, isolando o conflito.) Antes disso, um pré-scan das
//      competências já existentes evita nem tentar o insert do que já existe —
//      é só otimização; o UNIQUE é quem SEGURA.
//
//   2) VENCIMENTO EM DIA ÚTIL (§3.2 B3): o vencimento cru = `dia_vencimento` do
//      contrato no mês da competência; se cair em sáb/dom ou feriado, ROLA para
//      o próximo dia útil via RPC billing_next_business_day (migration
//      20260706105000_billing_next_business_day.sql). Sábado -> segunda.
//
// SEGURANÇA: dry_run=true por padrão → só CALCULA e devolve a prévia, sem gravar.
// Só o cron (Bearer service_role) ou admin/manager da org (JWT) efetivam. Reads
// não-cron rodam sob o JWT do usuário (RLS confina à própria org).
//
// MOLDE: header/estrutura Deno.serve + CORS + createClient de
// salon-automation-run/index.ts:12-90; geração de `referencia`/`competencia` e
// insert+select de _shared/tools/impl/segunda_via.ts:95-127; billing_events
// (origem:'batch') de segunda_via.ts:154-169 e billing_model.sql:414-423.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

// ── Tipos do domínio (subset do schema billing_model.sql) ────────────────────
export interface ContractRow {
  id: string
  organization_id: string
  payer_id: string
  descricao: string
  modo_valor: 'fixo' | 'variavel'
  valor_fixo: number | null
  dia_vencimento: number | null
  status: string
  metadata?: Record<string, unknown> | null
}

export interface InvoiceInsert {
  organization_id: string
  contract_id: string
  payer_id: string
  competencia: string
  referencia: string
  valor_original: number
  multa_pct: number
  juros_pct: number
  valor_multa: number
  valor_juros: number
  valor_total: number
  vencimento: string          // YYYY-MM-DD (já rolado p/ dia útil)
  status: 'rascunho'
  metadata: Record<string, unknown>
}

export interface PlannedRow {
  contract_id: string
  invoice: InvoiceInsert | null   // null = pulado no plano (sem valor / já existe)
  skipReason?: 'sem_valor' | 'ja_existe' | 'dia_venc_ausente'
}

// ── Helpers de competência/data (PUROS, testáveis sem DB) ────────────────────

// Valida 'YYYY-MM'. Não usa new Date() no parse (evita TZ shift — feedback
// iso_date_format_br): opera por regex/string.
export function isValidCompetencia(c: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(c)
}

// Dias no mês da competência (para clampar dia_vencimento em fev etc.). Puro.
// Usa Date.UTC (dia 0 do mês seguinte = último dia do mês alvo) — sem TZ local.
export function daysInMonth(competencia: string): number {
  const [y, m] = competencia.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Vencimento CRU (antes de rolar p/ dia útil): dia_vencimento clampado ao mês.
// Saída YYYY-MM-DD construída por string (sem Date-parse sujeito a TZ).
export function rawDueDate(competencia: string, diaVenc: number): string {
  const clamped = Math.min(Math.max(diaVenc, 1), daysInMonth(competencia))
  return `${competencia}-${String(clamped).padStart(2, '0')}`
}

// Referência de idempotência de EMISSÃO (única por org): batch determinístico.
// competencia + contrato → mesma referência sempre (re-run não muda a chave).
export function batchReferencia(competencia: string, contractId: string): string {
  return `BATCH-${competencia}-${contractId}`
}

// ── NÚCLEO PURO: planeja as linhas de fatura (sem tocar DB) ───────────────────
// Recebe os contratos ativos, a competência, o conjunto de contract_id que já
// têm fatura na competência e uma função nextBusinessDay (injetada — no runtime
// vem da RPC SQL; no teste, uma impl JS espelhando a regra). Devolve o plano.
// Idempotência de PLANO: contrato cuja fatura já existe vira skipReason:'ja_existe'.
export function computeInvoiceRows(args: {
  organizationId: string
  competencia: string
  contracts: ContractRow[]
  existingContractIds: Set<string>
  nextBusinessDay: (raw: string) => string
}): PlannedRow[] {
  const { organizationId, competencia, contracts, existingContractIds, nextBusinessDay } = args
  const out: PlannedRow[] = []
  for (const c of contracts) {
    if (existingContractIds.has(c.id)) {
      out.push({ contract_id: c.id, invoice: null, skipReason: 'ja_existe' })
      continue
    }
    if (c.dia_vencimento == null) {
      out.push({ contract_id: c.id, invoice: null, skipReason: 'dia_venc_ausente' })
      continue
    }
    // Só materializa valor quando há valor a cobrar. 'variavel' sem leitura no
    // batch não gera fatura aqui (a leitura entra por outro fluxo). 'fixo' precisa
    // de valor_fixo > 0.
    const valor = c.modo_valor === 'fixo' ? Number(c.valor_fixo ?? 0) : 0
    if (!(valor > 0)) {
      out.push({ contract_id: c.id, invoice: null, skipReason: 'sem_valor' })
      continue
    }
    const raw = rawDueDate(competencia, c.dia_vencimento)
    const vencimento = nextBusinessDay(raw)   // rola p/ dia útil
    out.push({
      contract_id: c.id,
      invoice: {
        organization_id: organizationId,
        contract_id: c.id,
        payer_id: c.payer_id,
        competencia,
        referencia: batchReferencia(competencia, c.id),
        valor_original: valor,
        multa_pct: 0,
        juros_pct: 0,
        valor_multa: 0,
        valor_juros: 0,
        valor_total: valor,     // no nascimento não há encargo (fatura rascunho)
        vencimento,
        status: 'rascunho',
        metadata: { origem: 'invoice-batch-generate', competencia },
      },
    })
  }
  return out
}

// Detecta violação de unicidade do Postgres (idempotência dura). PostgREST
// devolve code '23505'; a mensagem também traz "duplicate key".
export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '23505' || /duplicate key|unique constraint/i.test(err.message ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const auth = req.headers.get('authorization') ?? ''
  const isCron = auth === `Bearer ${SERVICE_ROLE}`

  const body = await req.json().catch(() => ({}))
  const competencia: string = body.competencia ?? ''
  const onlyOrg: string | null = body.organization_id ?? null
  // dry_run default TRUE (seguro). Não-cron sempre dry (só admin/manager efetiva).
  let dryRun: boolean = body.dry_run !== false
  if (!isCron) dryRun = true

  if (!isValidCompetencia(competencia)) {
    return json({ error: "competencia inválida (esperado 'YYYY-MM')" }, 400)
  }
  if (!isCron && !onlyOrg) {
    return json({ error: 'organization_id obrigatório fora do cron' }, 400)
  }

  // Reads não-cron sob JWT do usuário → RLS confina à própria org.
  const db = isCron
    ? admin
    : createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })

  // 1) Contratos ATIVOS (opcionalmente de uma org).
  let cq = db
    .from('contracts')
    .select('id, organization_id, payer_id, descricao, modo_valor, valor_fixo, dia_vencimento, status, metadata')
    .eq('status', 'ativo')
  if (onlyOrg) cq = cq.eq('organization_id', onlyOrg)
  const { data: contracts, error: cErr } = await cq
  if (cErr) return json({ error: cErr.message }, 500)

  const contractRows = (contracts ?? []) as ContractRow[]
  if (contractRows.length === 0) {
    return json({ ok: true, competencia, dry_run: dryRun, contracts: 0, created: 0, skipped: 0, results: [] })
  }

  // 2) Pré-scan das faturas já existentes na competência (otimização de idempotência).
  const contractIds = contractRows.map((c) => c.id)
  let exq = db.from('invoices').select('contract_id').eq('competencia', competencia).in('contract_id', contractIds)
  if (onlyOrg) exq = exq.eq('organization_id', onlyOrg)
  const { data: existing, error: eErr } = await exq
  if (eErr) return json({ error: eErr.message }, 500)
  const existingContractIds = new Set((existing ?? []).map((r: { contract_id: string }) => r.contract_id))

  // 3) Resolve vencimento em dia útil por org via RPC (cache por (org,raw)).
  // computeInvoiceRows é síncrono; pré-resolvemos todos os (org,raw) necessários.
  const nbdCache = new Map<string, string>()
  const need = new Map<string, { org: string; raw: string }>()
  for (const c of contractRows) {
    if (existingContractIds.has(c.id) || c.dia_vencimento == null) continue
    const valor = c.modo_valor === 'fixo' ? Number(c.valor_fixo ?? 0) : 0
    if (!(valor > 0)) continue
    const raw = rawDueDate(competencia, c.dia_vencimento)
    need.set(`${c.organization_id}|${raw}`, { org: c.organization_id, raw })
  }
  for (const { org, raw } of need.values()) {
    const { data, error } = await admin.rpc('billing_next_business_day', { p_org: org, p_date: raw })
    nbdCache.set(`${org}|${raw}`, error || !data ? raw : String(data))   // falha segura: mantém o cru
  }
  const nextBusinessDayFor = (org: string) => (raw: string) => nbdCache.get(`${org}|${raw}`) ?? raw

  // 4) Planeja (agrupa por org p/ passar o lookup certo).
  const planned: PlannedRow[] = []
  const byOrg = new Map<string, ContractRow[]>()
  for (const c of contractRows) {
    const arr = byOrg.get(c.organization_id) ?? []
    arr.push(c)
    byOrg.set(c.organization_id, arr)
  }
  for (const [org, rows] of byOrg) {
    planned.push(...computeInvoiceRows({
      organizationId: org,
      competencia,
      contracts: rows,
      existingContractIds,
      nextBusinessDay: nextBusinessDayFor(org),
    }))
  }

  const preSkipped = planned.filter((p) => !p.invoice).length

  // DRY-RUN: só devolve a prévia (nada gravado).
  if (dryRun) {
    return json({
      ok: true,
      competencia,
      dry_run: true,
      contracts: contractRows.length,
      to_create: planned.length - preSkipped,
      skipped: preSkipped,
      results: planned.map((p) => ({
        contract_id: p.contract_id,
        vencimento: p.invoice?.vencimento ?? null,
        valor_total: p.invoice?.valor_total ?? null,
        skip: p.skipReason ?? null,
      })),
    })
  }

  // 5) EFETIVA: insert contrato-a-contrato; 23505 = já existe = SKIP (idempotência dura).
  let created = 0
  let skipped = preSkipped
  const results: Array<Record<string, unknown>> = []
  for (const p of planned) {
    if (!p.invoice) {
      results.push({ contract_id: p.contract_id, status: 'skip', reason: p.skipReason })
      continue
    }
    const { data: inv, error: iErr } = await admin
      .from('invoices')
      .insert(p.invoice)
      .select('id, referencia, vencimento, valor_total')
      .single()
    if (iErr) {
      if (isUniqueViolation(iErr)) {
        skipped++
        results.push({ contract_id: p.contract_id, status: 'skip', reason: 'ja_existe' })
        continue
      }
      results.push({ contract_id: p.contract_id, status: 'error', error: iErr.message })
      continue
    }
    created++
    // Trilha (billing_events origem:'batch'). Best-effort: não derruba o lote.
    try {
      await admin.from('billing_events').insert({
        organization_id: p.invoice.organization_id,
        invoice_id: inv.id,
        tipo: 'emitida',
        origem: 'batch',
        payload: { competencia, referencia: inv.referencia, vencimento: inv.vencimento, valor_total: Number(inv.valor_total) },
      })
    } catch (_e) { /* trilha é auxiliar; idempotência não depende dela */ }
    results.push({ contract_id: p.contract_id, status: 'created', invoice_id: inv.id, vencimento: inv.vencimento })
  }

  return json({ ok: true, competencia, dry_run: false, contracts: contractRows.length, created, skipped, results })
})
