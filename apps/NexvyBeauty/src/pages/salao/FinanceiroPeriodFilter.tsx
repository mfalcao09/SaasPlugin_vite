// ─── Filtro de período do Financeiro (controladoria) ─────────────────────
// Seletor único reusado pelas 3 abas (Dashboard / Entradas / Saídas). Resolve
// um range {from, to} em datas ISO YYYY-MM-DD. Presets 7/30/60/90 dias + "Todo
// o período" + escolha de DIA específico (calendário) + RANGE customizado
// (de/até via calendário em modo range).
//
// TZ-safe: datas são formatadas como YYYY-MM-DD a partir dos campos locais do
// Date (sem toISOString, que aplicaria UTC e poderia trocar o dia — alinha com
// feedback_iso_date_format_br). `new Date()` é usado só para ancorar "hoje".

import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Modos do filtro. "all" = sem recorte (todo o histórico). "Nd" = janela de N
// dias terminando hoje. "day" = um único dia. "range" = intervalo customizado.
export type PeriodMode = '7d' | '30d' | '60d' | '90d' | 'all' | 'day' | 'range'

// Range resolvido que as queries/agregações consomem. `from`/`to` nulos quando
// o modo é "all" (sem limite) — o consumidor trata null como "sem filtro".
export interface FinPeriod {
  mode: PeriodMode
  from: string | null
  to: string | null
}

// Estado interno do seletor (preset + dia + range), separado do FinPeriod
// resolvido para o calendário manter sua própria seleção.
export interface FinPeriodState {
  mode: PeriodMode
  day: Date | undefined
  range: DateRange | undefined
}

export const DEFAULT_PERIOD_STATE: FinPeriodState = { mode: '30d', day: undefined, range: undefined }

// Formata um Date local como YYYY-MM-DD (sem toISOString → sem shift de TZ).
export function fmtDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Resolve o {from, to} (ISO) a partir do estado do seletor. Para presets de N
// dias, a janela é [hoje - (N-1), hoje], inclusiva. "all" → {null, null}.
export function resolvePeriod(state: FinPeriodState): FinPeriod {
  const today = new Date()
  switch (state.mode) {
    case 'all':
      return { mode: 'all', from: null, to: null }
    case 'day': {
      const d = state.day ?? today
      const iso = fmtDateLocal(d)
      return { mode: 'day', from: iso, to: iso }
    }
    case 'range': {
      const f = state.range?.from
      const t = state.range?.to ?? state.range?.from
      if (!f) return { mode: 'range', from: null, to: null }
      return { mode: 'range', from: fmtDateLocal(f), to: fmtDateLocal(t ?? f) }
    }
    default: {
      const days = state.mode === '7d' ? 7 : state.mode === '30d' ? 30 : state.mode === '60d' ? 60 : 90
      const from = new Date(today)
      from.setDate(from.getDate() - (days - 1))
      return { mode: state.mode, from: fmtDateLocal(from), to: fmtDateLocal(today) }
    }
  }
}

// YYYY-MM-DD → DD/MM/YYYY (string-only, sem Date → sem shift de TZ).
function fmtBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Subtítulo legível do período ativo (para a descrição do header de cada aba).
export function periodLabel(p: FinPeriod): string {
  switch (p.mode) {
    case '7d': return 'Últimos 7 dias'
    case '30d': return 'Últimos 30 dias'
    case '60d': return 'Últimos 60 dias'
    case '90d': return 'Últimos 90 dias'
    case 'all': return 'Todo o período'
    case 'day': return p.from ? `Dia ${fmtBR(p.from)}` : 'Selecione um dia'
    case 'range':
      return p.from && p.to ? `${fmtBR(p.from)} → ${fmtBR(p.to)}` : 'Selecione um intervalo'
  }
}

// Seletor: dropdown de presets + popover de calendário (dia/range conforme o
// modo). Controlado pelo pai via `value`/`onChange` (estado único compartilhado
// entre as 3 abas).
export function FinanceiroPeriodFilter({
  value, onChange,
}: { value: FinPeriodState; onChange: (next: FinPeriodState) => void }) {
  const [open, setOpen] = useState(false)
  const resolved = resolvePeriod(value)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.mode}
        onValueChange={(v) => {
          const mode = v as PeriodMode
          onChange({ ...value, mode })
          if (mode === 'day' || mode === 'range') setOpen(true)
        }}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Últimos 7 dias</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="60d">Últimos 60 dias</SelectItem>
          <SelectItem value="90d">Últimos 90 dias</SelectItem>
          <SelectItem value="all">Todo o período</SelectItem>
          <SelectItem value="day">Dia específico</SelectItem>
          <SelectItem value="range">Intervalo (de/até)</SelectItem>
        </SelectContent>
      </Select>

      {(value.mode === 'day' || value.mode === 'range') && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[210px] justify-start text-left font-normal',
                resolved.from ? '' : 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value.mode === 'day'
                ? (resolved.from ? fmtBR(resolved.from) : 'Escolher dia')
                : (resolved.from && resolved.to ? `${fmtBR(resolved.from)} → ${fmtBR(resolved.to)}` : 'Escolher intervalo')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            {value.mode === 'day' ? (
              <Calendar
                mode="single"
                selected={value.day}
                onSelect={(d) => { onChange({ ...value, day: d ?? undefined }); if (d) setOpen(false) }}
                initialFocus
              />
            ) : (
              <Calendar
                mode="range"
                selected={value.range}
                onSelect={(r) => onChange({ ...value, range: r })}
                numberOfMonths={2}
                initialFocus
              />
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
