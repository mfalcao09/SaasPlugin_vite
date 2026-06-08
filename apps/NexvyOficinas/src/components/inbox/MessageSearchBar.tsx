import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import type { InboxMessage } from './messages/MessageBubble'

interface Props {
  messages: InboxMessage[]
  onClose: () => void
  onScrollTo: (id: string) => void
}

export default function MessageSearchBar({ messages, onClose, onScrollTo }: Props) {
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus ao abrir
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset índice quando query muda
  useEffect(() => {
    setCurrentIndex(0)
  }, [query])

  const matchIds = query.trim()
    ? messages
        .filter(m => m.content?.toLowerCase().includes(query.toLowerCase()))
        .map(m => m.id)
    : []

  const total = matchIds.length
  const safeIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0

  // Scroll para o resultado atual sempre que índice ou matches mudam
  useEffect(() => {
    if (total > 0 && matchIds[safeIndex]) {
      onScrollTo(matchIds[safeIndex])
    }
  // onScrollTo é estável (definido inline no ChatArea) — incluir nas deps causaria loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, total, matchIds[safeIndex]])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (total === 0) return
      const next = e.shiftKey
        ? (safeIndex - 1 + total) % total
        : (safeIndex + 1) % total
      setCurrentIndex(next)
    }
  }

  function goNext() {
    if (total === 0) return
    setCurrentIndex(prev => (prev + 1) % total)
  }

  function goPrev() {
    if (total === 0) return
    setCurrentIndex(prev => (prev - 1 + total) % total)
  }

  return (
    <div className="relative flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pesquisar mensagens..."
        className="flex-1 bg-slate-700 text-white placeholder:text-slate-500 text-sm px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500 transition-colors"
      />

      {/* Contagem */}
      <span className="text-xs text-slate-400 shrink-0 min-w-[40px] text-center">
        {query.trim() === ''
          ? ''
          : total === 0
            ? '0/0'
            : `${safeIndex + 1}/${total}`}
      </span>

      {/* Navegação */}
      <button
        onClick={goPrev}
        disabled={total === 0}
        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-colors shrink-0"
        title="Resultado anterior (Shift+Enter)"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        onClick={goNext}
        disabled={total === 0}
        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-colors shrink-0"
        title="Próximo resultado (Enter)"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Fechar */}
      <button
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
        title="Fechar busca (ESC)"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Nenhum resultado — hint inline */}
      {query.trim() !== '' && total === 0 && (
        <span className="text-xs text-slate-500 shrink-0">
          Nenhuma mensagem encontrada
        </span>
      )}
    </div>
  )
}
