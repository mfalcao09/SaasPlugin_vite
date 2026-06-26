// ─── salon-automation-run — motor das Receitas de Automação de Salão ─────────
// Feature B. Roda (cron diário, inc.3) e DETECTA eventos de salão pra cada org
// com regra ligada: aniversário hoje, pacote vencendo, agendamento amanhã (24h),
// retorno de inativo. Compõe a mensagem e (fora do dry-run) dispara no WhatsApp
// via evolution-send, com idempotência (não envia o mesmo evento 2x) e LOG.
//
// SEGURANÇA: dry_run=true por padrão → só DETECTA e devolve a prévia, sem enviar.
// Regras nascem desligadas. Resolução de telefone por nome usa GUARDA DE
// AMBIGUIDADE (homônimo não resolve → não dispara pro cliente errado).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

type Tipo = 'aniversario' | 'pacote_vencendo' | 'agendamento_24h' | 'retorno_inativo'

// ── helpers de data (datas YYYY-MM-DD; "hoje" no fuso do salão = America/Sao_Paulo)
const brToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
const mmdd = (iso: string) => iso.slice(5, 10)

const firstName = (nome: string | null | undefined) => (nome || 'cliente').trim().split(/\s+/)[0]
const normNome = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
function normPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) d = '55' + d
  return /^55\d{10,11}$/.test(d) ? d : null
}

function defaultMsg(tipo: Tipo, nome: string | null | undefined): string {
  const p = firstName(nome)
  switch (tipo) {
    case 'aniversario': return `Oi ${p}! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho seu aqui no salão. Vem buscar? 🎂`
    case 'pacote_vencendo': return `Oi ${p}! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? Posso já deixar separado 😉`
    case 'agendamento_24h': return `Oi ${p}! Passando pra confirmar seu horário de amanhã 💕 Posso te esperar? Qualquer coisa, me avisa.`
    case 'retorno_inativo': return `Oi ${p}! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana? Tenho um mimo te esperando 🎁`
  }
}
const compose = (tpl: string | null, tipo: Tipo, nome: string | null | undefined) =>
  tpl && tpl.trim() ? tpl.replace(/\{nome\}/g, firstName(nome)) : defaultMsg(tipo, nome)

interface Evento { tipo: Tipo; cliente_id: string | null; cliente_nome: string; telefone: string | null; mensagem: string; ref: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  // Insere no log sem derrubar o loop: insert duplicado (corrida de cron ou retry)
  // bate no unique index e é benigno — engole o erro.
  const logSafe = async (row: Record<string, unknown>) => {
    try { await admin.from('salon_automation_log').insert(row) } catch (_e) { /* idempotência */ }
  }

  const auth = req.headers.get('authorization') ?? ''
  const isCron = auth === `Bearer ${SERVICE_ROLE}` // SÓ o cron (service role) pode ENVIAR
  const body = await req.json().catch(() => ({}))
  let onlyOrg: string | null = body.organization_id ?? null
  let dryRun: boolean = body.dry_run !== false // default TRUE (seguro)
  if (!isCron) {
    // Chamada não-cron (ex.: prévia da UI): NUNCA envia + obriga escopo de 1 org.
    dryRun = true
    if (!onlyOrg) {
      return new Response(JSON.stringify({ error: 'organization_id obrigatório fora do cron' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
    }
  }
  const hoje: string = body.hoje ?? brToday()
  const amanha = addDays(hoje, 1)
  const hojeMes = hoje.slice(0, 7)

  // Regras LIGADAS (a flag é por-regra; nada roda sem enabled=true).
  let rq = admin.from('salon_automation_rules').select('organization_id, tipo, template, antecedencia_dias').eq('enabled', true)
  if (onlyOrg) rq = rq.eq('organization_id', onlyOrg)
  const { data: rules, error: rulesErr } = await rq
  if (rulesErr) return new Response(JSON.stringify({ error: rulesErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  const porOrg = new Map<string, typeof rules>()
  for (const r of rules ?? []) (porOrg.get(r.organization_id) ?? porOrg.set(r.organization_id, []).get(r.organization_id)!).push(r)

  const resultadoOrgs: Record<string, { detectados: number; enviados: number; falhas: number; pulados: number; eventos: Evento[] }> = {}

  for (const [orgId, orgRules] of porOrg) {
    // Base de clientes da org → telefone/nascimento + GUARDA de ambiguidade por nome.
    const { data: clientes } = await admin.from('clientes')
      .select('id, nome, telefone, data_nascimento, status').eq('organization_id', orgId)
    const telById = new Map<string, string | null>()
    const telByNome = new Map<string, string | null>() // null = ambíguo
    const cliByNome = new Map<string, string | null>() // id por nome (null = ambíguo)
    for (const c of clientes ?? []) {
      telById.set(c.id, c.telefone)
      const k = normNome(c.nome)
      if (k) {
        telByNome.set(k, telByNome.has(k) && telByNome.get(k) !== c.telefone ? null : c.telefone)
        cliByNome.set(k, cliByNome.has(k) && cliByNome.get(k) !== c.id ? null : c.id)
      }
    }
    const telDoNome = (nome: string | null) => telByNome.get(normNome(nome)) ?? null
    const idDoNome = (nome: string | null) => cliByNome.get(normNome(nome)) ?? null

    const candidatos: Evento[] = []
    const tipos = new Set(orgRules.map((r) => r.tipo))
    const ruleOf = (t: Tipo) => orgRules.find((r) => r.tipo === t)!

    // ── aniversário hoje (MM-DD bate) ──
    if (tipos.has('aniversario')) {
      const r = ruleOf('aniversario')
      for (const c of clientes ?? []) {
        if (!c.data_nascimento || mmdd(c.data_nascimento) !== mmdd(hoje)) continue
        candidatos.push({ tipo: 'aniversario', cliente_id: c.id, cliente_nome: c.nome ?? 'Cliente', telefone: normPhone(c.telefone), mensagem: compose(r.template, 'aniversario', c.nome), ref: `aniversario:${c.id}:${hojeMes}` })
      }
    }
    // ── pacote vencendo (entre hoje e hoje+antecedência) ──
    if (tipos.has('pacote_vencendo')) {
      const r = ruleOf('pacote_vencendo')
      const ate = addDays(hoje, Math.max(0, r.antecedencia_dias ?? 3))
      const { data: pacs } = await admin.from('pacote_clientes')
        .select('id, cliente_nome, status, data_validade').eq('organization_id', orgId)
        .eq('status', 'ativo').gte('data_validade', hoje).lte('data_validade', ate)
      for (const p of pacs ?? []) {
        candidatos.push({ tipo: 'pacote_vencendo', cliente_id: idDoNome(p.cliente_nome), cliente_nome: p.cliente_nome ?? 'Cliente', telefone: normPhone(telDoNome(p.cliente_nome)), mensagem: compose(r.template, 'pacote_vencendo', p.cliente_nome), ref: `pacote_vencendo:${p.id}:${p.data_validade}` })
      }
    }
    // ── agendamento amanhã (confirmação 24h) ──
    if (tipos.has('agendamento_24h')) {
      const r = ruleOf('agendamento_24h')
      const { data: ags } = await admin.from('agendamentos')
        .select('id, cliente_id, cliente_nome, data, status').eq('organization_id', orgId)
        .eq('data', amanha).neq('status', 'cancelado')
      for (const a of ags ?? []) {
        const cid = a.cliente_id ?? idDoNome(a.cliente_nome)
        const tel = a.cliente_id ? telById.get(a.cliente_id) ?? null : telDoNome(a.cliente_nome)
        candidatos.push({ tipo: 'agendamento_24h', cliente_id: cid, cliente_nome: a.cliente_nome ?? 'Cliente', telefone: normPhone(tel), mensagem: compose(r.template, 'agendamento_24h', a.cliente_nome), ref: `agendamento_24h:${a.id}` })
      }
    }
    // ── retorno de inativo (última visita = hoje − antecedência) ──
    if (tipos.has('retorno_inativo')) {
      const r = ruleOf('retorno_inativo')
      const alvo = addDays(hoje, -Math.max(1, r.antecedencia_dias ?? 45))
      const { data: ags } = await admin.from('agendamentos')
        .select('cliente_id, cliente_nome, data, status').eq('organization_id', orgId).eq('status', 'concluido')
      // SÓ por cliente_id (ref estável → idempotência confiável; nome muda com typo/rename).
      const ultima = new Map<string, { data: string; nome: string }>()
      for (const a of ags ?? []) {
        if (!a.cliente_id || !a.data) continue
        const cur = ultima.get(a.cliente_id)
        if (!cur || a.data > cur.data) ultima.set(a.cliente_id, { data: a.data.slice(0, 10), nome: a.cliente_nome ?? 'Cliente' })
      }
      for (const [cid, u] of ultima) {
        if (u.data !== alvo) continue
        candidatos.push({ tipo: 'retorno_inativo', cliente_id: cid, cliente_nome: u.nome, telefone: normPhone(telById.get(cid) ?? null), mensagem: compose(r.template, 'retorno_inativo', u.nome), ref: `retorno_inativo:${cid}:${hoje}` })
      }
    }

    // Idempotência: tira os que já foram enviados (ref já no log com status='sent').
    const refs = candidatos.map((c) => c.ref)
    const jaEnviados = new Set<string>()
    if (refs.length) {
      const { data: logs } = await admin.from('salon_automation_log')
        .select('ref').eq('organization_id', orgId).eq('status', 'sent').in('ref', refs)
      for (const l of logs ?? []) jaEnviados.add(l.ref)
    }
    const pendentes = candidatos.filter((c) => !jaEnviados.has(c.ref))

    let enviados = 0, falhas = 0
    const pulados = jaEnviados.size
    if (!dryRun) {
      for (const ev of pendentes) {
        if (!ev.telefone) { // sem telefone (ou ambíguo) → registra skip, não envia
          falhas += 1
          await logSafe({ organization_id: orgId, tipo: ev.tipo, cliente_id: ev.cliente_id, cliente_nome: ev.cliente_nome, telefone: null, mensagem: ev.mensagem, ref: ev.ref, status: 'skipped' })
          continue
        }
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_ROLE}` },
            body: JSON.stringify({ organization_id: orgId, type: 'text', to: ev.telefone, payload: { text: ev.mensagem } }),
          })
          const ok = resp.ok
          await logSafe({ organization_id: orgId, tipo: ev.tipo, cliente_id: ev.cliente_id, cliente_nome: ev.cliente_nome, telefone: ev.telefone, mensagem: ev.mensagem, ref: ev.ref, status: ok ? 'sent' : 'failed' })
          ok ? enviados++ : falhas++
          await new Promise((r) => setTimeout(r, 1500)) // throttle anti-spam
        } catch (_e) {
          falhas += 1
          await logSafe({ organization_id: orgId, tipo: ev.tipo, cliente_id: ev.cliente_id, cliente_nome: ev.cliente_nome, telefone: ev.telefone, mensagem: ev.mensagem, ref: ev.ref, status: 'failed' })
        }
      }
    }

    resultadoOrgs[orgId] = { detectados: candidatos.length, enviados, falhas, pulados, eventos: pendentes }
  }

  return new Response(JSON.stringify({ dry_run: dryRun, hoje, orgs: porOrg.size, resultado: resultadoOrgs }, null, 2), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
