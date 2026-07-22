// ─── carteira-import-legacy — carga do histórico do WhatsApp (B4 / Fase 1) ────
//
// POR QUE ESTA FUNÇÃO EXISTE: `evolution-history-sync` recebe MESSAGES_SET pelo
// webhook mas extrai só telefone, pushName e timestamp — o CORPO da mensagem é
// descartado (grep por `extendedTextMessage` naquele arquivo: 0 ocorrências).
// Resultado: 84.194 contatos importados e zero conversa guardada, e o classificador
// de carteira (Eixo 3) não tinha o que ler.
//
// A Fase 0 provou que o histórico está no Postgres do Evolution e que a API
// `chat/findMessages` o serve sob demanda, com filtro por `key.remoteJid`. Então a
// carga é PUXADA, não esperada: repetível, reversível e sem depender de reconexão
// da instância. Foi isto que eliminou a fase de re-sync do plano.
//
// DESENHO — itera CONTATO a contato, não página global:
//   · chunking natural dentro do limite de tempo da edge function
//   · resumível no ponto exato onde parou (fila em carteira_import_jobs)
//   · progresso legível: "faltam N contatos", não "faltam N páginas"
//
// O EIXO 1 (forma) é aplicado em SQL, na RPC `carteira_import_enfileirar` — grupo,
// LID e não-BR entram como `ignorado` COM motivo, nunca silenciosamente pulados.
// Aqui não há regra de telefone nenhuma: uma segunda implementação de
// normalize_phone_br em TS divergiria com o tempo.
//
// SEGURANÇA: fora do config.toml de propósito → o gateway exige JWT (default, que
// verifica a assinatura) e a função ainda exige a claim `role = service_role`. Não há
// caminho anônimo.

import { createClient } from 'jsr:@supabase/supabase-js@2'
// A config do Evolution Go NÃO vem de env var: `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`
// não existem como secret neste projeto (as 4 funções que as leem estão lendo vazio).
// A fonte única é `platform_settings`, resolvida por este helper — que existe
// justamente para código novo importar em vez de criar mais uma cópia privada.
import { getPlatformConfig, evoFetch } from '../_shared/evolution-core.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Página do Evolution: `offset` é o TAMANHO da página (não o deslocamento — o nome
// engana), `page` é o número. Medido na Fase 0: 1.000 registros em ~318 ms.
const PAGINA = 1000

// Quantos contatos por invocação. 20 × ~250 msgs cabe folgado no limite de tempo.
const LOTE_PADRAO = 20

interface EvoMsg {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean }
  message?: { conversation?: string; extendedTextMessage?: { text?: string } }
  messageType?: string
  messageTimestamp?: number | string
  pushName?: string
}

/** Evolution devolve `messageType` do Baileys; a coluna aceita 4 valores. */
function contentType(t?: string): 'text' | 'image' | 'file' | 'audio' {
  if (!t) return 'text'
  if (t.startsWith('image')) return 'image'
  if (t.startsWith('audio') || t.startsWith('ptt')) return 'audio'
  if (t.startsWith('document') || t.startsWith('video') || t.startsWith('sticker')) return 'file'
  return 'text'
}

function textoDe(m: EvoMsg): string {
  return m.message?.conversation || m.message?.extendedTextMessage?.text || ''
}

function tsIso(t?: number | string): string {
  const n = Number(t)
  // Evolution manda segundos; alguns eventos mandam milissegundos.
  if (!Number.isFinite(n) || n <= 0) return new Date(0).toISOString()
  return new Date(n > 1e12 ? n : n * 1000).toISOString()
}

/** POST no Evolution via o helper compartilhado (config vem de platform_settings). */
async function evoPost(cfg: any, path: string, body: unknown, token?: string): Promise<any> {
  const r = await evoFetch(cfg, path, { method: 'POST', body: JSON.stringify(body) }, token)
  if (!r.ok) throw new Error(`evolution ${path} -> ${r.status}${r.message ? ': ' + r.message : ''}`)
  return r.body
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Só service_role. Valida a CLAIM `role` do JWT, não a string da chave: o projeto
  // pode ter chave legada e chave nova ao mesmo tempo, e comparar string acopla a
  // função ao formato dela. A assinatura já foi verificada pelo gateway (esta função
  // fica fora do config.toml justamente para o verify_jwt padrão valer).
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  let papel = ''
  if (token === SERVICE_ROLE) {
    papel = 'service_role'
  } else {
    try {
      const p = token.split('.')[1] ?? ''
      const pad = p.replace(/-/g, '+').replace(/_/g, '/')
      papel = JSON.parse(atob(pad + '='.repeat((4 - (pad.length % 4)) % 4)))?.role ?? ''
    } catch { papel = '' }
  }
  if (papel !== 'service_role') return json({ error: 'nao_autorizado' }, 401)

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const cfg = await getPlatformConfig(db)
  if (!cfg) return json({ error: 'evolution_nao_configurado_em_platform_settings' }, 500)

  let body: { instance?: string; action?: string; lote?: number } = {}
  try { body = await req.json() } catch { /* corpo vazio = status */ }
  const instance = body.instance
  const action = body.action ?? 'status'
  if (!instance) return json({ error: 'instance_obrigatorio' }, 400)

  // Resolve a org pela instância — mesma busca por nome do history-sync.
  const SEL = 'id, name, instance_id, organization_id, instance_token, metadata'
  const { data: instRows } = await db.from('evolution_instances').select(SEL).eq('name', instance).limit(1)
  const inst = instRows?.[0]
  if (!inst?.organization_id) return json({ error: 'instancia_nao_encontrada', instance }, 404)
  const orgId = inst.organization_id as string

  const contarFila = async () => {
    const { data } = await db.from('carteira_import_jobs')
      .select('status, mensagens_importadas')
      .eq('organization_id', orgId).eq('instance_name', instance)
    const rows = data ?? []
    return {
      total: rows.length,
      pendente: rows.filter((r) => r.status === 'pendente').length,
      feito: rows.filter((r) => r.status === 'feito').length,
      ignorado: rows.filter((r) => r.status === 'ignorado').length,
      erro: rows.filter((r) => r.status === 'erro').length,
      mensagens_importadas: rows.reduce((s, r) => s + (r.mensagens_importadas ?? 0), 0),
    }
  }

  // ── ENUMERAR: monta a fila a partir dos chats do Evolution ───────────────────
  if (action === 'enumerar') {
    const chats = await evoPost(cfg, `/chat/findChats/${instance}`, {}, inst.instance_token)
    const lista: any[] = Array.isArray(chats) ? chats : (chats?.records ?? [])
    const jids = Array.from(new Set(
      lista.map((c) => c?.remoteJid ?? c?.id).filter((j): j is string => typeof j === 'string' && j.includes('@')),
    ))
    if (!jids.length) return json({ ok: true, action, jids: 0, aviso: 'evolution nao devolveu chats' })

    // O Eixo 1 mora no SQL — aqui só entrego a lista.
    const { data: res, error } = await db.rpc('carteira_import_enfileirar', {
      p_organization_id: orgId, p_instance_name: instance, p_jids: jids,
    })
    if (error) return json({ error: 'falha_enfileirar', detalhe: error.message }, 500)
    return json({ ok: true, action, jids_vistos: jids.length, fila: res })
  }

  // ── PROCESSAR: puxa as mensagens de um lote de contatos ──────────────────────
  if (action === 'processar') {
    const lote = Math.min(Math.max(Number(body.lote) || LOTE_PADRAO, 1), 50)
    const { data: jobs } = await db.from('carteira_import_jobs')
      .select('id, remote_jid, telefone_normalizado')
      .eq('organization_id', orgId).eq('instance_name', instance).eq('status', 'pendente')
      .order('created_at', { ascending: true }).limit(lote)

    if (!jobs?.length) return json({ ok: true, action, contatos_processados: 0, fila: await contarFila() })

    let msgsNovas = 0, convsCriadas = 0, erros = 0

    for (const job of jobs) {
      try {
        // 1) todas as mensagens deste contato (paginado)
        const todas: EvoMsg[] = []
        for (let page = 1; ; page++) {
          const r = await evoPost(cfg, `/chat/findMessages/${instance}`, {
            where: { key: { remoteJid: job.remote_jid } }, offset: PAGINA, page,
          }, inst.instance_token)
          const bloco: EvoMsg[] = r?.messages?.records ?? []
          todas.push(...bloco)
          const totalPages = Number(r?.messages?.pages ?? 1)
          if (page >= totalPages || bloco.length === 0) break
        }
        if (!todas.length) {
          await db.from('carteira_import_jobs').update({
            status: 'feito', mensagens_importadas: 0, updated_at: new Date().toISOString(),
          }).eq('id', job.id)
          continue
        }

        // 2) conversa (uma por contato) — casa pelo índice parcial de telefone
        const tel = job.telefone_normalizado
        const { data: convExistente } = await db.from('webchat_conversations')
          .select('id').eq('organization_id', orgId).eq('channel', 'whatsapp')
          .eq('visitor_phone_normalized', tel).neq('status', 'closed').limit(1)

        let convId = convExistente?.[0]?.id as string | undefined
        const ultima = todas.reduce((mx, m) => Math.max(mx, Number(m.messageTimestamp) || 0), 0)

        if (!convId) {
          // Espelha o caminho AO VIVO (evolution-webhook :1748) em vez de compor a
          // linha a partir da lista de colunas: `visitor_id` é NOT NULL sem default e
          // `visitor_phone_normalized` é GENERATED (não aceita insert).
          const nome = todas.find((m) => m.key?.fromMe !== true && m.pushName)?.pushName ?? tel
          const { data: nova, error: eConv } = await db.from('webchat_conversations').insert({
            organization_id: orgId,
            visitor_id: crypto.randomUUID(),
            channel: 'whatsapp',
            // enum webchat_conversation_status: bot_active | waiting_human | human_active | closed
            // Histórico importado é conversa humana que já aconteceu — e precisa ficar
            // fora de 'closed' para participar do índice único por telefone.
            status: 'human_active',
            visitor_phone: tel,
            visitor_name: nome,
            evolution_instance_id: inst.id,
            last_message_at: tsIso(ultima),
            metadata: { origem: 'carteira-import-legacy', remote_jid: job.remote_jid },
          }).select('id').single()
          if (eConv) throw new Error(`conversa: ${eConv.message}`)
          convId = nova!.id as string
          convsCriadas++
        }

        // 3) idempotência é do BANCO, não daqui. `evolution_message_id` é coluna real
        // (generated de metadata) com índice único por conversa, e o upsert abaixo
        // ignora duplicata. Não existe mais leitura prévia do que já foi importado:
        // ela falhava em conversa grande (teto de linhas do PostgREST devolvia conjunto
        // incompleto) e era a causa do timeout ao reprocessar contato de 37 mil msgs.
        //
        // Resta só o dedupe DENTRO do lote — o Evolution repete o mesmo key.id entre
        // páginas, e o upsert não resolve duplicata dentro do próprio comando.
        const unicas = new Map<string, EvoMsg>()
        for (const m of todas) {
          const id = m.key?.id
          if (id && !unicas.has(id)) unicas.set(id, m)
        }

        const linhas = Array.from(unicas.values())
          .map((m) => {
            const fromMe = m.key?.fromMe === true
            return {
              conversation_id: convId!,
              direction: fromMe ? 'outbound' : 'inbound',
              sender_type: fromMe ? 'agent' : 'visitor',
              content: textoDe(m),
              content_type: contentType(m.messageType),
              message_type: m.messageType ?? null,
              metadata: { evolution_message_id: m.key!.id, origem: 'carteira-import-legacy' },
              created_at: tsIso(m.messageTimestamp),
            }
          })

        for (let i = 0; i < linhas.length; i += 500) {
          const fatia = linhas.slice(i, i + 500)
          const { error: eIns } = await db.from('webchat_messages')
            .upsert(fatia, { onConflict: 'conversation_id,evolution_message_id', ignoreDuplicates: true })
          if (eIns) throw new Error(`mensagens: ${eIns.message}`)
          msgsNovas += fatia.length
        }

        await db.from('carteira_import_jobs').update({
          status: 'feito', mensagens_importadas: todas.length, erro: null,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
      } catch (e) {
        erros++
        await db.from('carteira_import_jobs').update({
          status: 'erro', erro: String((e as Error)?.message ?? e).slice(0, 400),
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
      }
    }

    return json({
      ok: true, action, contatos_processados: jobs.length,
      conversas_criadas: convsCriadas, mensagens_novas: msgsNovas, erros,
      fila: await contarFila(),
    })
  }

  return json({ ok: true, action: 'status', instance, organization_id: orgId, fila: await contarFila() })
})
