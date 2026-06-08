import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { MessageCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Conversation {
  id: string
  contact_phone: string
  contact_name: string | null
  status: string
  last_message_content: string | null
  last_message_sender_type: string | null
  last_message_at: string | null
  unread_count: number
}

type TabKey = 'all' | 'waiting_human' | 'human_active' | 'closed'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',           label: 'Todos' },
  { key: 'waiting_human', label: 'Aguardando' },
  { key: 'human_active',  label: 'Atendendo' },
  { key: 'closed',        label: 'Encerrado' },
]

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function ConversationList({ selectedId, onSelect }: Props) {
  const { empresaId } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  useEffect(() => {
    if (!empresaId) return
    let ignore = false

    async function load() {
      const { data } = await supabase
        .from('inbox_conversations')
        .select('id,contact_phone,contact_name,status,last_message_content,last_message_sender_type,last_message_at,unread_count')
        .eq('empresa_id', empresaId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (!ignore && data) setConversations(data)
    }

    load()

    const channel = supabase
      .channel(`inbox-conv-${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_conversations', filter: `empresa_id=eq.${empresaId}` },
        () => load(),
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [empresaId])

  // Contagens por aba
  const counts: Record<TabKey, number> = {
    all:           conversations.length,
    waiting_human: conversations.filter(c => c.status === 'waiting_human').length,
    human_active:  conversations.filter(c => c.status === 'human_active').length,
    closed:        conversations.filter(c => c.status === 'closed').length,
  }

  const filtered = conversations.filter(c => {
    // Filtro por aba
    if (activeTab !== 'all' && c.status !== activeTab) return false
    // Filtro por busca
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.contact_phone.includes(q) ||
      (c.contact_name ?? '').toLowerCase().includes(q)
    )
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="h-5 w-5 text-orange-400" />
          <span className="font-semibold text-white">WhatsApp</span>
          {totalUnread > 0 && (
            <Badge className="ml-auto bg-orange-600 text-white text-xs">
              {totalUnread}
            </Badge>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contato..."
            className="pl-8 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 h-8 text-sm"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex border-b border-slate-700 bg-slate-900 shrink-0">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const count = counts[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-orange-400 border-b-2 border-orange-500 -mb-px'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={[
                    'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center font-bold',
                    isActive ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 text-sm px-4 text-center">
            <MessageCircle className="h-10 w-10 opacity-30" />
            {conversations.length === 0 ? (
              <>
                <p>Nenhuma conversa ainda.</p>
                <p className="text-xs">Configure uma instância WhatsApp em Configurações → Inbox.</p>
              </>
            ) : (
              <p>Nenhuma conversa nesta aba.</p>
            )}
          </div>
        )}
        {filtered.map(c => {
          const active = c.id === selectedId
          const name = c.contact_name || `+${c.contact_phone}`
          const preview = c.last_message_content
            ? (c.last_message_sender_type === 'agent' ? 'Você: ' : '') + c.last_message_content
            : 'Sem mensagens'
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={[
                'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                active
                  ? 'bg-orange-600/20 border-l-2 border-orange-500'
                  : 'hover:bg-slate-800 border-l-2 border-transparent',
              ].join(' ')}
            >
              <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-sm font-bold text-white">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-sm text-white truncate">{name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="text-xs text-slate-400 truncate">{preview}</p>
                  {c.unread_count > 0 && (
                    <span className="h-5 min-w-5 px-1 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center shrink-0">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
