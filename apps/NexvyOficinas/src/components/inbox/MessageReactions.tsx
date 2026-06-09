import { useState } from 'react'
import { useMessageReactions } from '@/hooks/useMessageReactions'
import { Plus } from 'lucide-react'

interface Props {
  messageId: string
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢'] as const

/**
 * Exibe as reações de uma mensagem e permite adicionar/remover via picker.
 *
 * - Badges por emoji com contagem (clicável = toggle)
 * - Botão "+" abre picker flutuante com os 6 emojis fixos
 * - reactedByMe determina o ring de destaque (orange-500)
 */
export default function MessageReactions({ messageId }: Props) {
  const { reactions, addReaction } = useMessageReactions({ messageId })
  const [pickerOpen, setPickerOpen] = useState(false)

  function handleEmojiClick(emoji: string) {
    setPickerOpen(false)
    addReaction(emoji)
  }

  const hasReactions = reactions.length > 0

  // Quando não há reações: botão "+" aparece no group-hover da bubble
  if (!hasReactions && !pickerOpen) {
    return (
      <div className="relative">
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs p-0.5 rounded transition-all"
          title="Adicionar reação"
          aria-label="Adicionar reação"
        >
          <Plus className="h-3 w-3" />
        </button>
        {pickerOpen && (
          <EmojiPicker onSelect={handleEmojiClick} onClose={() => setPickerOpen(false)} />
        )}
      </div>
    )
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1 mt-1">
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => addReaction(r.emoji)}
          className={[
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-700/80 hover:bg-slate-600/80 transition-colors',
            r.reactedByMe ? 'ring-1 ring-orange-500' : '',
          ].join(' ')}
          title={r.reactedByMe ? 'Remover reação' : 'Reagir'}
        >
          <span>{r.emoji}</span>
          <span className="text-slate-300 font-medium">{r.count}</span>
        </button>
      ))}

      {/* Botão para adicionar mais reações */}
      <button
        onClick={() => setPickerOpen(prev => !prev)}
        className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-700/60 hover:bg-slate-600/80 text-slate-400 hover:text-white transition-colors"
        title="Adicionar reação"
        aria-label="Adicionar reação"
      >
        <Plus className="h-3 w-3" />
      </button>

      {pickerOpen && (
        <EmojiPicker onSelect={handleEmojiClick} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <>
      {/* Overlay invisible para fechar ao clicar fora */}
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-full left-0 mb-1 z-20 bg-slate-800 border border-slate-600 rounded-xl shadow-xl p-2">
        <div className="grid grid-cols-6 gap-1">
          {EMOJI_OPTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="text-lg h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
