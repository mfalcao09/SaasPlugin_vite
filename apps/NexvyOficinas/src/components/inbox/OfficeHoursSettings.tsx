import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Save } from 'lucide-react'

interface Props {
  empresaId: string
}

interface DayConfig {
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const DEFAULT_CONFIG = (): DayConfig[] =>
  Array.from({ length: 7 }, (_, i) => ({
    dia_semana: i,
    hora_inicio: '09:00',
    hora_fim: '18:00',
    ativo: i >= 1 && i <= 5, // Seg–Sex ativo por padrão
  }))

export default function OfficeHoursSettings({ empresaId }: Props) {
  const [days, setDays]         = useState<DayConfig[]>(DEFAULT_CONFIG())
  const [outMsg, setOutMsg]     = useState('Olá! Nosso atendimento funciona em horário comercial. Em breve retornaremos! 🕐')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    let ignore = false

    async function load() {
      const [{ data: hours }, { data: empresa }] = await Promise.all([
        supabase
          .from('inbox_office_hours')
          .select('dia_semana,hora_inicio,hora_fim,ativo')
          .eq('empresa_id', empresaId),
        supabase
          .from('empresas')
          .select('inbox_out_of_hours_message')
          .eq('id', empresaId)
          .single(),
      ])

      if (!ignore) {
        if (hours && hours.length > 0) {
          setDays(prev => prev.map(d => {
            const found = hours.find(h => h.dia_semana === d.dia_semana)
            return found ? {
              dia_semana: d.dia_semana,
              hora_inicio: (found.hora_inicio as string).slice(0, 5),
              hora_fim:    (found.hora_fim as string).slice(0, 5),
              ativo:       found.ativo as boolean,
            } : d
          }))
        }
        if (empresa?.inbox_out_of_hours_message) {
          setOutMsg(empresa.inbox_out_of_hours_message)
        }
        setLoading(false)
      }
    }

    load()
    return () => { ignore = true }
  }, [empresaId])

  function updateDay(index: number, field: keyof DayConfig, value: string | boolean) {
    setDays(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      // UPSERT todos os 7 dias
      await supabase.from('inbox_office_hours').upsert(
        days.map(d => ({ ...d, empresa_id: empresaId })),
        { onConflict: 'empresa_id,dia_semana' },
      )
      // Salvar mensagem fora do horário
      await supabase.from('empresas').update({ inbox_out_of_hours_message: outMsg }).eq('id', empresaId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Horário de Atendimento</h3>
        <p className="text-xs text-slate-400">Fora do horário, uma mensagem automática é enviada ao contato.</p>
      </div>

      {/* Dias */}
      <div className="space-y-2">
        {days.map((day, i) => (
          <div key={day.dia_semana} className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
            {/* Toggle ativo */}
            <button
              onClick={() => updateDay(i, 'ativo', !day.ativo)}
              className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${day.ativo ? 'bg-orange-500' : 'bg-slate-600'}`}
              aria-label={`${day.ativo ? 'Desativar' : 'Ativar'} ${DAY_LABELS[day.dia_semana]}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${day.ativo ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>

            {/* Label */}
            <span className={`text-xs font-medium w-14 shrink-0 ${day.ativo ? 'text-white' : 'text-slate-500'}`}>
              {DAY_LABELS[day.dia_semana]}
            </span>

            {/* Horários */}
            <input
              type="time"
              value={day.hora_inicio}
              onChange={e => updateDay(i, 'hora_inicio', e.target.value)}
              disabled={!day.ativo}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <span className="text-xs text-slate-500">até</span>
            <input
              type="time"
              value={day.hora_fim}
              onChange={e => updateDay(i, 'hora_fim', e.target.value)}
              disabled={!day.ativo}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        ))}
      </div>

      {/* Mensagem fora do horário */}
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          Mensagem fora do horário
        </label>
        <textarea
          value={outMsg}
          onChange={e => setOutMsg(e.target.value)}
          rows={3}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Botão salvar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar horários'}
      </button>
    </div>
  )
}
