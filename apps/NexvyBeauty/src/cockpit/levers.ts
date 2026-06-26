// ─── AI Growth — núcleo de "alavancas/levers" (TS puro, sem React/JSX) ───────
// Lógica MACRO do negócio extraída de AiGrowth.tsx: dado o HISTÓRICO operacional
// do salão (agendamentos / pacotes, já filtrados por organization_id na query),
// agrega CLIENT-SIDE — SEM LLM e SEM edge function — quanto de receita está parado
// em alavancas óbvias (reativação de inativos, renovação de pacotes, slots vazios,
// upsell do serviço âncora e VIPs que sumiram).
//
// Este módulo é PURO TS: não importa nada de react / react-dom / react-router.
// Importa apenas tipos e ícones do lucide-react (são valores/objetos JS, não DOM),
// já que cada alavanca carrega seu `icon`. A renderização vive no AiGrowth.tsx.
//
// Defensivo: TODO número usa `?? 0` (nunca NaN). Datas ancoradas com `T00:00:00`
// e chave de mês via `.slice(0, 7)` (evita shift de TZ — feedback_iso_date_format_br).

import {
  UserMinus, PackageCheck, CalendarClock, ArrowUpRight, Crown, Cake,
  type LucideIcon,
} from 'lucide-react'

// ─── Contrato de uma alavanca (= 1 card de oportunidade macro) ──────────────
export interface GrowthLever {
  /** chave estável (key do React + dedupe) */
  id: string
  /** título lay, sem jargão (ex.: "Clientes sumidas pra reativar") */
  title: string
  /** uma linha explicando o porquê / como agir */
  description: string
  /** receita estimada parada nesta alavanca (R$) */
  estimated: number
  /** quantos itens/clientes alimentam a estimativa */
  count: number
  /** rótulo do CTA do card */
  ctaLabel: string
  /** rota interna do CTA */
  ctaTo: string
  icon: LucideIcon
  /** clientes nomeados que alimentam a alavanca (a cabeleireira vê QUEM, não só
   * o número). Opcional → backward-compatible com quem só lê o agregado. */
  clienteList?: AiGrowthClienteData[]
}

// Cliente nomeado de uma alavanca: nome p/ exibir + chave estável + (quando
// resolvível) cliente_id e telefone, pra disparar WhatsApp direto do card.
export interface AiGrowthClienteData {
  nome: string
  key: string
  cliente_id?: string
  telefone?: string
}

export interface AiGrowthData {
  levers: GrowthLever[]
}

// Rotas do Cockpit (in-shell). Não existe página de pacotes nem /admin?tab=pacotes,
// então renovação de pacote age sobre os clientes (/clientes). Serviços não têm rota
// no Cockpit → usa a página cheia /salao/servicos.
export const TO_CLIENTES = '/clientes'
export const TO_PACOTES = '/clientes'
export const TO_AGENDA = '/agenda'
export const TO_SERVICOS = '/salao/servicos'

// Inativo = sem agendamento concluído há mais de N dias.
export const INATIVO_DIAS = 45
// VIP que sumiu: ticket histórico >= múltiplo do ticket médio E inativo.
export const VIP_TICKET_MULTIPLO = 1.5
// Pacote "quase esgotado": faltam <= N sessões OU vence em <= N dias.
export const PACOTE_SESSOES_RESTANTES = 1
export const PACOTE_VENCE_EM_DIAS = 30

// ─── Shapes das linhas reais (subset do que cada tabela expõe) ──────────────
export interface AgendamentoRow {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  servico_nome: string | null
  status: string | null
  data: string | null
  hora: string | null
  valor: number | null
}
export interface PacoteClienteRow {
  id: string
  pacote_nome: string | null
  cliente_nome: string | null
  total_sessoes: number | null
  sessoes_usadas: number | null
  valor_pago: number | null
  data_validade: string | null
  status: string | null
}
// Subset da tabela clientes — telefone (p/ disparo WhatsApp) + nascimento (aniversário).
export interface ClienteRow {
  id: string
  nome: string | null
  telefone: string | null
  data_nascimento: string | null
}

// ─── Helpers de data (T00:00:00 ancora local; sem shift de TZ) ──────────────
export function todayMidnight(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
export function parseDateLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(`${raw.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}
export function faixaHorario(hora: string | null | undefined): string {
  const h = Number((hora ?? '').slice(0, 2))
  if (Number.isNaN(h)) return 'Sem horário'
  if (h < 12) return 'manhã (até 12h)'
  if (h < 18) return 'tarde (12h–18h)'
  return 'noite (após 18h)'
}
export const DOW_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Mensagem-modelo de WhatsApp por tipo de alavanca (linguagem de salão; usa o 1º
// nome). A cabeleireira confere e dispara — carinho em escala, não "disparo em massa".
export function leverMessage(leverId: string, nome: string): string {
  const primeiro = (nome || 'cliente').trim().split(/\s+/)[0]
  const M: Record<string, string> = {
    inativos: `Oi ${primeiro}! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana? Tenho um mimo te esperando 🎁`,
    vips: `Oi ${primeiro}! Você faz falta no salão 👑 Quero reservar um horário especial só pra você — quando fica bom?`,
    pacotes: `Oi ${primeiro}! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? Posso já deixar separado 😉`,
    upsell: `Oi ${primeiro}! Tenho uma novidade que combina super com você 💁‍♀️ Quer que eu te conte e já reserve um horário?`,
    aniversario: `Oi ${primeiro}! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho seu aqui no salão. Vem buscar? 🎂`,
  }
  return M[leverId] ?? `Oi ${primeiro}! Que tal marcar um horário no salão essa semana? 💕`
}

// ─── Agregação dos dados reais → alavancas ──────────────────────────────────
export function buildLevers(
  agendamentos: AgendamentoRow[],
  pacotes: PacoteClienteRow[],
  clientesRows: ClienteRow[] = [],
): GrowthLever[] {
  const hoje = todayMidnight()
  const concluidos = agendamentos.filter((a) => a.status === 'concluido')

  // Telefone NÃO vem de agendamentos/pacotes — resolve da tabela clientes por
  // cliente_id (preferencial) ou nome (fallback), pra permitir o disparo WhatsApp.
  const normNome = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  const telById = new Map<string, string>()
  const telByNome = new Map<string, string>()
  for (const c of clientesRows) {
    if (!c.telefone) continue
    if (c.id) telById.set(c.id, c.telefone)
    if (c.nome) telByNome.set(normNome(c.nome), c.telefone)
  }
  const resolveCli = (key: string, nome: string): { cliente_id?: string; telefone?: string } => {
    const cid = key.startsWith('nome:') ? undefined : key
    const telefone = (cid ? telById.get(cid) : undefined) ?? telByNome.get(normNome(nome)) ?? undefined
    return { cliente_id: cid, telefone }
  }

  // Ticket médio = média do valor dos concluídos (base p/ várias alavancas).
  const totalConcluidos = concluidos.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketMedio = concluidos.length ? totalConcluidos / concluidos.length : 0

  // Por cliente: última visita concluída (Date) + total histórico gasto.
  // Chave preferencial = cliente_id; fallback = cliente_nome (dado antigo sem id).
  interface CliAgg { key: string; nome: string; ultima: Date | null; gasto: number; visitas: number }
  const porCliente = new Map<string, CliAgg>()
  for (const a of concluidos) {
    const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
    if (!key) continue
    const d = parseDateLocal(a.data)
    const cur = porCliente.get(key) ?? {
      key, nome: a.cliente_nome ?? 'Cliente', ultima: null, gasto: 0, visitas: 0,
    }
    cur.gasto += Number(a.valor ?? 0)
    cur.visitas += 1
    if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d
    if (a.cliente_nome && cur.nome === 'Cliente') cur.nome = a.cliente_nome
    porCliente.set(key, cur)
  }
  const clientes = [...porCliente.values()]

  // ── Alavanca 1: Clientes inativos → reativação ──────────────────────────
  const inativos = clientes.filter((c) => c.ultima && daysBetween(hoje, c.ultima) > INATIVO_DIAS)
  const lever1: GrowthLever = {
    id: 'inativos',
    title: 'Clientes sumidas para reativar',
    description:
      inativos.length > 0
        ? `${inativos.length} cliente${inativos.length === 1 ? '' : 's'} sem voltar há mais de ${INATIVO_DIAS} dias. Uma mensagem traz de volta.`
        : `Nenhuma cliente parada há mais de ${INATIVO_DIAS} dias — sua base está em dia.`,
    estimated: (ticketMedio || 0) * inativos.length,
    count: inativos.length,
    ctaLabel: 'Ver clientes inativas',
    ctaTo: TO_CLIENTES,
    icon: UserMinus,
    clienteList: inativos.map((c) => ({ nome: c.nome, key: c.key, ...resolveCli(c.key, c.nome) })),
  }

  // ── Alavanca 2: Pacotes a renovar (quase esgotados / vencendo) ───────────
  const quaseEsgotados = pacotes.filter((p) => {
    if (p.status && p.status !== 'ativo') return false
    const total = Number(p.total_sessoes ?? 0)
    const usadas = Number(p.sessoes_usadas ?? 0)
    const restantes = total - usadas
    const quaseSemSessao = total > 0 && restantes <= PACOTE_SESSOES_RESTANTES
    const venc = parseDateLocal(p.data_validade)
    const venceLogo = !!venc && daysBetween(venc, hoje) >= 0 && daysBetween(venc, hoje) <= PACOTE_VENCE_EM_DIAS
    return quaseSemSessao || venceLogo
  })
  const lever2: GrowthLever = {
    id: 'pacotes',
    title: 'Pacotes para renovar',
    description:
      quaseEsgotados.length > 0
        ? `${quaseEsgotados.length} pacote${quaseEsgotados.length === 1 ? '' : 's'} quase no fim ou vencendo. Ofereça a renovação antes que esfrie.`
        : 'Nenhum pacote no fim agora.',
    estimated: quaseEsgotados.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0),
    count: quaseEsgotados.length,
    ctaLabel: 'Ver pacotes',
    ctaTo: TO_PACOTES,
    icon: PackageCheck,
    clienteList: quaseEsgotados.map((p) => {
      const nome = p.cliente_nome ?? 'Cliente'
      return { nome, key: p.id, ...resolveCli('nome:' + nome, nome) }
    }),
  }

  // ── Alavanca 3: Horários/dias de baixa ocupação → promo pra preencher ────
  // Agrupa concluídos por (dia-da-semana × faixa horária); o slot menos usado é
  // o candidato a promoção. Receita potencial = ticketMedio × (média − mínimo).
  const slotCount = new Map<string, { count: number; dow: number; faixa: string }>()
  for (const a of concluidos) {
    const d = parseDateLocal(a.data)
    if (!d) continue
    const dow = d.getDay()
    const faixa = faixaHorario(a.hora)
    const key = `${dow}|${faixa}`
    const cur = slotCount.get(key) ?? { count: 0, dow, faixa }
    cur.count += 1
    slotCount.set(key, cur)
  }
  const slots = [...slotCount.values()]
  let lever3: GrowthLever
  if (slots.length >= 2) {
    const counts = slots.map((s) => s.count)
    const media = counts.reduce((s, n) => s + n, 0) / counts.length
    const pior = slots.reduce((m, s) => (s.count < m.count ? s : m), slots[0])
    const gap = Math.max(0, Math.round(media - pior.count))
    lever3 = {
      id: 'ocupacao',
      title: 'Horário vazio para encher',
      description: `${DOW_PT[pior.dow]} de ${pior.faixa} é seu horário mais fraco. Uma promo enche essa janela.`,
      estimated: (ticketMedio || 0) * gap,
      count: gap,
      ctaLabel: 'Abrir agenda',
      ctaTo: TO_AGENDA,
      icon: CalendarClock,
    }
  } else {
    lever3 = {
      id: 'ocupacao',
      title: 'Horário vazio para encher',
      description: 'Ainda não há histórico suficiente para achar seus horários fracos.',
      estimated: 0,
      count: 0,
      ctaLabel: 'Abrir agenda',
      ctaTo: TO_AGENDA,
      icon: CalendarClock,
    }
  }

  // ── Alavanca 4: Upsell do serviço âncora ────────────────────────────────
  // Serviço âncora = o mais agendado (maior recorrência). Quem nunca fez = alvo
  // de upsell. Receita = preço médio do âncora × nº de clientes que ainda não fez.
  const srvCount = new Map<string, number>()
  const srvValorTotal = new Map<string, number>()
  for (const a of concluidos) {
    const s = a.servico_nome
    if (!s) continue
    srvCount.set(s, (srvCount.get(s) ?? 0) + 1)
    srvValorTotal.set(s, (srvValorTotal.get(s) ?? 0) + Number(a.valor ?? 0))
  }
  let lever4: GrowthLever
  if (srvCount.size > 0) {
    const entries = [...srvCount.entries()].sort(([, a], [, b]) => b - a)
    const ancora = entries[0][0]
    const ancoraCount = srvCount.get(ancora) ?? 0
    const precoAncora = ancoraCount > 0 ? (srvValorTotal.get(ancora) ?? 0) / ancoraCount : 0
    // clientes que JÁ fizeram o âncora (por chave de cliente)
    const fezAncora = new Set<string>()
    for (const a of concluidos) {
      if (a.servico_nome !== ancora) continue
      const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
      if (key) fezAncora.add(key)
    }
    const naoFizeram = clientes.filter((c) => !fezAncora.has(c.key))
    lever4 = {
      id: 'upsell',
      title: `Upsell de "${ancora}"`,
      description:
        naoFizeram.length > 0
          ? `${ancora} é seu carro-chefe. ${naoFizeram.length} cliente${naoFizeram.length === 1 ? '' : 's'} ainda não experimentaram — ofereça.`
          : `${ancora} é seu carro-chefe e já alcança toda a base.`,
      estimated: (precoAncora || 0) * naoFizeram.length,
      count: naoFizeram.length,
      ctaLabel: 'Ver serviços',
      ctaTo: TO_SERVICOS,
      icon: ArrowUpRight,
      clienteList: naoFizeram.map((c) => ({ nome: c.nome, key: c.key, ...resolveCli(c.key, c.nome) })),
    }
  } else {
    lever4 = {
      id: 'upsell',
      title: 'Upsell do serviço âncora',
      description: 'Ainda não há serviços concluídos para identificar seu carro-chefe.',
      estimated: 0,
      count: 0,
      ctaLabel: 'Ver serviços',
      ctaTo: TO_SERVICOS,
      icon: ArrowUpRight,
    }
  }

  // ── Alavanca 5: VIPs que sumiram (ticket alto + inativos) ────────────────
  const vips = inativos.filter((c) => {
    const ticketCliente = c.visitas > 0 ? c.gasto / c.visitas : 0
    return ticketMedio > 0 && ticketCliente >= ticketMedio * VIP_TICKET_MULTIPLO
  })
  const lever5: GrowthLever = {
    id: 'vips',
    title: 'Clientes VIP que sumiram',
    description:
      vips.length > 0
        ? `${vips.length} cliente${vips.length === 1 ? '' : 's'} de ticket alto pararam de vir. Vale uma atenção pessoal.`
        : 'Nenhuma cliente de ticket alto sumida no momento.',
    estimated: vips.reduce((s, c) => s + (c.visitas > 0 ? c.gasto / c.visitas : 0), 0),
    count: vips.length,
    ctaLabel: 'Ver clientes',
    ctaTo: TO_CLIENTES,
    icon: Crown,
    clienteList: vips.map((c) => ({ nome: c.nome, key: c.key, ...resolveCli(c.key, c.nome) })),
  }

  // ── Alavanca 6: Aniversariantes do mês → carinho + mimo ──────────────────
  const mesAtual = hoje.getMonth()
  const aniversariantes = clientesRows.filter((c) => {
    const d = parseDateLocal(c.data_nascimento)
    return !!d && d.getMonth() === mesAtual
  })
  const lever6: GrowthLever = {
    id: 'aniversario',
    title: 'Aniversariantes do mês',
    description:
      aniversariantes.length > 0
        ? `${aniversariantes.length} cliente${aniversariantes.length === 1 ? '' : 's'} fazem aniversário este mês. Um carinho + mimo traz de volta.`
        : 'Ninguém aniversariando este mês — cadastre a data de nascimento das clientes pra ativar.',
    estimated: (ticketMedio || 0) * aniversariantes.length,
    count: aniversariantes.length,
    ctaLabel: 'Ver clientes',
    ctaTo: TO_CLIENTES,
    icon: Cake,
    clienteList: aniversariantes.map((c) => ({
      nome: c.nome ?? 'Cliente',
      key: c.id,
      cliente_id: c.id,
      telefone: c.telefone ?? undefined,
    })),
  }

  return [lever1, lever2, lever3, lever4, lever5, lever6]
}

// ─── Agregação de total (R$ recuperável + nº de itens) ──────────────────────
// Soma pura das alavancas. Antes vivia inline no componente (totalPotencial /
// totalItens); extraída aqui pra ser reusável (ex.: headline na Inicio.tsx).
export interface LeversTotals {
  /** receita potencial recuperável (soma dos `estimated`) */
  total: number
  /** nº total de itens/oportunidades (soma dos `count`) */
  count: number
}
export function aggregateLevers(levers: GrowthLever[]): LeversTotals {
  return {
    total: levers.reduce((s, l) => s + (l.estimated ?? 0), 0),
    count: levers.reduce((s, l) => s + (l.count ?? 0), 0),
  }
}
