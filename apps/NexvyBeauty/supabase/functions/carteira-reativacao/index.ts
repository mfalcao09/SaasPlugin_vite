// ─── carteira-reativacao — SUB3 do agente de carteira ────────────────────────
//
// Responde UMA pergunta por cliente: "esta cliente sumiu — o que eu mando pra ela
// voltar?". Gera a mensagem com LLM (personalizada com nome, tempo sumida e último
// serviço) e MATERIALIZA em `carteira_acoes_propostas`.
//
// POR QUE MATERIALIZAR (decisão Marcelo, 2026-07-30 — opção "b"): a tela de Ações
// precisa abrir CHEIA. Gerar sob demanda no clique adicionaria 1-2s de espera; o cron
// das 04h (BR) roda de madrugada e a dona encontra a fila pronta ao abrir o painel.
//
// QUEM ENTRA: cliente com agendamento concluído antigo OU — e isto é o diferencial —
// quem só existe no WhatsApp (ultima_interacao_wa), classificado pelo SUB2. Contato
// `pessoal` NUNCA entra: não se manda "que saudade, bora marcar?" pra mãe da dona
// nem pro fornecedor.
//
// FALLBACK: se o LLM falhar, grava a mensagem-template (gerado_por='template'). A fila
// nunca fica vazia por causa de indisponibilidade de IA.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiChat } from '../_shared/ai-call.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const INATIVO_DIAS = 45        // espelha INATIVO_DIAS do cockpit/levers.ts
const LOTE_PADRAO = 30
const TETO_LOTE = 100

/** Prompt do SUB3 — validado por Marcelo em 2026-07-30 (1-3 emojis, tipicamente 2). */
const PROMPT = `Você é a voz de um ESPAÇO DE BELEZA brasileiro (salão, studio, clínica,
nail designer, barbearia) escrevendo UMA mensagem de WhatsApp para reconquistar uma
cliente que sumiu. Calorosa e natural, como a própria dona escreveria — nunca robótica,
nunca corporativa, nunca com cara de disparo em massa.

REGRAS
1. No máximo 2 ou 3 frases curtas.
2. Trate pelo PRIMEIRO NOME.
3. Se houver último serviço ou histórico, CITE de forma natural
   ("faz um tempinho desde sua última escova...").
4. Faça UM convite claro para marcar horário.
5. NUNCA invente promoção, brinde, desconto, preço ou horário. Se não te deram, não existe.
6. Emoji: de 1 a 3, tipicamente 2. Nunca comece a mensagem com emoji.
7. Se o motivo for aniversário, parabenize primeiro.
8. Adapte o tom: com mulher, acolhedor e próximo; com homem, simpático porém mais direto
   (sem apelido carinhoso nem diminutivo). Na dúvida, cordial e neutro.
9. Português brasileiro, linguagem de WhatsApp.

Devolva SOMENTE o texto da mensagem, sem aspas e sem explicação.`

/** Fallback determinístico (espelha leverMessage de src/cockpit/levers.ts). */
function mensagemTemplate(tipo: string, nome: string): string {
  const p = (nome || 'cliente').trim().split(/\s+/)[0]
  const M: Record<string, string> = {
    reativar: `Oi ${p}! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana?`,
    pacote: `Oi ${p}! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? 😉`,
    upsell: `Oi ${p}! Tenho uma novidade que combina super com você 💁 Quer que eu te conte?`,
    aniversario: `Oi ${p}! 🎉 Feliz aniversário! Que tal comemorar com um horário especial?`,
  }
  return M[tipo] ?? `Oi ${p}! Que tal marcar um horário essa semana? 💕`
}

interface Alvo {
  cliente_id: string
  nome: string
  telefone: string | null
  dias: number
  tipo: 'reativar' | 'aniversario'
  motivo: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Auth: service_role apenas (mesmo gate do carteira-classify) — é chamada de cron.
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
  const body = await req.json().catch(() => ({}))
  const orgId = body?.organization_id as string | undefined
  const lote = Math.min(Number(body?.lote ?? LOTE_PADRAO) || LOTE_PADRAO, TETO_LOTE)
  if (!orgId) return json({ error: 'organization_id obrigatorio' }, 400)

  // ── 1) Quem entra na fila ───────────────────────────────────────────────────
  // Carteira real (carteira_estado='principal'), NUNCA 'pessoal' (proteção SUB2).
  const { data: clientes, error: errCli } = await db
    .from('clientes')
    .select('id, nome, telefone, data_nascimento, ultima_interacao_wa, tipo_contato')
    .eq('organization_id', orgId)
    .eq('carteira_estado', 'principal')
    .neq('tipo_contato', 'pessoal')
    .not('ultima_interacao_wa', 'is', null)
    .order('ultima_interacao_wa', { ascending: true })
    .limit(lote * 3)
  if (errCli) return json({ error: errCli.message }, 500)

  const hoje = new Date()
  const mesAtual = hoje.getMonth()
  const alvos: Alvo[] = []

  for (const c of clientes ?? []) {
    if (alvos.length >= lote) break
    const nome = (c.nome ?? '').trim()
    if (!nome) continue

    const ultima = c.ultima_interacao_wa ? new Date(c.ultima_interacao_wa) : null
    const dias = ultima ? Math.floor((hoje.getTime() - ultima.getTime()) / 86_400_000) : 0

    // Aniversário do mês tem precedência (é o gancho mais forte).
    const nasc = c.data_nascimento ? new Date(c.data_nascimento) : null
    if (nasc && !isNaN(nasc.getTime()) && nasc.getUTCMonth() === mesAtual) {
      alvos.push({
        cliente_id: c.id, nome, telefone: c.telefone, dias,
        tipo: 'aniversario', motivo: 'Faz aniversário este mês',
      })
      continue
    }
    if (dias > INATIVO_DIAS) {
      alvos.push({
        cliente_id: c.id, nome, telefone: c.telefone, dias,
        tipo: 'reativar', motivo: `Sem contato há ${dias} dias`,
      })
    }
  }

  if (alvos.length === 0) return json({ ok: true, gerados: 0, motivo: 'nenhum alvo' })

  // ── 2) Último serviço (personaliza a mensagem) ──────────────────────────────
  const ids = alvos.map((a) => a.cliente_id)
  const { data: ags } = await db
    .from('agendamentos')
    .select('cliente_id, servico_nome, data')
    .eq('organization_id', orgId)
    .in('cliente_id', ids)
    .eq('status', 'concluido')
    .order('data', { ascending: false })
  const ultimoServico = new Map<string, string>()
  for (const a of ags ?? []) {
    if (a.cliente_id && a.servico_nome && !ultimoServico.has(a.cliente_id)) {
      ultimoServico.set(a.cliente_id, a.servico_nome)
    }
  }

  // ── 3) Gera e materializa ───────────────────────────────────────────────────
  let gerados = 0, viaLlm = 0, viaTemplate = 0
  for (const alvo of alvos) {
    const servico = ultimoServico.get(alvo.cliente_id) ?? null
    let mensagem = ''
    let geradoPor = 'llm'

    const contexto = [
      `Primeiro nome: ${alvo.nome.split(/\s+/)[0]}`,
      `Sem contato há: ${alvo.dias} dias`,
      `Último serviço: ${servico ?? 'não registrado'}`,
      `Motivo da ação: ${alvo.tipo === 'aniversario' ? 'aniversário este mês' : 'cliente sumida'}`,
    ].join('\n')

    try {
      const { response } = await aiChat({
        supabase: db,
        organizationId: orgId,
        capability: 'analysis_insights',
        label: 'carteira-reativacao',
        body: {
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: contexto },
          ],
          // Mensagem quer variedade (≠ classificação, que roda em 0).
          temperature: 0.8,
          max_tokens: 200,
        },
      })
      const data = await response.json().catch(() => null)
      mensagem = (data?.choices?.[0]?.message?.content ?? '').trim()
    } catch (e) {
      console.warn('[carteira-reativacao] LLM falhou, usando template:', (e as Error)?.message)
    }

    if (!mensagem) {
      mensagem = mensagemTemplate(alvo.tipo, alvo.nome)
      geradoPor = 'template'
      viaTemplate++
    } else {
      viaLlm++
    }

    const urgencia = alvo.tipo === 'aniversario' ? 120 : Math.min(alvo.dias, 365) / 10 + 50

    const { error: upErr } = await db.from('carteira_acoes_propostas').upsert({
      organization_id: orgId,
      cliente_id: alvo.cliente_id,
      cliente_nome: alvo.nome,
      telefone: alvo.telefone,
      tipo: alvo.tipo,
      motivo: alvo.motivo,
      mensagem,
      dias_sem_voltar: alvo.dias,
      origem: servico ? 'agendamento' : 'whatsapp',
      gerado_por: geradoPor,
      urgencia,
      status: 'pendente',
      gerado_em: new Date().toISOString(),
    }, { onConflict: 'organization_id,cliente_id,tipo', ignoreDuplicates: false })

    if (upErr) console.warn('[carteira-reativacao] upsert falhou:', upErr.message)
    else gerados++
  }

  return json({ ok: true, gerados, via_llm: viaLlm, via_template: viaTemplate })
})
