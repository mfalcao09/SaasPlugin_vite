// ─── whatsapp-health-alert — avisa quando a instância cai (B9 / A7) ──────────
//
// O PROBLEMA QUE RESOLVE: quando o WhatsApp de um salão desconecta, ninguém fica
// sabendo. A dona descobre porque as clientes pararam de responder — às vezes dias
// depois. `meuteste1-sal-o1` está desconectada desde 21/07 03:28 e nenhum alerta saiu.
//
// THROTTLE NO BANCO, NÃO EM MEMÓRIA: `sendTelegramAlertThrottled` do
// _shared/platform-alerts.ts guarda o estado num Map de processo. Cron cria isolate
// novo a cada tick, então esse Map nasce vazio toda vez e o alerta sairia a cada 5
// minutos — vira ruído, e ruído treina a pessoa a ignorar o canal. Aqui a marca vive
// em `evolution_instances.metadata.health_alert_at`.
//
// REARME: quando a instância volta a 'connected', a marca é apagada. Assim uma queda
// futura alerta de novo — sem isso, o primeiro alerta seria o único para sempre.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendTelegramAlert } from '../_shared/platform-alerts.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Só realerta depois disto — evita repetir o mesmo aviso a cada tick do cron. */
const REALERTA_HORAS = 6

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Valida a CLAIM `role` do JWT, não a string da chave: o projeto tem chave legada
  // e chave nova ao mesmo tempo, e comparar string acopla a função ao formato dela.
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

  const { data: instancias, error } = await db
    .from('evolution_instances')
    .select('id, name, status, last_connected_at, organization_id, metadata')
  if (error) return json({ error: 'falha_leitura', detalhe: error.message }, 500)

  const agora = Date.now()
  let alertadas = 0, rearmadas = 0, silenciadas = 0
  const detalhe: string[] = []

  for (const inst of instancias ?? []) {
    const meta = (inst.metadata ?? {}) as Record<string, unknown>
    const marcaAnterior = typeof meta.health_alert_at === 'string' ? meta.health_alert_at : null
    const caida = inst.status !== 'connected'

    // Voltou ao ar: apaga a marca para que a PRÓXIMA queda volte a alertar.
    if (!caida) {
      if (marcaAnterior) {
        const { health_alert_at: _descartado, ...resto } = meta
        await db.from('evolution_instances').update({ metadata: resto }).eq('id', inst.id)
        rearmadas++
      }
      continue
    }

    // Caída, mas já avisamos há pouco: cala a boca.
    if (marcaAnterior && agora - Date.parse(marcaAnterior) < REALERTA_HORAS * 3600_000) {
      silenciadas++
      continue
    }

    const desde = inst.last_connected_at
      ? `desde ${new Date(inst.last_connected_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      : 'sem registro de última conexão'

    await sendTelegramAlert(
      `🔴 WhatsApp DESCONECTADO\n` +
      `Instância: ${inst.name}\n` +
      `Status: ${inst.status}\n` +
      `Fora do ar ${desde}\n\n` +
      `Enquanto isso: mensagem de cliente não entra e automação não sai.\n` +
      `Reconectar em Conexões → ler o QR.`,
    )

    await db.from('evolution_instances')
      .update({ metadata: { ...meta, health_alert_at: new Date(agora).toISOString() } })
      .eq('id', inst.id)

    alertadas++
    detalhe.push(inst.name)
  }

  return json({
    ok: true,
    instancias: instancias?.length ?? 0,
    alertadas, rearmadas, silenciadas, detalhe,
  })
})
