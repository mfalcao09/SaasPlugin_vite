import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Loader2, Send } from 'lucide-react'

interface Props {
  onClose: () => void
  empresaId: string
}

/**
 * Dialog para iniciar uma nova conversa outbound.
 * Invoca a edge function `start-conversation` para enviar a primeira mensagem.
 */
export default function NewConversationDialog({ onClose, empresaId }: Props) {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    // Adiciona DDI 55 (Brasil) se não começar com 55 e tiver 10-11 dígitos
    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
      return `55${digits}`
    }
    return digits
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const isPhoneValid = phoneDigits.length >= 10
  const isMessageValid = message.trim().length > 0
  const canSubmit = isPhoneValid && isMessageValid && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError(null)

    try {
      const normalized = normalizePhone(phone)
      const { error: fnErr } = await supabase.functions.invoke('start-conversation', {
        body: { phone: normalized, message: message.trim(), empresa_id: empresaId },
      })

      if (fnErr) {
        setError('Erro ao enviar. Tente novamente.')
        return
      }

      setSuccess(true)
      // Fechar após breve delay para mostrar o feedback
      setTimeout(() => onClose(), 1500)
    } catch {
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conv-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 id="new-conv-title" className="font-semibold text-white">
              Nova conversa
            </h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {success ? (
            <div className="py-4 text-center">
              <p className="text-green-400 font-medium">Mensagem enviada!</p>
              <p className="text-sm text-slate-400 mt-1">
                A conversa aparecerá na lista em instantes.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1" htmlFor="nc-phone">
                  Telefone
                </label>
                <input
                  id="nc-phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 91234-5678"
                  autoComplete="off"
                  disabled={loading}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                />
                {phone && !isPhoneValid && (
                  <p className="text-xs text-red-400 mt-1">
                    Informe pelo menos 10 dígitos.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1" htmlFor="nc-message">
                  Primeira mensagem
                </label>
                <textarea
                  id="nc-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Olá! Tudo bem?"
                  rows={3}
                  disabled={loading}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                  {loading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
