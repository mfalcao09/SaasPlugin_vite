// ─── carteira-classify — o Eixo 3: o agente lê a conversa (B4 / Fase 4) ──────
//
// Responde UMA pergunta por contato: esta conversa é do dia-a-dia de venda/produto/
// salão, ou é pessoal? A resposta vira tag em `tipo_contato` e evidência em
// `sinais_wa`.
//
// POR QUE JANELA E NÃO A CONVERSA INTEIRA: medido na carga do legado, um único
// contato tem 37.848 mensagens — 46% de toda a conversa da carteira. Ler tudo é caro
// e desnecessário: o ASSUNTO de uma relação é estável. As mensagens mais ANTIGAS
// dizem como a relação começou (cliente de salão quase sempre começa perguntando
// preço ou horário); as mais RECENTES dizem no que ela virou. 20 + 20 decide
// praticamente tão bem quanto 4.000, por uma fração do custo.
//
// A PRECEDÊNCIA NÃO MORA AQUI. Quem aplica é a RPC `carteira_classificar_aplicar`:
// decisão humana > transação > agente. Se vivesse neste arquivo, dependeria de o
// chamador lembrar — e a regra existe justamente para proteger o cliente real de um
// agente que errou.
//
// EVIDÊNCIA É OBRIGATÓRIA no retorno. A análise de carteira é vendida; quando a dona
// perguntar "por que essa é pessoal?", "em 3 anos nunca citou serviço" é produto e
// um rótulo pelado é passivo.

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

const VERSAO = 'v1'
const JANELA_PONTAS = 20      // 20 mais antigas + 20 mais recentes
const TETO_CHARS = 6000       // corta conversa gigante sem estourar o contexto
const LOTE_PADRAO = 10

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assunto', 'confianca', 'evidencias', 'sinais'],
  properties: {
    assunto: { type: 'string', enum: ['salao', 'pessoal', 'misto', 'indefinido'] },
    confianca: { type: 'number', minimum: 0, maximum: 1 },
    evidencias: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    sinais: {
      type: 'object',
      additionalProperties: false,
      required: ['pediu_horario', 'perguntou_preco', 'servicos_citados'],
      properties: {
        pediu_horario: { type: 'boolean' },
        perguntou_preco: { type: 'boolean' },
        servicos_citados: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

const PROMPT = `Você classifica conversas de WhatsApp de um SALÃO DE BELEZA brasileiro.

Decida o ASSUNTO da relação:
- "salao": trata do dia-a-dia de venda/produto/salão — agendar, remarcar, preço, serviço
  (cabelo, unha, sobrancelha, depilação, estética), pagamento, endereço, horário.
- "pessoal": assunto de vida pessoal — família, religião, política, corrente, bom dia,
  fofoca, saúde, filhos. NÃO fala do salão como negócio.
- "misto": tem os dois de verdade. Uma parente ou amiga que TAMBÉM marca horário é
  "misto", não "pessoal".
- "indefinido": pouca mensagem ou conteúdo insuficiente para afirmar.

REGRAS
1. Na dúvida entre salao e pessoal, responda "misto". Na falta de evidência, "indefinido".
2. Prefira errar para "misto"/"indefinido" a errar para "pessoal": marcar cliente real
   como pessoal a tira das campanhas do salão, e isso custa receita.
3. "evidencias" deve citar o que você VIU na conversa, curto e concreto. Nunca invente.
4. Responda SOMENTE o JSON do schema.`

interface Msg { content: string | null; direction: string; created_at: string }

/** Janela: as N mais antigas + as N mais recentes, com teto de caracteres. */
function montarJanela(antigas: Msg[], recentes: Msg[]): { texto: string; usadas: number } {
  const linha = (m: Msg) =>
    `${m.direction === 'inbound' ? 'CLIENTE' : 'SALAO'}: ${(m.content ?? '').replace(/\s+/g, ' ').slice(0, 300)}`
  const partes: string[] = []
  if (antigas.length) partes.push('--- INÍCIO DA RELAÇÃO ---', ...antigas.map(linha))
  if (recentes.length) partes.push('--- MENSAGENS RECENTES ---', ...recentes.map(linha))
  let texto = partes.join('\n')
  if (texto.length > TETO_CHARS) texto = texto.slice(0, TETO_CHARS) + '\n[...cortado...]'
  return { texto, usadas: antigas.length + recentes.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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

  let body: { organization_id?: string; lote?: number; cliente_id?: string } = {}
  try { body = await req.json() } catch { /* vazio */ }
  const orgId = body.organization_id
  if (!orgId) return json({ error: 'organization_id_obrigatorio' }, 400)
  const lote = Math.min(Math.max(Number(body.lote) || LOTE_PADRAO, 1), 25)

  // Fila em SQL: "cliente que TEM conversa" é a definição dela. Montar isso aqui,
  // com duas queries, já custou um lote inteiro de chamadas desperdiçadas — a versão
  // anterior pescava também os 80.982 da lixeira, que nunca trocaram mensagem.
  const { data: alvos, error: eFila } = await db.rpc('carteira_fila_classificacao', {
    p_organization_id: orgId, p_limite: lote,
  })
  if (eFila) return json({ error: 'falha_fila', detalhe: eFila.message }, 500)
  if (!alvos?.length) return json({ ok: true, avaliados: 0, aviso: 'fila vazia' })

  const resultado: Record<string, number> = {}
  let semConversa = 0, erros = 0
  const amostra: any[] = []
  let ultimoErro: string | null = null

  for (const c of alvos) {
    try {
      const convId = c.conversation_id as string
      if (!convId) { semConversa++; continue }

      // Duas pontas: o começo diz como a relação nasceu, o fim diz no que virou.
      const [{ data: antigas }, { data: recentesDesc }] = await Promise.all([
        db.from('webchat_messages').select('content, direction, created_at')
          .eq('conversation_id', convId).neq('content', '')
          .order('created_at', { ascending: true }).limit(JANELA_PONTAS),
        db.from('webchat_messages').select('content, direction, created_at')
          .eq('conversation_id', convId).neq('content', '')
          .order('created_at', { ascending: false }).limit(JANELA_PONTAS),
      ])
      const recentes = (recentesDesc ?? []).slice().reverse()
      if (!antigas?.length && !recentes.length) { semConversa++; continue }

      const { texto, usadas } = montarJanela(antigas ?? [], recentes)

      const { response } = await aiChat({
        supabase: db,
        organizationId: orgId,
        capability: 'analysis_insights',
        label: 'carteira-classify',
        body: {
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: texto },
          ],
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'classificacao_carteira', strict: true, schema: SCHEMA },
          },
        },
      })

      if (!response.ok) throw new Error(`ai ${response.status}: ${(await response.text()).slice(0, 160)}`)
      const out = await response.json()
      const cru = out?.choices?.[0]?.message?.content
      const dec = typeof cru === 'string' ? JSON.parse(cru) : cru
      if (!dec?.assunto) throw new Error('resposta sem assunto')

      const sinais = {
        assunto: dec.assunto,
        confianca: dec.confianca ?? null,
        versao: VERSAO,
        evidencias: dec.evidencias ?? [],
        sinais: dec.sinais ?? {},
        janela: {
          msgs_lidas: usadas,
          de: antigas?.[0]?.created_at ?? null,
          ate: recentes[recentes.length - 1]?.created_at ?? null,
        },
      }

      // A precedência (humano > transação > agente) é aplicada pela RPC.
      const { data: efeito } = await db.rpc('carteira_classificar_aplicar', {
        p_cliente_id: c.cliente_id, p_assunto: dec.assunto, p_sinais: sinais,
      })

      const chave = `${dec.assunto}/${efeito ?? 'sem_retorno'}`
      resultado[chave] = (resultado[chave] ?? 0) + 1
      if (amostra.length < 3) amostra.push({ assunto: dec.assunto, efeito, evidencias: dec.evidencias })
    } catch (e) {
      erros++
      ultimoErro = String((e as Error)?.message ?? e).slice(0, 220)
    }
  }

  return json({
    ok: true, versao: VERSAO, avaliados: alvos.length, resultado,
    sem_conversa: semConversa, erros, ultimo_erro: ultimoErro, amostra,
  })
})
