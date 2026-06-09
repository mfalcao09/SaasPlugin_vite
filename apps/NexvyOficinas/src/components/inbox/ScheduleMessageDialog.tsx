import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Clock, X, Loader2, CalendarCheck } from 'lucide-react'

interface Props {
  conversationId: string
  onClose: () => void
  onScheduled?: () => void
}

function minDateTimeLocal(): string {
  // Mínimo: agora + 5 minutos, formato YYYY-MM-DDTHH:mm para input datetime-local
  const d = new Date(Date.now() + 5 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ScheduleMessageDialog({ conversationId, onClose, onScheduled }: Props) {
  const { empresaId, user } = useAuth()
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const minDt = minDateTimeLocal()

  async function handleAgendar() {
    if (!content.trim() || !scheduledAt || scheduling) return
    if (!empresaId) { setError('Empresa não identificada'); return }

    // Validar: data >= agora + 4min (margem de tolerância)
    const selected = new Date(scheduledAt).getTime()
    if (selected < Date.now() + 4 * 60 * 1000) {
      setError('Agende com pelo menos 5 minutos de antecedência.')
      return
    }

    setScheduling(true)
    setError(null)
    try {
      const { error: insertErr } = await supabase
        .from('inbox_scheduled_messages')
        .insert({
          empresa_id: empresaId,
          conversation_id: conversationId,
          content: content.trim(),
          scheduled_at: new Date(scheduledAt).toISOString(),
          created_by: user?.id ?? null,
        })

      if (insertErr) {
        setError(insertErr.message)
        return
      }

      onScheduled?.()
      onClose()
    } finally {
      setScheduling(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agendar mensagem"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <h2 className="font-semibold text-white text-sm">Agendar Mensagem</h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Mensagem */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Mensagem
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Digite a mensagem a ser enviada..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
              />
            </div>

            {/* Data e hora */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Data e hora do envio
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={minDt}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500 [color-scheme:dark]"
              />
              <p className="text-xs text-slate-500 mt-1">Mínimo: 5 minutos a partir de agora</p>
            </div>

            {/* Erro */}
            {error && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-700/40 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 pb-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAgendar}
              disabled={!content.trim() || !scheduledAt || scheduling}
              className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {scheduling ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Agendando...</>
              ) : (
                <><CalendarCheck className="h-3.5 w-3.5" /> Agendar</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
