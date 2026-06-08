import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Loader2, MoreVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import MessageBubble, { type InboxMessage } from './messages/MessageBubble'
import Composer from './composer/Composer'

interface Conversation {
  id: string
  contact_phone: string
  contact_name: string | null
  status: string
  evolution_instance_id: string
}

interface Props {
  conversationId: string
  /** Mobile: callback para voltar à lista de conversas */
  onBack?: () => void
}

const PAGE_SIZE = 100

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  bot_active:    { label: 'Bot ativo',            color: 'bg-blue-500' },
  waiting_human: { label: 'Aguardando atendente', color: 'bg-yellow-500' },
  human_active:  { label: 'Em atendimento',       color: 'bg-green-500' },
  closed:        { label: 'Encerrada',             color: 'bg-slate-500' },
}

export default function ChatArea({ conversationId, onBack }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const messagesEndRef      = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef      = useRef<HTMLDivElement>(null)

  // Cursor = created_at da mensagem mais antiga já carregada
  const cursorRef = useRef<string | null>(null)
  // Scroll-restore: guarda scrollHeight antes do prepend; useLayoutEffect aplica após DOM update
  const pendingScrollRestoreRef = useRef<number | null>(null)
  // Controla scroll automático: apenas na carga inicial e quando usuário está próximo do fim
  const isFirstLoadRef = useRef(true)

  // ── Carregar metadata da conversa ────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('inbox_conversations')
      .select('id,contact_phone,contact_name,status,evolution_instance_id')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => data && setConversation(data))
  }, [conversationId])

  // ── Carregar mensagens iniciais + subscribe realtime ──────────────────────
  useEffect(() => {
    let ignore = false

    // Reset ao trocar de conversa
    setMessages([])
    setHasMore(false)
    cursorRef.current = null
    isFirstLoadRef.current = true

    async function load() {
      // Busca as 100 mais recentes em ordem DESC, depois inverte para exibição
      const { data } = await supabase
        .from('inbox_messages')
        .select('id,sender_type,content,content_type,metadata,created_at,is_deleted')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (!ignore && data) {
        const ordered = [...data].reverse()           // mais antiga no topo
        setMessages(ordered)
        setHasMore(data.length === PAGE_SIZE)
        cursorRef.current = ordered[0]?.created_at ?? null
      }
      // Zera contador de não lidas ao abrir conversa
      await supabase.rpc('reset_unread_count', { conv_id: conversationId })
    }

    load()

    // INSERT → nova mensagem chega em tempo real
    // UPDATE → is_deleted muda quando contato apaga mensagem
    const channel = supabase
      .channel(`inbox-msg-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          if (!ignore) setMessages(prev => [...prev, payload.new as InboxMessage])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inbox_messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          if (!ignore) {
            setMessages(prev =>
              prev.map(m => m.id === (payload.new as InboxMessage).id
                ? { ...m, ...(payload.new as InboxMessage) }
                : m,
              ),
            )
          }
        },
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // ── Scroll automático (carga inicial = instant; nova mensagem = smooth) ───
  useEffect(() => {
    if (messages.length === 0) return

    if (isFirstLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isFirstLoadRef.current = false
      return
    }

    // Auto-scroll só se operador está perto do final (< 200px do rodapé)
    const container = messagesContainerRef.current
    if (container) {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
      if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Restauração de scroll após prepend (useLayoutEffect = antes do paint) ─
  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current !== null && messagesContainerRef.current) {
      const container = messagesContainerRef.current
      container.scrollTop = container.scrollHeight - pendingScrollRestoreRef.current
      pendingScrollRestoreRef.current = null
    }
  }, [messages])

  // ── Carregar mensagens mais antigas (paginação scroll-up) ─────────────────
  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore || !hasMore) return
    setLoadingMore(true)

    // Salva scrollHeight ANTES do prepend; useLayoutEffect restaura depois
    pendingScrollRestoreRef.current = messagesContainerRef.current?.scrollHeight ?? 0

    const { data } = await supabase
      .from('inbox_messages')
      .select('id,sender_type,content,content_type,metadata,created_at,is_deleted')
      .eq('conversation_id', conversationId)
      .lt('created_at', cursorRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (data && data.length > 0) {
      const older = [...data].reverse()
      cursorRef.current = older[0].created_at       // novo cursor = mais antiga carregada
      setHasMore(data.length === PAGE_SIZE)
      setMessages(prev => [...older, ...prev])
    } else {
      setHasMore(false)
      pendingScrollRestoreRef.current = null         // nada a restaurar
    }

    setLoadingMore(false)
  }, [conversationId, loadingMore, hasMore])

  // Ref estável para o observer chamar sempre a versão mais atual de loadMore
  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])

  // ── IntersectionObserver no sentinel do topo ──────────────────────────────
  useEffect(() => {
    if (!hasMore) return
    const sentinel  = topSentinelRef.current
    const container = messagesContainerRef.current
    if (!sentinel || !container) return

    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { root: container, threshold: 0 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasMore]) // recria apenas quando hasMore muda (ex: true → false ao esgotar)

  // ────────────────────────────────────────────────────────────────────────
  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Carregando...
      </div>
    )
  }

  const name   = conversation.contact_name || `+${conversation.contact_phone}`
  const status = STATUS_LABELS[conversation.status] ?? { label: conversation.status, color: 'bg-slate-500' }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700">
        {/* Botão back — só renderiza em mobile quando onBack é fornecido */}
        {onBack && (
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white p-1 rounded -ml-1 shrink-0"
            aria-label="Voltar para conversas"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {name[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{name}</p>
          <p className="text-xs text-slate-400">+{conversation.contact_phone}</p>
        </div>
        <Badge className={`${status.color} text-white text-xs shrink-0`}>{status.label}</Badge>
        <button className="text-slate-400 hover:text-white p-1 rounded">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {/* Sentinel invisível no topo — disparado pelo IntersectionObserver */}
        <div ref={topSentinelRef} className="h-1" />

        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          </div>
        )}

        {messages.map(m => (
          <MessageBubble
            key={m.id}
            message={m}
            isOutbound={m.sender_type === 'agent' || m.sender_type === 'bot'}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <Composer
        conversationId={conversationId}
        disabled={conversation.status === 'closed'}
        placeholder={conversation.status === 'closed' ? 'Conversa encerrada' : undefined}
      />
    </div>
  )
}
