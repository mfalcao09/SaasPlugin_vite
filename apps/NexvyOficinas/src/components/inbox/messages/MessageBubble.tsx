import { Bot, StickyNote } from 'lucide-react'
import ImageBubble from './ImageBubble'
import AudioBubble from './AudioBubble'
import VideoBubble from './VideoBubble'
import DocumentBubble from './DocumentBubble'
import StickerBubble from './StickerBubble'

/** Interface compartilhada de mensagem do inbox (lida de inbox_messages) */
export interface InboxMessage {
  id: string
  sender_type: 'contact' | 'agent' | 'bot'
  content: string | null
  content_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'template'
  metadata: Record<string, unknown> | null
  created_at: string
  /** True quando o remetente apagou a mensagem no WhatsApp. Soft-delete. */
  is_deleted?: boolean
}

interface Props {
  message: InboxMessage
  isOutbound: boolean
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function metaString(meta: Record<string, unknown> | null, key: string): string | undefined {
  const v = meta?.[key]
  return typeof v === 'string' ? v : undefined
}
function metaNumber(meta: Record<string, unknown> | null, key: string): number | undefined {
  const v = meta?.[key]
  return typeof v === 'number' ? v : undefined
}

export default function MessageBubble({ message, isOutbound }: Props) {
  const time = formatTime(message.created_at)
  const url = metaString(message.metadata, 'url')
  const mime = metaString(message.metadata, 'mime')
  const name = metaString(message.metadata, 'name')
  const size = metaNumber(message.metadata, 'size')
  const duration = metaNumber(message.metadata, 'duration')
  const isInternal = message.metadata?.is_internal === true

  // ── Nota interna — visual amber, centralizada no chat (não outbound/inbound) ──
  if (isInternal) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-xl px-3 py-2 text-sm bg-amber-900/40 border border-amber-700/50">
          <div className="flex items-center gap-1.5 mb-1 text-amber-400">
            <StickyNote className="h-3 w-3" />
            <span className="text-xs font-medium">Nota interna</span>
          </div>
          <p className="text-amber-100 whitespace-pre-wrap break-words">{message.content}</p>
          <p className="text-xs mt-1 text-amber-400/60 text-right">{time}</p>
        </div>
      </div>
    )
  }

  // Stickers NÃO usam chrome de bubble — render direto
  // Quando apagado: wrapper com opacity-50 + indicador de apagamento abaixo
  if (message.content_type === 'sticker' && url) {
    return (
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div className={message.is_deleted ? 'opacity-50' : ''}>
          <StickerBubble url={url} time={time} />
          {message.is_deleted && (
            <p className="text-xs italic mt-0.5 text-slate-400 text-center">
              🚫 Esta mensagem foi apagada
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[72%] rounded-2xl px-3 py-2 text-sm transition-opacity',
          // Transparência quando apagada — diferencia visualmente das mensagens ativas
          message.is_deleted ? 'opacity-50' : '',
          isOutbound
            ? 'bg-orange-600 text-white rounded-br-sm'
            : 'bg-slate-800 text-slate-100 rounded-bl-sm',
        ].join(' ')}
      >
        {message.sender_type === 'bot' && (
          <div className="flex items-center gap-1 mb-1 opacity-70">
            <Bot className="h-3 w-3" />
            <span className="text-xs">Bot</span>
          </div>
        )}

        {message.content_type === 'image' && url && (
          <ImageBubble url={url} caption={message.content} />
        )}
        {message.content_type === 'audio' && url && (
          <AudioBubble url={url} duration={duration} isOutbound={isOutbound} />
        )}
        {message.content_type === 'video' && url && (
          <VideoBubble url={url} caption={message.content} />
        )}
        {message.content_type === 'document' && url && (
          <DocumentBubble url={url} name={name} size={size} mime={mime} isOutbound={isOutbound} />
        )}

        {message.content_type === 'text' && message.content && (
          // Tachado quando apagada — conteúdo original permanece visível para contexto
          <p className={`whitespace-pre-wrap break-words ${message.is_deleted ? 'line-through' : ''}`}>
            {message.content}
          </p>
        )}

        {!['text', 'image', 'audio', 'video', 'document', 'sticker'].includes(message.content_type) && (
          <p className={`italic opacity-70 ${message.is_deleted ? 'line-through' : ''}`}>
            [{message.content_type}] {message.content ?? 'mensagem não suportada'}
          </p>
        )}

        {/* Indicador de apagamento — dentro do bubble, abaixo do conteúdo, texto menor */}
        {message.is_deleted && (
          <p className={`text-xs italic mt-1 ${isOutbound ? 'text-orange-200/60' : 'text-slate-400'}`}>
            🚫 Esta mensagem foi apagada
          </p>
        )}

        <p className={`text-xs mt-1 ${isOutbound ? 'text-orange-200' : 'text-slate-500'} text-right`}>
          {time}
        </p>
      </div>
    </div>
  )
}
