import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { X, Loader2, ArrowRightLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Operator {
  user_id: string
}

interface Props {
  conversationId: string
  onClose: () => void
}

export default function TransferConversationDialog({ conversationId, onClose }: Props) {
  const { empresaId } = useAuth()
  const [operators, setOperators] = useState<Operator[]>([])
  const [loadingOps, setLoadingOps] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('empresa_users')
      .select('user_id')
      .eq('empresa_id', empresaId)
      .then(({ data: rows }) => {
        if (rows) setOperators(rows)
        setLoadingOps(false)
      })
  }, [empresaId])

  async function handleTransfer() {
    if (!selectedId || transferring) return
    setTransferring(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('transfer_conversation', {
        conv_id: conversationId,
        new_operator_id: selectedId,
      })
      if (rpcError) throw rpcError
      setDone(true)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir conversa')
      setTransferring(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
            <ArrowRightLeft className="h-4 w-4 text-orange-400 shrink-0" />
            <h2 id="transfer-dialog-title" className="flex-1 font-semibold text-white text-sm">
              Transferir conversa
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4">
            {done ? (
              <div className="flex flex-col items-center gap-2 py-4 text-green-400">
                <Check className="h-8 w-8" />
                <p className="text-sm font-medium">Conversa transferida!</p>
              </div>
            ) : loadingOps ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : operators.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum operador disponível.</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">Selecione o operador:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {operators.map(op => {
                    const isSelected = op.user_id === selectedId
                    const shortId = op.user_id.slice(0, 8)
                    return (
                      <button
                        key={op.user_id}
                        onClick={() => setSelectedId(op.user_id)}
                        className={[
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          isSelected
                            ? 'bg-orange-600/20 border border-orange-500/50'
                            : 'hover:bg-slate-700 border border-transparent',
                        ].join(' ')}
                      >
                        <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                          {shortId[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-300 font-mono truncate">{shortId}…</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-orange-400 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              </>
            )}
          </div>

          {/* Footer */}
          {!done && (
            <div className="flex gap-2 px-4 pb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="flex-1 text-slate-300 hover:text-white hover:bg-slate-700"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleTransfer}
                disabled={!selectedId || transferring}
                className="flex-1 bg-orange-600 hover:bg-orange-500 text-white"
              >
                {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Transferir'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
