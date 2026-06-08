import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Loader2, MoreVertical, PhoneOff, ArrowRightLeft, Search, Bell, BellOff, Bot, BotOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import MessageBubble, { type InboxMessage } from './messages/MessageBubble'
import Composer from './composer/Composer'
import AcceptTicketBar from './AcceptTicketBar'
import TransferConversationDialog from './TransferConversationDialog'
import MessageSearchBar from './MessageSearchBar'
import { useInboxNotifications } from '@/hooks/useInboxNotifications'

interface Conversation {
  id: string
  contact_phone: string
  contact_name: string | null
  status: string
  evolution_instance_id: string
  bot_paused: boolean
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
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  // F2 — reply
  const [replyingTo, setReplyingTo] = useState<InboxMessage | null>(null)
  // F4 — notificações
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('inbox_notifications_v1') === 'true'
  )
  // F5 — search
  const [searchOpen, setSearchOpen] = useState(false)
  // F6 — bot pause (estado local otimista)
  const [botPaused, setBotPaused] = useState(false)

  const messagesEndRef      = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef      = useRef<HTMLDivElement>(null)

  // Cursor = created_at da mensagem mais antiga já carregada
  const cursorRef = useRef<string | null>(null)
  // Scroll-restore: guarda scrollHeight antes do prepend; useLayoutEffect aplica após DOM update
  const pendingScrollRestoreRef = useRef<number | null>(null)
  // Controla scroll automático: apenas na carga inicial e quando usuário está próximo do fim
  const isFirstLoadRef = useRef(true)

  // ── Carregar metadata da conversa + subscribe realtime ───────────────────
  useEffect(() => {
    let ignore = false

    supabase
      .from('inbox_conversations')
      .select('id,contact_phone,contact_name,status,evolution_instance_id,bot_paused')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => {
        if (!ignore && data) {
          setConversation(data)
          setBotPaused(data.bot_paused ?? false)
        }
      })

    // Realtime: status pode mudar (accept, close, transfer)
    const convChannel = supabase
      .channel(`inbox-conv-detail-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inbox_conversations', filter: `id=eq.${conversationId}` },
        payload => {
          if (!ignore) {
            const updated = payload.new as Conversation
            setConversation(prev => prev ? { ...prev, ...updated } : prev)
            if (typeof updated.bot_paused === 'boolean') setBotPaused(updated.bot_paused)
          }
        },
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(convChannel)
    }
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
        .select('id,sender_type,content,content_type,metadata,created_at,is_deleted,delivery_status,reply_to_message_id')
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
      .select('id,sender_type,content,content_type,metadata,created_at,is_deleted,delivery_status,reply_to_message_id')
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

  // ── Encerrar conversa ─────────────────────────────────────────────────────
  async function handleClose() {
    if (closing) return
    setClosing(true)
    try {
      await supabase.rpc('close_conversation', { conv_id: conversationId })
      setShowCloseModal(false)
    } finally {
      setClosing(false)
    }
  }

  // ── F6 — Bot toggle ───────────────────────────────────────────────────────
  async function handleBotToggle() {
    const next = !botPaused
    setBotPaused(next)  // otimista
    const { error } = await supabase
      .from('inbox_conversations')
      .update({ bot_paused: next })
      .eq('id', conversationId)
    if (error) setBotPaused(!next)  // reverte em erro
  }

  // ── F4 — Notificações toggle ─────────────────────────────────────────────
  function handleNotificationsToggle() {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    localStorage.setItem('inbox_notifications_v1', next ? 'true' : 'false')
  }

  // ── F5 — Scroll para mensagem por id ─────────────────────────────────────
  function handleScrollTo(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ── F4 — Hook de notificações ────────────────────────────────────────────
  // (deve ficar após todos os hooks/state para não violar rules of hooks)
  useInboxNotifications({
    conversationId,
    enabled: notificationsEnabled,
  })

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
  const isClosed = conversation.status === 'closed'

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700 relative">
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

        {/* F6 — Bot toggle */}
        <button
          onClick={handleBotToggle}
          className={`p-1 rounded transition-colors shrink-0 ${botPaused ? 'text-amber-400 hover:text-amber-300' : 'text-green-400 hover:text-green-300'}`}
          title={botPaused ? 'Bot pausado — clique para reativar' : 'Bot ativo — clique para pausar'}
        >
          {botPaused ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </button>

        {/* F4 — Bell toggle */}
        <button
          onClick={handleNotificationsToggle}
          className="p-1 rounded text-slate-400 hover:text-white transition-colors shrink-0"
          title={notificationsEnabled ? 'Notificações ativas' : 'Notificações desativadas'}
        >
          {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>

        {/* F5 — Search toggle */}
        <button
          onClick={() => setSearchOpen(prev => !prev)}
          className={`p-1 rounded transition-colors shrink-0 ${searchOpen ? 'text-orange-400' : 'text-slate-400 hover:text-white'}`}
          title="Pesquisar mensagens"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Botão Encerrar */}
        {!isClosed && (
          <button
            onClick={() => setShowCloseModal(true)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0"
            title="Encerrar conversa"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Encerrar</span>
          </button>
        )}

        {/* More menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMoreMenu(prev => !prev)}
            className="text-slate-400 hover:text-white p-1 rounded"
            aria-label="Mais opções"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full mt-1 z-20 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[160px]">
                <button
                  onClick={() => { setShowMoreMenu(false); setShowTransferDialog(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <ArrowRightLeft className="h-4 w-4 text-orange-400" />
                  Transferir conversa
                </button>
                {!isClosed && (
                  <button
                    onClick={() => { setShowMoreMenu(false); setShowCloseModal(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Encerrar conversa
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* AcceptTicketBar */}
      {conversation.status === 'waiting_human' && (
        <AcceptTicketBar conversationId={conversationId} />
      )}

      {/* F5 — Search bar */}
      {searchOpen && (
        <MessageSearchBar
          messages={messages}
          onClose={() => setSearchOpen(false)}
          onScrollTo={handleScrollTo}
        />
      )}

      {/* Modal encerrar */}
      {showCloseModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowCloseModal(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-sm p-5">
              <h3 className="font-semibold text-white mb-2">Encerrar conversa?</h3>
              <p className="text-sm text-slate-400 mb-5">
                A conversa será marcada como encerrada. O histórico é preservado.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                >
                  {closing ? 'Encerrando...' : 'Encerrar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Transfer Dialog */}
      {showTransferDialog && (
        <TransferConversationDialog
          conversationId={conversationId}
          onClose={() => setShowTransferDialog(false)}
        />
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
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
            allMessages={messages}
            onReply={isClosed ? undefined : setReplyingTo}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <Composer
        conversationId={conversationId}
        disabled={conversation.status === 'closed'}
        placeholder={conversation.status === 'closed' ? 'Conversa encerrada' : undefined}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  )
}
