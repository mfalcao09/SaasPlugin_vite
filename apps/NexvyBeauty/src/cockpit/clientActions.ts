// ─── Ações com Clientes — núcleo (TS puro, sem React/JSX) ────────────────────
// A FEATURE A) do plano de compatibilização: a MESMA matéria-prima do AI Growth
// (agendamentos / pacotes / clientes, por organization_id), mas TRANSPOSTA de
// "por oportunidade" (AiGrowth) para "POR CLIENTE" — a fila do "o que fazer com
// cada cliente AGORA". Determinístico, client-side, SEM LLM e SEM edge function
// (a personalização por IA pode entrar por cima depois, trocando só a mensagem).
//
// Reusa helpers e thresholds do levers.ts (fonte única — sem Frankenstein de regra).

import {
  parseDateLocal, daysBetween, todayMidnight, leverMessage,
  INATIVO_DIAS, VIP_TICKET_MULTIPLO, PACOTE_SESSOES_RESTANTES, PACOTE_VENCE_EM_DIAS,
  type AgendamentoRow, type PacoteClienteRow, type ClienteRow,
} from './levers'

// Selo = quem é este cliente (pode ter mais de um: VIP que está sumindo).
export type Selo = 'vip' | 'em-risco' | 'nova'

// Uma ação concreta sugerida pra um cliente (com mensagem WhatsApp pronta).
export interface ClientAcao {
  tipo: 'reativar' | 'pacote' | 'aniversario' | 'upsell'
  motivo: string
  mensagem: string
}

// Um cliente da fila + seus selos + as ações sugeridas. Só entram clientes com
// pelo menos 1 ação (a fila é "quem precisa de atenção", não a base inteira).
export interface ClientAction {
  key: string
  cliente_id?: string
  nome: string
  telefone?: string
  selos: Selo[]
  acoes: ClientAcao[]
  diasSemVoltar: number | null
}

// "Cliente novo": 1 única visita, e recente (≤ N dias) — alguém pra fidelizar.
const NOVA_CLIENTE_DIAS = 30

export function buildClientActions(
  agendamentos: AgendamentoRow[],
  pacotes: PacoteClienteRow[],
  clientesRows: ClienteRow[] = [],
): ClientAction[] {
  const hoje = todayMidnight()
  const concluidos = agendamentos.filter((a) => a.status === 'concluido')

  const totalConcluidos = concluidos.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketMedio = concluidos.length ? totalConcluidos / concluidos.length : 0

  // ── Agregação por cliente (mesma chave do levers: id ?? nome:nome) ──────────
  interface CliAgg { key: string; nome: string; ultima: Date | null; gasto: number; visitas: number }
  const porCliente = new Map<string, CliAgg>()
  for (const a of concluidos) {
    const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
    if (!key) continue
    const d = parseDateLocal(a.data)
    const cur = porCliente.get(key) ?? { key, nome: a.cliente_nome ?? 'Cliente', ultima: null, gasto: 0, visitas: 0 }
    cur.gasto += Number(a.valor ?? 0)
    cur.visitas += 1
    if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d
    if (a.cliente_nome && cur.nome === 'Cliente') cur.nome = a.cliente_nome
    porCliente.set(key, cur)
  }

  // ── Lookups da tabela clientes: telefone + nascimento (por id e por nome) ───
  const normNome = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const telById = new Map<string, string>()
  const telByNome = new Map<string, string>()
  const nascById = new Map<string, string>()
  const nascByNome = new Map<string, string>()
  for (const c of clientesRows) {
    if (c.telefone) {
      if (c.id) telById.set(c.id, c.telefone)
      if (c.nome) telByNome.set(normNome(c.nome), c.telefone)
    }
    if (c.data_nascimento) {
      if (c.id) nascById.set(c.id, c.data_nascimento)
      if (c.nome) nascByNome.set(normNome(c.nome), c.data_nascimento)
    }
  }
  const resolve = (key: string, nome: string) => {
    const cid = key.startsWith('nome:') ? undefined : key
    const telefone = (cid ? telById.get(cid) : undefined) ?? telByNome.get(normNome(nome)) ?? undefined
    const nasc = (cid ? nascById.get(cid) : undefined) ?? nascByNome.get(normNome(nome)) ?? undefined
    return { cliente_id: cid, telefone, nasc }
  }

  // ── Pacotes quase-esgotados por cliente (mesma regra do levers) ─────────────
  const pacoteAlvo = new Set<string>()
  for (const p of pacotes) {
    if (p.status && p.status !== 'ativo') continue
    const total = Number(p.total_sessoes ?? 0)
    const restantes = total - Number(p.sessoes_usadas ?? 0)
    const venc = parseDateLocal(p.data_validade)
    const venceLogo = !!venc && daysBetween(venc, hoje) >= 0 && daysBetween(venc, hoje) <= PACOTE_VENCE_EM_DIAS
    if ((total > 0 && restantes <= PACOTE_SESSOES_RESTANTES) || venceLogo) {
      if (p.cliente_nome) pacoteAlvo.add(normNome(p.cliente_nome))
    }
  }

  // ── Serviço âncora (o mais agendado) + quem nunca fez → upsell ──────────────
  const srvCount = new Map<string, number>()
  for (const a of concluidos) {
    if (a.servico_nome) srvCount.set(a.servico_nome, (srvCount.get(a.servico_nome) ?? 0) + 1)
  }
  const ancora = [...srvCount.entries()].sort(([, x], [, y]) => y - x)[0]?.[0] ?? null
  const fezAncora = new Set<string>()
  if (ancora) {
    for (const a of concluidos) {
      if (a.servico_nome !== ancora) continue
      const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
      if (key) fezAncora.add(key)
    }
  }

  const mesAtual = hoje.getMonth()

  // ── Monta a fila ────────────────────────────────────────────────────────────
  const fila: ClientAction[] = []
  for (const c of porCliente.values()) {
    const { cliente_id, telefone, nasc } = resolve(c.key, c.nome)
    const diasSemVoltar = c.ultima ? daysBetween(hoje, c.ultima) : null
    const ticketCliente = c.visitas > 0 ? c.gasto / c.visitas : 0
    const inativo = diasSemVoltar !== null && diasSemVoltar > INATIVO_DIAS
    const isVip = ticketMedio > 0 && ticketCliente >= ticketMedio * VIP_TICKET_MULTIPLO
    const isNova = c.visitas === 1 && diasSemVoltar !== null && diasSemVoltar <= NOVA_CLIENTE_DIAS

    const selos: Selo[] = []
    if (isVip) selos.push('vip')
    if (inativo) selos.push('em-risco')
    if (isNova) selos.push('nova')

    const acoes: ClientAcao[] = []
    if (inativo) {
      acoes.push({
        tipo: 'reativar',
        motivo: `Sem voltar há ${diasSemVoltar} dias`,
        mensagem: leverMessage(isVip ? 'vips' : 'inativos', c.nome),
      })
    }
    if (pacoteAlvo.has(normNome(c.nome))) {
      acoes.push({ tipo: 'pacote', motivo: 'Pacote quase no fim', mensagem: leverMessage('pacotes', c.nome) })
    }
    const dNasc = parseDateLocal(nasc)
    if (dNasc && dNasc.getMonth() === mesAtual) {
      acoes.push({ tipo: 'aniversario', motivo: 'Faz aniversário este mês', mensagem: leverMessage('aniversario', c.nome) })
    }
    if (ancora && !fezAncora.has(c.key)) {
      acoes.push({ tipo: 'upsell', motivo: `Nunca fez ${ancora}`, mensagem: leverMessage('upsell', c.nome) })
    }

    if (acoes.length === 0) continue
    fila.push({ key: c.key, cliente_id, nome: c.nome, telefone, selos, acoes, diasSemVoltar })
  }

  // Mais urgente primeiro: em-risco (VIP) > nº de ações > mais tempo sem voltar.
  const urgencia = (c: ClientAction) =>
    (c.selos.includes('em-risco') ? 100 : 0) +
    (c.selos.includes('vip') ? 50 : 0) +
    c.acoes.length * 5 +
    Math.min(c.diasSemVoltar ?? 0, 365) / 10
  return fila.sort((a, b) => urgencia(b) - urgencia(a))
}
