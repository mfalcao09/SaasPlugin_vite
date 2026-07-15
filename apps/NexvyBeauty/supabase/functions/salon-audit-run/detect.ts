// ─── salon-audit-run / detect — núcleo DETERMINÍSTICO (TS puro, testável) ──────
// Varre a base de clientes e decide, POR CLIENTE: quais campos faltam e se o
// cliente é ALCANÇÁVEL (telefone válido e NÃO ambíguo). Homônimo/telefone
// compartilhado → não vira alvo de pergunta (a resposta inbound não daria pra
// atribuir a um cliente só). Sem DB/rede aqui — o index.ts liga isto ao banco.

import { normalizePhoneBR } from '../_shared/phone.ts'

export type Campo = 'data_nascimento' | 'endereco' | 'email' | 'cpf_cnpj'

// Campos que o Auditor PERSEGUE por carona (prioridade do blueprint). cpf_cnpj
// fica DE FORA: dado sensível, alto atrito, baixo uso no relacionamento.
export const FIELDS_TO_AUDIT: Campo[] = ['data_nascimento', 'endereco', 'email']

export interface ClienteRow {
  id: string
  nome: string | null
  telefone: string | null
  data_nascimento: string | null
  email: string | null
  cpf_cnpj: string | null
  // endereço estruturado (qualquer um preenchido conta como "tem endereço")
  cep: string | null
  logradouro: string | null
  endereco: string | null
  marketing_opt_out?: boolean | null
}

const has = (s: string | null | undefined) => !!(s && String(s).trim())

/** "Tem o campo?" — endereço é composto (cep OU logradouro OU endereco legado). */
export function hasCampo(c: ClienteRow, campo: Campo): boolean {
  switch (campo) {
    case 'data_nascimento': return has(c.data_nascimento)
    case 'email': return has(c.email)
    case 'cpf_cnpj': return has(c.cpf_cnpj)
    case 'endereco': return has(c.cep) || has(c.logradouro) || has(c.endereco)
  }
}

/** Conta quantos clientes compartilham cada telefone normalizado (detecta ambíguo). */
export function buildPhoneCount(clientes: ClienteRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of clientes) {
    const p = normalizePhoneBR(c.telefone)
    if (p) m.set(p, (m.get(p) ?? 0) + 1)
  }
  return m
}

export type Reason = 'ok' | 'no_phone' | 'ambiguous_phone' | 'opt_out'

export interface Classificacao {
  reachable: boolean
  reason: Reason
  missing: Campo[]     // campos faltando (dentre FIELDS_TO_AUDIT)
}

/** Decide o destino de um cliente: alcançável? quais campos faltam? */
export function classifyCliente(
  c: ClienteRow,
  phoneCount: Map<string, number>,
  fields: Campo[] = FIELDS_TO_AUDIT,
): Classificacao {
  const missing = fields.filter((f) => !hasCampo(c, f))

  if (c.marketing_opt_out) return { reachable: false, reason: 'opt_out', missing }

  const p = normalizePhoneBR(c.telefone)
  if (!p) return { reachable: false, reason: 'no_phone', missing }
  if ((phoneCount.get(p) ?? 0) > 1) return { reachable: false, reason: 'ambiguous_phone', missing }

  return { reachable: true, reason: 'ok', missing }
}
