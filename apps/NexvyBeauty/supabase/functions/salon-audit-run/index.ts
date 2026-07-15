// ─── salon-audit-run — Auditor de Cadastro (metade A do Agente de Carteira) ────
// Varre a base de clientes por-org e ANOTA o que falta (data_nascimento, endereço,
// email) na tabela salon_client_field_requests. Idempotente: 1 pendência viva por
// (cliente, campo) — não repergunta o mesmo, não reabre answered/declined.
//
// GUARDA de ambiguidade: cliente sem telefone válido OU com telefone compartilhado
// (homônimo prático) → status='unreachable' (nunca vira alvo de pergunta, porque a
// resposta inbound não daria pra atribuir a um cliente só).
//
// SELF-HEAL: pendência aberta cujo campo JÁ foi preenchido por outra via (form
// manual) → 'skipped'. Não perguntamos o que o salão já tem.
//
// SEGURANÇA: só o cron (x-cron-secret via verify_salon_cron) ou o service_role
// ESCREVE. Chamada não-cron = dry-run (detecta e devolve, sem gravar).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildPhoneCount, classifyCliente, type ClienteRow } from './detect.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLIENTE_COLS = 'id, nome, telefone, data_nascimento, email, cpf_cnpj, cep, logradouro, endereco, marketing_opt_out'

interface OrgResult {
  clientes: number
  reachable: number
  unreachable: number
  pending_criadas: number
  unreachable_criadas: number
  auto_resolvidas: number
  por_campo: Record<string, number>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  const auth = req.headers.get('authorization') ?? ''
  let isCron = auth === `Bearer ${SERVICE_ROLE}`
  const cronSecret = req.headers.get('x-cron-secret')
  if (!isCron && cronSecret) {
    const { data: ok } = await admin.rpc('verify_salon_cron', { p_secret: cronSecret })
    isCron = ok === true
  }

  const body = await req.json().catch(() => ({}))
  const onlyOrg: string | null = body.organization_id ?? null
  let dryRun: boolean = body.dry_run !== false // default seguro
  if (!isCron) dryRun = true // não-cron NUNCA grava (RLS não deixaria mesmo)

  // READS: cron usa admin; não-cron usa o JWT do usuário (RLS → só a própria org).
  const db = isCron ? admin : createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })

  // Descobre as orgs a varrer. Sem org específica (cron global): distinct de clientes.
  let orgIds: string[] = []
  if (onlyOrg) {
    orgIds = [onlyOrg]
  } else {
    const { data: orgs } = await db.from('clientes').select('organization_id')
    orgIds = Array.from(new Set((orgs ?? []).map((o: { organization_id: string }) => o.organization_id).filter(Boolean)))
  }

  const resultado: Record<string, OrgResult> = {}

  for (const orgId of orgIds) {
    const { data: clientesRaw } = await db.from('clientes').select(CLIENTE_COLS).eq('organization_id', orgId)
    const clientes = (clientesRaw ?? []) as ClienteRow[]
    const phoneCount = buildPhoneCount(clientes)
    const cliById = new Map(clientes.map((c) => [c.id, c]))

    // Pendências que já existem (qualquer status) → idempotência sem depender só do índice.
    const { data: existing } = await db.from('salon_client_field_requests')
      .select('id, cliente_id, campo, status').eq('organization_id', orgId)
    const existentes = new Set((existing ?? []).map((r: { cliente_id: string; campo: string }) => `${r.cliente_id}:${r.campo}`))

    const pendingRows: Array<Record<string, unknown>> = []
    const unreachableRows: Array<Record<string, unknown>> = []
    const porCampo: Record<string, number> = {}
    let reachable = 0, unreachable = 0

    for (const c of clientes) {
      const cls = classifyCliente(c, phoneCount)
      if (cls.reachable) reachable++; else unreachable++
      for (const campo of cls.missing) {
        if (existentes.has(`${c.id}:${campo}`)) continue // já anotado
        const row = {
          organization_id: orgId, cliente_id: c.id, campo,
          status: cls.reachable ? 'pending' : 'unreachable',
          last_channel: 'whatsapp',
        }
        if (cls.reachable) { pendingRows.push(row); porCampo[campo] = (porCampo[campo] ?? 0) + 1 }
        else unreachableRows.push(row)
      }
    }

    // SELF-HEAL: pendências abertas cujo campo já foi preenchido → 'skipped'.
    const paraResolver: string[] = []
    for (const r of (existing ?? []) as Array<{ id: string; cliente_id: string; campo: string; status: string }>) {
      if (r.status !== 'pending' && r.status !== 'asked') continue
      const c = cliById.get(r.cliente_id)
      if (c && hasCampoLive(c, r.campo)) paraResolver.push(r.id)
    }

    if (!dryRun) {
      if (pendingRows.length) {
        await admin.from('salon_client_field_requests')
          .upsert(pendingRows, { onConflict: 'organization_id,cliente_id,campo', ignoreDuplicates: true })
      }
      if (unreachableRows.length) {
        await admin.from('salon_client_field_requests')
          .upsert(unreachableRows, { onConflict: 'organization_id,cliente_id,campo', ignoreDuplicates: true })
      }
      if (paraResolver.length) {
        await admin.from('salon_client_field_requests')
          .update({ status: 'skipped', updated_at: new Date().toISOString() }).in('id', paraResolver)
      }
    }

    resultado[orgId] = {
      clientes: clientes.length, reachable, unreachable,
      pending_criadas: pendingRows.length,
      unreachable_criadas: unreachableRows.length,
      auto_resolvidas: paraResolver.length,
      por_campo: porCampo,
    }
  }

  return new Response(JSON.stringify({ dry_run: dryRun, orgs: orgIds.length, resultado }, null, 2), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

// Espelha detect.hasCampo sem reimportar a linha inteira (campo vem como string do DB).
function hasCampoLive(c: ClienteRow, campo: string): boolean {
  const has = (s: string | null | undefined) => !!(s && String(s).trim())
  if (campo === 'endereco') return has(c.cep) || has(c.logradouro) || has(c.endereco)
  return has((c as unknown as Record<string, string | null>)[campo])
}
