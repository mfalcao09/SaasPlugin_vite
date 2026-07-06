import type { CalendarEvent } from '@/hooks/useCalendarEvents'
import type { Agendamento } from './Agenda'

// Adapter: mapeia `agendamentos` (tabela canônica do salão) para o shape
// `CalendarEvent` que as views de calendário (Month/Week/Day) já consomem.
// NÃO toca na base de dados — é uma transformação pura em memória.
//
// CRÍTICO TZ: `data` (YYYY-MM-DD) + `hora` (HH:MM[:SS]) vêm como strings sem
// fuso. `new Date("2026-06-24T14:00")` é interpretado como UTC pelo runtime e
// desloca dia/hora em São Paulo (UTC-3). Por isso construímos o Date LOCAL via
// `new Date(ano, mês-1, dia, h, min)` — esse construtor usa o fuso local, então
// um agendamento data='2026-06-24' hora='14:00' aparece às 14:00 do dia 24.

// Status do agendamento → event_type, só para reaproveitar o mapa de cores das
// views (EVENT_TYPE_COLORS: meeting=azul, call=verde, other=cinza).
const STATUS_TO_EVENT_TYPE: Record<string, string> = {
  agendado: 'meeting', // azul
  concluido: 'call', // verde
  cancelado: 'other', // cinza
}

/** Parse LOCAL de data (YYYY-MM-DD) + hora (HH:MM ou HH:MM:SS) → Date no fuso local. */
export function parseLocalDateTime(data: string, hora: string | null | undefined): Date | null {
  if (!data) return null
  const [y, m, d] = data.split('-').map(Number)
  if (!y || !m || !d) return null
  const [hh = 0, mm = 0] = (hora ?? '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

export function agendamentoToEvent(a: Agendamento): CalendarEvent | null {
  const start = parseLocalDateTime(a.data, a.hora)
  if (!start) return null
  const dur = a.duracao_minutos && a.duracao_minutos > 0 ? a.duracao_minutos : 60
  const end = new Date(start.getTime() + dur * 60_000)

  const titleParts = [a.cliente_nome ?? 'Cliente', a.servico_nome].filter(Boolean)
  const title = titleParts.join(' · ')

  return {
    id: a.id,
    organization_id: a.organization_id ?? '',
    user_id: a.profissional_id ?? '',
    title,
    description: a.observacoes ?? null,
    location: null,
    event_type: STATUS_TO_EVENT_TYPE[a.status ?? ''] ?? 'meeting',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    all_day: false,
    timezone: 'America/Sao_Paulo',
    is_recurring: false,
    recurrence_rule: null,
    recurrence_end_date: null,
    parent_event_id: null,
    lead_id: null,
    product_id: null,
    deal_id: null,
    attendees: [],
    status: a.status ?? 'agendado',
    reminder_minutes: [],
    google_event_id: null,
    google_calendar_id: null,
    last_synced_at: null,
    sync_status: 'none',
    color: null,
    notes: a.observacoes ?? null,
    metadata: {},
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    created_by: null,
    meet_link: null,
    create_meet: false,
    // Joins: o cliente aparece como "👤" na Day view; o serviço já está no título.
    lead: a.cliente_nome ? { id: a.cliente_id ?? a.id, name: a.cliente_nome } : null,
    product: a.servico_nome ? { id: a.servico_id ?? a.id, name: a.servico_nome } : null,
    user: a.profissional_nome ? { id: a.profissional_id ?? '', full_name: a.profissional_nome } : null,
  }
}

/** Mapeia a lista inteira, descartando registros sem data válida. */
export function agendamentosToEvents(rows: Agendamento[]): CalendarEvent[] {
  return rows.map(agendamentoToEvent).filter((e): e is CalendarEvent => e !== null)
}
