import { CornerDownLeft, X } from 'lucide-react'
import type { InboxMessage } from '../messages/MessageBubble'

interface Props {
  replyingTo: InboxMessage
  onCancel: () => void
}

function senderLabel(senderType: InboxMessage['sender_type']): string {
  if (senderType === 'contact') return 'Contato'
  if (senderType === 'bot') return 'Bot'
  return 'Agente'
}

export default function ReplyPreviewBar({ replyingTo, onCancel }: Props) {
  const preview = (replyingTo.content ?? '[mídia]').slice(0, 60)

  return (
    <div className="flex items-start gap-2 bg-slate-800 border-l-2 border-orange-500 rounded-t px-3 py-1.5">
      <CornerDownLeft className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-orange-400 mb-0.5">
          {senderLabel(replyingTo.sender_type)}
        </p>
        <p className="text-xs text-slate-400 truncate">{preview}</p>
      </div>
      <button
        onClick={onCancel}
        className="text-slate-500 hover:text-white transition-colors shrink-0"
        aria-label="Cancelar resposta"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
