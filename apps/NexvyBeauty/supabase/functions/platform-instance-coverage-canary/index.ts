// ─── platform-instance-coverage-canary ──────────────────────────────────────
//
// VIGIA AS DUAS TABELAS DE INSTÂNCIA. Existe porque, em 2026-08-07, a instância
// `prospeccao-ativa-camila` caiu às 20:18 do dia 06 e ninguém foi avisado — o
// Marcelo descobriu porque perguntou.
//
// Não foi um alerta que falhou: foi um alerta que nunca olhou. O
// `whatsapp-health-alert` lê `evolution_instances` (tenant); a instância da
// prospecção vive em `platform_crm_evolution_instances` (plataforma). Duas
// tabelas, um vigia.
//
// Medido no mesmo dia: SETE edge functions leem a tabela da plataforma para
// trabalhar; ZERO a vigiam.
//
// ── RELAÇÃO COM O whatsapp-health-alert ────────────────────────────────────
// Este canário NÃO substitui nem duplica aquele. Os dois compartilham a mesma
// marca no dado (`metadata.health_alert_at`) e o mesmo silenciador
// (`metadata.health_mute`), então nunca alertam sobre a MESMA queda: quem chegar
// primeiro carimba, o outro se cala. O contrato vive no DADO, não num acoplamento
// entre funções — nenhuma das duas precisa saber que a outra existe.
//
// A decisão de alertar é do módulo PURO `_shared/instance-coverage.ts`
// (14 testes). Aqui só há I/O.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendTelegramAlert } from '../_shared/platform-alerts.ts'
import {
  avaliarCobertura,
  type InstanciaVigiada,
  textoDoAlerta,
} from '../_shared/instance-coverage.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** As duas tabelas e de que lado cada uma está. Acrescentar aqui é o ponto de extensão. */
const FONTES: Array<{ tabela: string; origem: InstanciaVigiada['origem'] }> = [
  { tabela: 'evolution_instances', origem: 'tenant' },
  { tabela: 'platform_crm_evolution_instances', origem: 'plataforma' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Mesmo gate do health-alert: valida a CLAIM `role`, não a string da chave —
  // o projeto tem chave legada e nova ao mesmo tempo, e comparar string acopla
  // a função ao formato dela.
  const auth = req.headers.get('authorization') ?? ''
  const tk = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  let papel = ''
  if (tk === SERVICE_ROLE) papel = 'service_role'
  else {
    try {
      const p = (tk.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
      papel = JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)))?.role ?? ''
    } catch { papel = '' }
  }
  if (papel !== 'service_role') return json({ error: 'nao_autorizado' }, 401)

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const instancias: InstanciaVigiada[] = []
  const falhas: string[] = []

  for (const f of FONTES) {
    const { data, error } = await db
      .from(f.tabela)
      .select('id, name, status, last_connected_at, metadata')
    if (error) {
      // Uma fonte ilegível NÃO pode virar "não há instâncias aqui" — esse é
      // exatamente o silêncio que o canário existe para combater. Registra a
      // falha, segue com as outras, e o relatório denuncia a lacuna.
      falhas.push(`${f.tabela}: ${error.message}`)
      console.error('[coverage-canary] FONTE ILEGÍVEL — cobertura INCOMPLETA neste tick', {
        tabela: f.tabela, erro: error.message,
      })
      continue
    }
    for (const r of data ?? []) {
      instancias.push({
        id: r.id as string,
        name: (r.name as string) ?? '(sem nome)',
        status: (r.status as string) ?? '',
        last_connected_at: (r.last_connected_at as string) ?? null,
        origem: f.origem,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      })
    }
  }

  const { aAlertar, todos } = avaliarCobertura(instancias, Date.now())

  for (const v of aAlertar) {
    await sendTelegramAlert(textoDoAlerta(v))
    // Carimba a MESMA marca que o health-alert usa, na tabela de origem.
    const tabela = v.instancia.origem === 'tenant'
      ? 'evolution_instances'
      : 'platform_crm_evolution_instances'
    await db.from(tabela)
      .update({ metadata: { ...(v.instancia.metadata ?? {}), health_alert_at: new Date().toISOString() } })
      .eq('id', v.instancia.id)
  }

  return json({
    ok: true,
    // `fontes_ilegiveis` não-vazio significa que este tick NÃO cobriu tudo.
    // Sem esse campo, um relatório de zero alertas seria indistinguível de
    // "não consegui olhar".
    fontes_ilegiveis: falhas,
    instancias: instancias.length,
    alertadas: aAlertar.length,
    detalhe: aAlertar.map((v) => ({ nome: v.instancia.name, lado: v.instancia.origem })),
    por_motivo: todos.reduce<Record<string, number>>((acc, v) => {
      acc[v.motivo] = (acc[v.motivo] ?? 0) + 1
      return acc
    }, {}),
  })
})
