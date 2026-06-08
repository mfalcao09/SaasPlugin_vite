import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MoreVertical } from 'lucide-react'
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
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  bot_active:    { label: 'Bot ativo',            color: 'bg-blue-500' },
  waiting_human: { label: 'Aguardando atendente', color: 'bg-yellow-500' },
  human_active:  { label: 'Em atendimento',       color: 'bg-green-500' },
  closed:        { label: 'Encerrada',             color: 'bg-slate-500' },
}

export default function ChatArea({ conversationId }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversation metadata
  useEffect(() => {
    supabase
      .from('inbox_conversations')
      .select('id,contact_phone,contact_name,status,evolution_instance_id')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => data && setConversation(data))
  }, [conversationId])

  // Load messages + realtime
  useEffect(() => {
    let ignore = false

    async function load() {
      const { data } = await supabase
        .from('inbox_messages')
        .select('id,sender_type,content,content_type,metadata,created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!ignore && data) setMessages(data)
      await supabase.rpc('reset_unread_count', { conv_id: conversationId })
    }

    load()

    const channel = supabase
      .channel(`inbox-msg-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          if (!ignore) setMessages(prev => [...prev, payload.new as InboxMessage])
        },
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Carregando...
      </div>
    )
  }

  const name = conversation.contact_name || `+${conversation.contact_phone}`
  const status = STATUS_LABELS[conversation.status] ?? { label: conversation.status, color: 'bg-slate-500' }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700">
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.map(m => {
          const isOutbound = m.sender_type === 'agent' || m.sender_type === 'bot'
          return <MessageBubble key={m.id} message={m} isOutbound={isOutbound} />
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer (textarea + attach + audio recorder) */}
      <Composer
        conversationId={conversationId}
        disabled={conversation.status === 'closed'}
        placeholder={conversation.status === 'closed' ? 'Conversa encerrada' : undefined}
      />
    </div>
  )
}
