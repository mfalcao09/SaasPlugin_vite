import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Pencil, Check, X } from 'lucide-react'

interface Props {
  messageId: string
  currentContent: string
  onEdited: (newContent: string) => void
}

/**
 * Menu de ações flutuante na bubble outbound de texto.
 * Aparece no hover (group-hover via parent), permite edição inline.
 * - Clique no lápis: transforma conteúdo em textarea inline
 * - Enter salva, Escape cancela
 * - Atualiza DB: content, edited_at, original_content (preserva original se não tiver ainda)
 * - onEdited: atualiza estado local imediato (Realtime UPDATE do DB também propaga)
 */
export default function MessageActionsMenu({ messageId, currentContent, onEdited }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(currentContent)
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setEditText(currentContent)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditText(currentContent)
  }

  async function saveEdit() {
    const newContent = editText.trim()
    if (!newContent || newContent === currentContent || loading) return

    setLoading(true)
    try {
      // Tenta atualizar apenas se edited_at ainda é null (primeira edição):
      // preserva o original_content como o texto antes da edição
      const { error: firstErr } = await supabase
        .from('inbox_messages')
        .update({
          content: newContent,
          edited_at: new Date().toISOString(),
          original_content: currentContent,
        })
        .eq('id', messageId)
        .is('edited_at', null)

      if (firstErr) {
        // Já foi editado antes — só atualiza content + edited_at sem tocar no original
        await supabase
          .from('inbox_messages')
          .update({ content: newContent, edited_at: new Date().toISOString() })
          .eq('id', messageId)
      }

      onEdited(newContent)
      setIsEditing(false)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  if (isEditing) {
    return (
      <div className="mt-1 space-y-1">
        <textarea
          ref={textareaRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
          className="w-full bg-white/10 rounded-lg px-2 py-1 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-white/40 resize-none disabled:opacity-50"
        />
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={cancelEdit}
            disabled={loading}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            title="Cancelar"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={saveEdit}
            disabled={loading || !editText.trim() || editText.trim() === currentContent}
            className="p-1 rounded text-white/60 hover:text-green-300 hover:bg-white/10 transition-colors disabled:opacity-50"
            title="Salvar"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-70 hover:!opacity-100 text-white/70 hover:text-white hover:bg-white/20 transition-all"
      title="Editar mensagem"
      aria-label="Editar mensagem"
    >
      <Pencil className="h-3 w-3" />
    </button>
  )
}
