// ─── salon-collect-inbound — Captura Conversacional (metade B do Agente) ───────
// Chamado FIRE-AND-FORGET pelo evolution-webhook quando chega mensagem inbound
// (mesmo padrão do cadence-on-response). Fecha o loop do Agente de Carteira:
//
//   telefone → cliente → pendência 'asked' aberta? → EXTRAI (regex, LLM fallback)
//     → confiança alta   ► grava clientes.<campo> + pendência 'answered' + trilha
//     → confiança média  ► "Anotei X, confirma? 👍" (valor_pendente, aguarda o sim)
//     → recusa (opt-out) ► marketing_opt_out=true + pendência 'declined'
//
// NÃO É PERSONA (não é a Duda nem a Nina): captura estruturada, mecânica. Só age
// se ALGO foi perguntado a este cliente (senão sai calado). Guarda de ambiguidade:
// telefone que casa com 0 ou ≥2 clientes → não atribui (sai).
//
// Endereço via CEP → BrasilAPI (minimização: 1 pergunta deduz o resto).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { aiApiKey, aiChatCompletionsUrl } from '../_shared/ai.ts'
import {
  extractField, isAffirmative, isNegative, isDecline, pickTopRequest, type Campo,
} from './extract.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ok = (o: Record<string, unknown>) =>
  new Response(JSON.stringify(o), { headers: { ...CORS, 'Content-Type': 'application/json' } })

interface FieldRequest {
  id: string; campo: Campo; status: string; valor_pendente: string | null; ask_count: number
}

const isoToBr = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

const CONFIRM_MSG: Record<Campo, (v: string) => string> = {
  data_nascimento: (v) => `Anotei sua data de nascimento como ${isoToBr(v)} — tá certo? 👍`,
  email: (v) => `Anotei seu e-mail: ${v}. Confirma? 👍`,
  endereco: (v) => `Anotei seu endereço: ${v}. Tá certo? 👍`,
  cpf_cnpj: (v) => `Anotei seu documento: ${v}. Confirma? 👍`,
}
const ANO_MSG = 'Que bom! 🎂 E de qual ano você nasceu? Aí eu registro certinho.'
const OBRIGADO_MSG = 'Prontinho, anotado! Obrigada 💕'
const OPTOUT_MSG = 'Sem problema, não te incomodo mais com isso 💛'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json().catch(() => ({}))
    const conversationId: string | undefined = body.conversation_id
    const organizationId: string | undefined = body.organization_id
    let phone: string | null = body.phone ?? null
    let text: string = (body.text ?? '').toString()
    let messageId: string | null = body.message_id ?? null
    if (!organizationId) return ok({ ok: true, skipped: 'no_org' })

    // Fallback (quando o webhook passa só conversation_id, tipo cadence-on-response):
    // resolve telefone + última mensagem inbound pela conversa.
    if ((!phone || !text) && conversationId) {
      const { data: conv } = await admin.from('webchat_conversations')
        .select('visitor_phone, visitor_phone_normalized').eq('id', conversationId).maybeSingle()
      phone = phone ?? (conv as { visitor_phone?: string })?.visitor_phone
        ?? (conv as { visitor_phone_normalized?: string })?.visitor_phone_normalized ?? null
      if (!text) {
        const { data: msg } = await admin.from('webchat_messages')
          .select('id, content').eq('conversation_id', conversationId).eq('direction', 'inbound')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        text = (msg as { content?: string })?.content ?? ''
        messageId = messageId ?? (msg as { id?: string })?.id ?? null
      }
    }
    if (!phone || !text.trim()) return ok({ ok: true, skipped: 'no_phone_or_text' })

    // ── Resolve cliente pelo telefone (canônico) — guarda de ambiguidade ──
    const canon = normalizePhoneBR(phone)
    if (!canon) return ok({ ok: true, skipped: 'unnormalizable_phone' })
    const { data: cliRaw } = await admin.from('clientes')
      .select('id, telefone, data_nascimento, email, cpf_cnpj, cep, logradouro, endereco, marketing_opt_out')
      .eq('organization_id', organizationId)
    const matches = (cliRaw ?? []).filter((c: { telefone: string | null }) => normalizePhoneBR(c.telefone) === canon)
    if (matches.length !== 1) return ok({ ok: true, skipped: matches.length === 0 ? 'no_cliente' : 'ambiguous_cliente' })
    const cliente = matches[0] as Record<string, string | null | boolean>
    const clienteId = cliente.id as string

    // ── Pendências ABERTAS ('asked') deste cliente ──
    const { data: reqsRaw, error: reqErr } = await admin.from('salon_client_field_requests')
      .select('id, campo, status, valor_pendente, ask_count')
      .eq('organization_id', organizationId).eq('cliente_id', clienteId).eq('status', 'asked')
    if (reqErr) return ok({ ok: true, skipped: 'requests_unavailable' }) // tabela ainda não aplicada
    const reqs = (reqsRaw ?? []) as FieldRequest[]
    if (!reqs.length) return ok({ ok: true, skipped: 'nothing_asked' })

    // Recusa/opt-out (LGPD Art.18): honra amplo — desliga toda a coleta.
    if (isDecline(text)) {
      await admin.from('clientes').update({ marketing_opt_out: true }).eq('id', clienteId)
      await admin.from('salon_client_field_requests')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('cliente_id', clienteId).eq('status', 'asked')
      await sendWhatsApp(organizationId, canon, OPTOUT_MSG)
      return ok({ ok: true, action: 'declined_optout' })
    }

    const pend = pickTopRequest(reqs)!
    const campo = pend.campo

    // Se o campo já foi preenchido por outra via, encerra sem perguntar de novo.
    if (hasCampoLive(cliente, campo)) {
      await resolveRequest(admin, pend.id, 'skipped', null, messageId)
      return ok({ ok: true, action: 'already_filled' })
    }

    // ── Fluxo de CONFIRMAÇÃO: já tínhamos um valor_pendente aguardando o "sim" ──
    if (pend.valor_pendente) {
      if (isAffirmative(text)) {
        await writeAndAnswer(admin, clienteId, campo, pend.valor_pendente, pend.id, messageId, 1.0)
        await sendWhatsApp(organizationId, canon, OBRIGADO_MSG)
        return ok({ ok: true, action: 'confirmed_written', campo })
      }
      if (isNegative(text)) {
        await admin.from('salon_client_field_requests')
          .update({ valor_pendente: null, updated_at: new Date().toISOString() }).eq('id', pend.id)
        // segue abaixo pra tentar reextrair o que ele mandou agora
      } else {
        // resposta não é sim/não → tenta reextrair do texto atual (pode ter reenviado o valor)
      }
    }

    // ── EXTRAÇÃO: regex primeiro ──
    let res = extractField(campo, text)

    // nascimento sem ano (marcador '--MM-DD') → pede o ano, não grava
    if (campo === 'data_nascimento' && res.value?.startsWith('--')) {
      await touchAsked(admin, pend.id)
      await sendWhatsApp(organizationId, canon, ANO_MSG)
      return ok({ ok: true, action: 'ask_year' })
    }

    // endereço por CEP → BrasilAPI expande e grava direto (CEP é autoritativo)
    if (campo === 'endereco' && res.cep) {
      const addr = await lookupCep(res.cep)
      await admin.from('clientes').update({
        cep: res.cep,
        logradouro: addr?.street ?? cliente.logradouro,
        bairro: addr?.neighborhood ?? undefined,
        cidade: addr?.city ?? undefined,
        uf: addr?.state ?? undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', clienteId)
      await resolveRequest(admin, pend.id, 'answered', res.cep, messageId, 1.0)
      await sendWhatsApp(organizationId, canon, OBRIGADO_MSG)
      return ok({ ok: true, action: 'cep_written', campo })
    }

    // regex falhou → LLM fallback (reusa o gateway _shared/ai.ts, structured)
    if (!res.value && aiApiKey()) {
      const llm = await llmExtract(campo, text)
      if (llm) res = llm
    }

    if (!res.value) {
      // não deu pra extrair — deixa aberto, sem insistir agora
      return ok({ ok: true, action: 'no_value', campo })
    }

    // confiança 1.0 → grava direto; senão → confirma
    if (res.confidence >= 1.0) {
      await writeAndAnswer(admin, clienteId, campo, res.value, pend.id, messageId, res.confidence)
      await sendWhatsApp(organizationId, canon, OBRIGADO_MSG)
      return ok({ ok: true, action: 'written', campo })
    } else {
      await admin.from('salon_client_field_requests').update({
        valor_pendente: res.value, extraction_confidence: res.confidence,
        source_message_id: messageId, updated_at: new Date().toISOString(),
      }).eq('id', pend.id)
      await sendWhatsApp(organizationId, canon, CONFIRM_MSG[campo](res.value))
      return ok({ ok: true, action: 'await_confirmation', campo })
    }
  } catch (err) {
    console.error('[salon-collect-inbound]', err)
    return ok({ ok: false, error: (err as Error).message }) // fire-and-forget: nunca 500 pro webhook
  }
})

// ── helpers ────────────────────────────────────────────────────────────────
function hasCampoLive(c: Record<string, string | null | boolean>, campo: Campo): boolean {
  const has = (s: unknown) => !!(s && String(s).trim())
  if (campo === 'endereco') return has(c.cep) || has(c.logradouro) || has(c.endereco)
  return has(c[campo])
}

async function writeAndAnswer(
  admin: SupabaseClient, clienteId: string, campo: Campo, value: string,
  reqId: string, messageId: string | null, confidence: number,
) {
  await admin.from('clientes').update({ [campo]: value, updated_at: new Date().toISOString() }).eq('id', clienteId)
  await resolveRequest(admin, reqId, 'answered', value, messageId, confidence)
}

async function resolveRequest(
  admin: SupabaseClient, reqId: string, status: string,
  valor: string | null, messageId: string | null, confidence?: number,
) {
  await admin.from('salon_client_field_requests').update({
    status,
    valor_pendente: valor,
    answered_at: status === 'answered' ? new Date().toISOString() : null,
    source_message_id: messageId,
    ...(confidence !== undefined ? { extraction_confidence: confidence } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', reqId)
}

async function touchAsked(admin: SupabaseClient, reqId: string) {
  await admin.from('salon_client_field_requests')
    .update({ updated_at: new Date().toISOString() }).eq('id', reqId)
}

async function sendWhatsApp(orgId: string, to: string, textMsg: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ organization_id: orgId, type: 'text', to, payload: { text: textMsg } }),
    })
  } catch (e) { console.error('[salon-collect-inbound] send non-fatal:', e) }
}

interface CepAddr { street?: string; neighborhood?: string; city?: string; state?: string }
async function lookupCep(cep: string): Promise<CepAddr | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`)
    if (!r.ok) return null
    const j = await r.json()
    return { street: j.street, neighborhood: j.neighborhood, city: j.city, state: j.state }
  } catch { return null }
}

// LLM fallback: reusa o gateway (mesmo shape do suggest-reply), com JSON estruturado.
async function llmExtract(campo: Campo, text: string): Promise<{ value: string | null; confidence: number } | null> {
  try {
    const instr: Record<Campo, string> = {
      data_nascimento: 'a data de nascimento no formato ISO YYYY-MM-DD (só se houver dia, mês E ano)',
      email: 'o endereço de e-mail em minúsculas',
      cpf_cnpj: 'o CPF ou CNPJ só com dígitos',
      endereco: 'o endereço completo em uma linha',
    }
    const resp = await fetch(aiChatCompletionsUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiApiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: `Extraia ${instr[campo]} da mensagem do cliente. Responda APENAS um JSON {"value": string|null, "confidence": number entre 0 e 1}. Se não houver o dado, value=null.` },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const raw = (data.choices?.[0]?.message?.content ?? '').trim()
    const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''))
    if (!json.value) return null
    // LLM nunca grava direto: teto de confiança 0.9 → sempre passa pela confirmação.
    return { value: String(json.value), confidence: Math.min(Number(json.confidence) || 0.7, 0.9) }
  } catch (e) { console.error('[salon-collect-inbound] llmExtract non-fatal:', e); return null }
}
