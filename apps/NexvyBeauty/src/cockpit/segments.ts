// ─── AI Growth — motor de SEGMENTOS (a 3ª dimensão: faixa × serviço × região) ──
// TS puro (sem React). Cruza o CADASTRO (faixa etária via data_nascimento; região
// via cidade/uf) com o CONSUMO (serviços concluídos, de agendamentos.servico_nome)
// e devolve OPORTUNIDADES ACIONÁVEIS de segmento — NÃO um dashboard. Cada
// oportunidade carrega a lista de clientes que casam (com telefone resolvido) pra
// disparar WhatsApp direto, no mesmo padrão das alavancas (levers.ts).
//
// Sinal usado = LACUNA DE PENETRAÇÃO COMPARADA: um serviço que "bomba" no resto da
// base mas é sub-consumido por um segmento (faixa/região) → as clientes daquele
// segmento que ainda não fizeram são o alvo natural de cross-sell. Isso é
// genuinamente cross-dimensional (não é só "não fez X", é "não fez X que todo mundo
// como ela faz"). Heurística determinística: sem LLM, sem custo, sem alucinação.
//
// Defensivo: idade via parseDateLocal (sem shift de TZ); guarda de homônimo na
// resolução nome→telefone (nome ambíguo NÃO vira disparo — ver
// feedback_name_match_homonimo_wrong_recipient).

import { Users, MapPin, Layers, type LucideIcon } from 'lucide-react'
import {
  parseDateLocal, todayMidnight,
  type AiGrowthClienteData, type AgendamentoRow,
} from '@/cockpit/levers'

// Linha de cliente que o motor de segmento precisa (superset do ClienteRow das
// levers: + cidade/uf pra dimensão região).
export interface SegmentClienteRow {
  id: string
  nome: string | null
  telefone: string | null
  data_nascimento: string | null
  cidade: string | null
  uf: string | null
}

// ─── Contrato de uma oportunidade de segmento (= 1 card acionável) ──────────
export interface SegmentOpportunity {
  /** chave estável (key React + dedupe): `${dim}:${cohort}:${servico}` */
  id: string
  /** qual cruzamento gerou: faixa, região, ou os dois */
  dimensao: 'faixa' | 'regiao' | 'faixa+regiao'
  /** rótulo do segmento (ex.: "25–34 anos · São Paulo/SP") */
  segmento: string
  /** serviço a oferecer (o sub-consumido pelo segmento) */
  servico: string
  /** título lay do card */
  titulo: string
  /** uma linha explicando o cruzamento e o porquê */
  insight: string
  /** receita estimada do cross-sell (preço médio do serviço × alvos) */
  estimated: number
  /** nº de clientes-alvo */
  count: number
  /** clientes do segmento que ainda não fizeram o serviço (alvo do disparo) */
  clienteList: AiGrowthClienteData[]
  icon: LucideIcon
}

// ─── Thresholds (conservadores: segmento de verdade, não ruído) ─────────────
export const MIN_COHORT = 3          // nº mínimo de clientes pra chamar de segmento
export const MIN_TARGETS = 2         // nº mínimo de alvos (1 só → é ação individual, vai pra /acoes)
export const MIN_SERVICO_USOS = 2    // serviço precisa ter ≥2 usos pra contar como "popular"
export const GAP_PENETRACAO = 0.2    // o segmento consome ≥20pp menos que o resto da base
export const TOP_N = 6               // máx de cards (um por segmento, os de maior potencial)

// ─── Helpers de classificação ──────────────────────────────────────────────
const normNome = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function idadeDe(nasc: string | null | undefined): number | null {
  const d = parseDateLocal(nasc)
  if (!d) return null
  const hoje = todayMidnight()
  let age = hoje.getFullYear() - d.getFullYear()
  const m = hoje.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

// Faixa etária em buckets de salão. null quando sem data de nascimento.
export function faixaDe(nasc: string | null | undefined): string | null {
  const idade = idadeDe(nasc)
  if (idade == null) return null
  if (idade < 25) return '18–24 anos'
  if (idade < 35) return '25–34 anos'
  if (idade < 45) return '35–44 anos'
  if (idade < 60) return '45–59 anos'
  return '60+ anos'
}

// Região = cidade (+UF). null quando sem cidade.
export function regiaoDe(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  const c = (cidade ?? '').trim()
  if (!c) return null
  const u = (uf ?? '').trim().toUpperCase()
  return u ? `${c}/${u}` : c
}

// ─── Perfil agregado por cliente (demografia do cadastro + consumo do histórico) ──
interface Profile {
  id: string
  nome: string
  telefone?: string
  faixa: string | null
  regiao: string | null
  servicos: Set<string>
  visitas: number
}

interface Cohort {
  dim: 'faixa' | 'regiao' | 'faixa+regiao'
  label: string
  members: Profile[]
}

const ICON_BY_DIM: Record<Cohort['dim'], LucideIcon> = {
  faixa: Users,
  regiao: MapPin,
  'faixa+regiao': Layers,
}

// ─── Cobertura: quanto da base tem faixa/região preenchidos (alimenta o nudge) ──
export interface SegmentCoverage {
  total: number
  comFaixa: number
  comRegiao: number
}
export function segmentCoverage(clientes: SegmentClienteRow[]): SegmentCoverage {
  let comFaixa = 0, comRegiao = 0
  for (const c of clientes) {
    if (faixaDe(c.data_nascimento)) comFaixa++
    if (regiaoDe(c.cidade, c.uf)) comRegiao++
  }
  return { total: clientes.length, comFaixa, comRegiao }
}

// ─── Motor: cruza demografia × consumo → oportunidades de segmento ──────────
export function buildSegmentOpportunities(
  agendamentos: AgendamentoRow[],
  clientesRows: SegmentClienteRow[],
): SegmentOpportunity[] {
  const concluidos = agendamentos.filter((a) => a.status === 'concluido')

  // 1) Perfis por cliente (keyed por id; demografia vem do cadastro).
  const profById = new Map<string, Profile>()
  const nomeToIds = new Map<string, Set<string>>() // p/ guarda de homônimo
  for (const c of clientesRows) {
    profById.set(c.id, {
      id: c.id,
      nome: c.nome ?? 'Cliente',
      telefone: c.telefone ?? undefined,
      faixa: faixaDe(c.data_nascimento),
      regiao: regiaoDe(c.cidade, c.uf),
      servicos: new Set<string>(),
      visitas: 0,
    })
    if (c.nome) {
      const k = normNome(c.nome)
      if (!nomeToIds.has(k)) nomeToIds.set(k, new Set())
      nomeToIds.get(k)!.add(c.id)
    }
  }

  // 2) Anexa consumo. Casa por cliente_id (preferencial); fallback por nome SÓ se
  //    inequívoco (nome com 1 id) — homônimo não atribui consumo errado.
  const srvUsos = new Map<string, number>()
  const srvValor = new Map<string, number>()
  for (const a of concluidos) {
    if (a.servico_nome) {
      srvUsos.set(a.servico_nome, (srvUsos.get(a.servico_nome) ?? 0) + 1)
      srvValor.set(a.servico_nome, (srvValor.get(a.servico_nome) ?? 0) + Number(a.valor ?? 0))
    }
    let prof = a.cliente_id ? profById.get(a.cliente_id) : undefined
    if (!prof && a.cliente_nome) {
      const ids = nomeToIds.get(normNome(a.cliente_nome))
      if (ids && ids.size === 1) prof = profById.get([...ids][0])
    }
    if (!prof) continue
    prof.visitas += 1
    if (a.servico_nome) prof.servicos.add(a.servico_nome)
  }

  const profiles = [...profById.values()]
  const precoMedio = (s: string) => {
    const n = srvUsos.get(s) ?? 0
    return n > 0 ? (srvValor.get(s) ?? 0) / n : 0
  }
  // Serviços "populares" candidatos a cross-sell (≥ MIN_SERVICO_USOS usos).
  const servicosPopulares = [...srvUsos.entries()]
    .filter(([, n]) => n >= MIN_SERVICO_USOS)
    .map(([s]) => s)

  // 3) Monta os coortes (segmentos) das 3 dimensões.
  const cohorts: Cohort[] = []
  const pushGroups = (dim: Cohort['dim'], keyOf: (p: Profile) => string | null) => {
    const groups = new Map<string, Profile[]>()
    for (const p of profiles) {
      const k = keyOf(p)
      if (!k) continue
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    }
    for (const [label, members] of groups) {
      if (members.length >= MIN_COHORT) cohorts.push({ dim, label, members })
    }
  }
  pushGroups('faixa', (p) => p.faixa)
  pushGroups('regiao', (p) => p.regiao)
  pushGroups('faixa+regiao', (p) => (p.faixa && p.regiao ? `${p.faixa} · ${p.regiao}` : null))

  // 4) Pra cada coorte, acha o MELHOR serviço sub-consumido (lacuna de penetração
  //    vs o resto da base) → 1 oportunidade por coorte.
  const opps: SegmentOpportunity[] = []
  for (const C of cohorts) {
    const cohortIds = new Set(C.members.map((m) => m.id))
    let best: SegmentOpportunity | null = null
    for (const S of servicosPopulares) {
      const fezNaCoorte = C.members.filter((m) => m.servicos.has(S)).length
      const penC = C.members.length > 0 ? fezNaCoorte / C.members.length : 0
      const fora = profiles.filter((p) => !cohortIds.has(p.id))
      const fezFora = fora.filter((p) => p.servicos.has(S)).length
      const penFora = fora.length > 0 ? fezFora / fora.length : 0
      if (penFora - penC < GAP_PENETRACAO) continue // serviço não é mais popular fora → não é lacuna

      // Alvos = membros do segmento que ainda não fizeram S E têm telefone válido.
      const alvos = C.members.filter((m) => !m.servicos.has(S) && m.telefone)
      if (alvos.length < MIN_TARGETS) continue
      const estimated = precoMedio(S) * alvos.length
      if (best && estimated <= best.estimated) continue

      const dimLabel =
        C.dim === 'faixa' ? 'faixa etária' : C.dim === 'regiao' ? 'região' : 'faixa + região'
      best = {
        id: `${C.dim}:${C.label}:${S}`,
        dimensao: C.dim,
        segmento: C.label,
        servico: S,
        titulo: `Cross-sell de ${S} — ${C.label}`,
        insight: `${alvos.length} cliente${alvos.length === 1 ? '' : 's'} de ${C.label} ainda não ${
          alvos.length === 1 ? 'fez' : 'fizeram'
        } ${S} — serviço que ${Math.round(penFora * 100)}% do resto da base já faz. Cruzamento por ${dimLabel}: oferta certeira.`,
        estimated,
        count: alvos.length,
        clienteList: alvos.map((m) => ({
          nome: m.nome,
          key: m.id,
          cliente_id: m.id,
          telefone: m.telefone,
        })),
        icon: ICON_BY_DIM[C.dim],
      }
    }
    if (best) opps.push(best)
  }

  // 5) Ranqueia por potencial e tira os top N (já é 1 por coorte → variedade).
  return opps.sort((a, b) => b.estimated - a.estimated).slice(0, TOP_N)
}

// Mensagem-modelo de WhatsApp pra oferta de cross-sell de segmento (1º nome).
export function segmentMessage(servico: string, nome: string): string {
  const primeiro = (nome || 'cliente').trim().split(/\s+/)[0]
  return `Oi ${primeiro}! 💕 Separei uma condição especial de ${servico} essa semana, que combina super com você. Quer que eu reserve um horário? 💁‍♀️`
}

export function aggregateSegments(opps: SegmentOpportunity[]): { total: number; count: number } {
  return {
    total: opps.reduce((s, o) => s + (o.estimated ?? 0), 0),
    count: opps.reduce((s, o) => s + (o.count ?? 0), 0),
  }
}
