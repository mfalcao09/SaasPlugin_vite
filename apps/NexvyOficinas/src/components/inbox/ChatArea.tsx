import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Send, Bot, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Message {
  id: string
  sender_type: 'contact' | 'agent' | 'bot'
  content: string | null
  content_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'template'
  metadata: Record<string, unknown> | null
  created_at: string
}

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatArea({ conversationId }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
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
          if (!ignore) setMessages(prev => [...prev, payload.new as Message])
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

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await supabase.functions.invoke('evolution-send', {
        body: { conversation_id: conversationId, type: 'text', content: text.trim() },
      })
      setText('')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
          return (
            <div key={m.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[72%] rounded-2xl px-3 py-2 text-sm',
                  isOutbound
                    ? 'bg-orange-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-100 rounded-bl-sm',
                ].join(' ')}
              >
                {m.sender_type === 'bot' && (
                  <div className="flex items-center gap-1 mb-1 opacity-70">
                    <Bot className="h-3 w-3" />
                    <span className="text-xs">Bot</span>
                  </div>
                )}
                {m.content_type === 'image' && typeof m.metadata?.url === 'string' && (
                  <img src={m.metadata.url} alt="mídia" className="rounded-lg mb-1 max-w-full" />
                )}
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                <p className={`text-xs mt-1 ${isOutbound ? 'text-orange-200' : 'text-slate-500'} text-right`}>
                  {formatTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 flex items-center gap-2">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={conversation.status === 'closed' ? 'Conversa encerrada' : 'Digite uma mensagem... (Enter para enviar)'}
          className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
          disabled={conversation.status === 'closed'}
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim() || sending || conversation.status === 'closed'}
          size="icon"
          className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
