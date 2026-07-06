// ─── Saúde da Base — métricas de higiene do cadastro (TS puro) ───────────────
// Feature D) do plano de compatibilização. O Clientes.tsx JÁ detecta duplicatas
// e faz o merge (RPC merge_clientes) — o que faltava era um RESUMO da saúde da
// base: % de preenchimento por campo, score médio, nº de duplicatas, % inativos.
// Esta é a camada de cálculo (sem React); a tela vive em SaudeBase.tsx.

import { normalizeBrPhone } from './types'

// Subset da tabela clientes que alimenta as métricas.
export interface ClienteHigiene {
  nome: string | null
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  data_nascimento: string | null
  observacoes: string | null
  status: string | null
}

const has = (s: string | null | undefined) => !!(s && s.trim())

// Score de cadastro DO SALÃO (0–6): o que importa pra atender + vender. Difere
// de propósito do filledScore antigo do Clientes.tsx (que contava tags/lead_id
// do CRM) — aqui vale nome + contato + nascimento (aniversário) + CPF + obs.
export const SCORE_MAX = 6
export function filledScore(c: ClienteHigiene): number {
  return [c.nome, c.telefone, c.email, c.cpf_cnpj, c.data_nascimento, c.observacoes].filter(has).length
}

export interface HealthMetrics {
  total: number
  /** % da base com cada campo preenchido + média geral de preenchimento */
  pct: { telefone: number; email: number; nascimento: number; cpf: number; media: number }
  /** média do filledScore (0–6) */
  scoreMedia: number
  /** grupos de cadastros com o MESMO telefone (candidatos a merge) + nº de cadastros neles */
  dupGrupos: number
  dupClientes: number
  inativos: number
  pctInativos: number
}

export function buildHealthMetrics(clientes: ClienteHigiene[]): HealthMetrics {
  const total = clientes.length
  if (total === 0) {
    return {
      total: 0,
      pct: { telefone: 0, email: 0, nascimento: 0, cpf: 0, media: 0 },
      scoreMedia: 0, dupGrupos: 0, dupClientes: 0, inativos: 0, pctInativos: 0,
    }
  }

  const pct = (n: number) => Math.round((n / total) * 100)
  const count = (f: (c: ClienteHigiene) => boolean) => clientes.filter(f).length

  const tel = count((c) => has(c.telefone))
  const email = count((c) => has(c.email))
  const nasc = count((c) => has(c.data_nascimento))
  const cpf = count((c) => has(c.cpf_cnpj))
  const inativos = count((c) => c.status === 'inativo')

  // Duplicatas: cadastros com o MESMO telefone normalizado (mesma regra do
  // detectDuplicates do Clientes.tsx). Aqui só contamos pro resumo — o merge em
  // si continua no banner de /clientes (fonte única, com confirmação).
  const porTelefone = new Map<string, number>()
  for (const c of clientes) {
    const ph = normalizeBrPhone(c.telefone)
    if (ph) porTelefone.set(ph, (porTelefone.get(ph) ?? 0) + 1)
  }
  let dupGrupos = 0
  let dupClientes = 0
  for (const n of porTelefone.values()) {
    if (n >= 2) { dupGrupos += 1; dupClientes += n }
  }

  const scoreMedia = clientes.reduce((s, c) => s + filledScore(c), 0) / total

  return {
    total,
    pct: {
      telefone: pct(tel), email: pct(email), nascimento: pct(nasc), cpf: pct(cpf),
      media: Math.round((scoreMedia / SCORE_MAX) * 100),
    },
    scoreMedia,
    dupGrupos, dupClientes,
    inativos, pctInativos: pct(inativos),
  }
}
