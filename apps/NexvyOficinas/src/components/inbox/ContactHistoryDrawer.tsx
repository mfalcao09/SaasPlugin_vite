import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface PastConversation {
  id: string
  status: string
  created_at: string
  last_message_content: string | null
}

interface Props {
  phone: string
  currentConversationId: string
  onClose: () => void
  onSelectConversation: (id: string) => void
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  bot_active:    { label: 'Bot ativo',         color: 'bg-blue-500' },
  waiting_human: { label: 'Aguardando',         color: 'bg-yellow-500' },
  human_active:  { label: 'Em atendimento',     color: 'bg-green-500' },
  closed:        { label: 'Encerrada',          color: 'bg-slate-500' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function ContactHistoryDrawer({
  phone,
  currentConversationId,
  onClose,
  onSelectConversation,
}: Props) {
  const [conversations, setConversations] = useState<PastConversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)

    supabase
      .from('inbox_conversations')
      .select('id,status,created_at,last_message_content')
      .eq('contact_phone', phone)
      .neq('id', currentConversationId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!ignore && data) setConversations(data)
        if (!ignore) setLoading(false)
      })

    return () => { ignore = true }
  }, [phone, currentConversationId])

  return (
    <div className="fixed inset-y-0 right-0 w-72 bg-slate-900 border-l border-slate-700 z-30 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Histórico</p>
          <p className="text-xs text-slate-400 truncate">+{phone}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label="Fechar histórico"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Carregando...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm px-4 text-center">
            Sem conversas anteriores
          </div>
        ) : (
          conversations.map(conv => {
            const s = STATUS_LABELS[conv.status] ?? { label: conv.status, color: 'bg-slate-500' }
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="w-full flex flex-col gap-1.5 px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">{formatDate(conv.created_at)}</span>
                  <span className={`${s.color} text-white text-[9px] px-1.5 py-0.5 rounded-full leading-tight shrink-0`}>
                    {s.label}
                  </span>
                </div>
                <p className="text-xs text-slate-300 truncate">
                  {conv.last_message_content?.slice(0, 50) || 'Sem mensagens'}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
