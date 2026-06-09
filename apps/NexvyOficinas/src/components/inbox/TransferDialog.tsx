// Sprint8 F3 — Transferência de conversa entre agentes
// Exibe agentes disponíveis (inbox_available = true) com contagem de conversas ativas
// Loga motivo e transferred_from em inbox_assign_log
// Dispara notificação tipo 'transfer' para o agente receptor

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { X, Loader2, ArrowRightLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AgentInfo {
  user_id: string
  activeCount: number
}

interface Props {
  conversationId: string
  empresaId: string
  currentAssignedId?: string | null
  onClose: () => void
}

export default function TransferDialog({ conversationId, empresaId, currentAssignedId, onClose }: Props) {
  const { user } = useAuth()
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) return

    async function loadAgents() {
      // Busca agentes disponíveis, excluindo o atribuído atual
      const { data: euRows } = await supabase
        .from('empresa_users')
        .select('user_id')
        .eq('empresa_id', empresaId)
        .eq('inbox_available', true)

      if (!euRows || euRows.length === 0) {
        setLoading(false)
        return
      }

      // Para cada agente, busca contagem de conversas ativas
      const agentList: AgentInfo[] = await Promise.all(
        euRows
          .filter(r => r.user_id !== currentAssignedId)
          .map(async r => {
            const { count } = await supabase
              .from('inbox_conversations')
              .select('id', { count: 'exact', head: true })
              .eq('assigned_user_id', r.user_id)
              .neq('status', 'closed')
            return { user_id: r.user_id, activeCount: count ?? 0 }
          })
      )

      // Ordena por menor carga
      agentList.sort((a, b) => a.activeCount - b.activeCount)
      setAgents(agentList)
      setLoading(false)
    }

    loadAgents()
  }, [empresaId, currentAssignedId])

  async function handleTransfer() {
    if (!selectedId || transferring) return
    setTransferring(true)
    setError(null)
    try {
      // UPDATE conversa com novo assigned_user_id
      const { error: updateErr } = await supabase
        .from('inbox_conversations')
        .update({ assigned_user_id: selectedId, status: 'human_active' })
        .eq('id', conversationId)
      if (updateErr) throw updateErr

      // INSERT log com transferred_from e reason
      await supabase.from('inbox_assign_log').insert({
        empresa_id: empresaId,
        conversation_id: conversationId,
        assigned_to: selectedId,
        assigned_at: new Date().toISOString(),
        transferred_from: user?.id ?? null,
        reason: reason.trim() || null,
      })

      // INSERT notificação para o agente receptor (Sprint8 F5)
      await supabase.from('inbox_agent_notifications').insert({
        empresa_id: empresaId,
        user_id: selectedId,
        type: 'transfer',
        content: `Conversa transferida para você${reason.trim() ? `: ${reason.trim()}` : ''}`,
        conversation_id: conversationId,
      })

      setDone(true)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir conversa')
      setTransferring(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />
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
          <div className="p-4 space-y-3">
            {done ? (
              <div className="flex flex-col items-center gap-2 py-4 text-green-400">
                <Check className="h-8 w-8" />
                <p className="text-sm font-medium">Conversa transferida!</p>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                Nenhum agente disponível para transferência.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400">Selecione o agente:</p>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {agents.map(ag => {
                    const isSelected = ag.user_id === selectedId
                    const shortId = ag.user_id.slice(0, 8)
                    return (
                      <button
                        key={ag.user_id}
                        onClick={() => setSelectedId(ag.user_id)}
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
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          ag.activeCount === 0
                            ? 'bg-green-500/20 text-green-400'
                            : ag.activeCount < 5
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}>
                          {ag.activeCount} ativas
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-orange-400 shrink-0" />}
                      </button>
                    )
                  })}
                </div>

                {/* Campo de motivo */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Motivo (opcional)</label>
                  <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Ex: Especialidade do agente, ausência..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}
              </>
            )}
          </div>

          {/* Footer */}
          {!done && !loading && agents.length > 0 && (
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
                {transferring
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : 'Transferir'
                }
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
