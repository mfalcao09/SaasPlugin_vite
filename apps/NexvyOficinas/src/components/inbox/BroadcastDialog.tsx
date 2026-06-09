import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Megaphone, Loader2 } from 'lucide-react'

interface Props {
  onClose: () => void
  empresaId: string
}

interface BroadcastResult {
  sent: number
  failed: number
  errors: string[]
}

function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n,;\s]+/)
    .map(p => p.replace(/\D/g, ''))
    .filter(p => p.length >= 10 && p.length <= 15)
    .slice(0, 50)
}

export default function BroadcastDialog({ onClose, empresaId }: Props) {
  const [phonesRaw, setPhonesRaw]       = useState('')
  const [message, setMessage]           = useState('')
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<BroadcastResult | null>(null)
  const [error, setError]               = useState('')

  const phones = parsePhones(phonesRaw)
  const estimatedSeconds = Math.ceil(phones.length * 1.5)

  async function handleSend() {
    if (!phones.length || !message.trim()) {
      setError('Adicione ao menos um número e uma mensagem.')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-broadcast', {
        body: { phones, message: message.trim(), empresa_id: empresaId },
      })
      if (fnErr) throw fnErr
      setResult(data as BroadcastResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar broadcast')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-orange-400" />
              <span className="font-semibold text-white text-sm">Broadcast WhatsApp</span>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Phones */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Números de telefone
              </label>
              <textarea
                value={phonesRaw}
                onChange={e => setPhonesRaw(e.target.value)}
                disabled={loading || !!result}
                placeholder="Cole os números aqui, um por linha..."
                rows={4}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enviará para <span className="text-orange-400 font-medium">{phones.length}</span> contato{phones.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Mensagem
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={loading || !!result}
                placeholder="Digite a mensagem..."
                rows={4}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              />
            </div>

            {/* Warning */}
            <p className="text-xs text-slate-500">
              Máximo 50 contatos por envio. Um envio por dia por contato é recomendado.
            </p>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                {error}
              </p>
            )}

            {/* Loading feedback */}
            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Enviando... pode levar até {estimatedSeconds}s
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-1.5">
                {result.sent > 0 && (
                  <p className="text-xs text-green-400 font-medium">✓ {result.sent} mensagen{result.sent !== 1 ? 's' : ''} enviada{result.sent !== 1 ? 's' : ''}</p>
                )}
                {result.failed > 0 && (
                  <p className="text-xs text-red-400 font-medium">✗ {result.failed} falha{result.failed !== 1 ? 's' : ''}</p>
                )}
                {result.errors.length > 0 && (
                  <ul className="text-xs text-slate-500 space-y-0.5 max-h-20 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors disabled:opacity-50"
            >
              {result ? 'Fechar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                onClick={handleSend}
                disabled={loading || phones.length === 0 || !message.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Megaphone className="h-3.5 w-3.5" />
                    Enviar
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
