import { useEffect, useRef } from 'react'
import { Zap } from 'lucide-react'
import type { QuickReply } from '@/hooks/useQuickReplies'

interface Props {
  replies: QuickReply[]
  /** texto digitado após "/" — usado para filtrar */
  query: string
  onSelect: (content: string) => void
  onClose: () => void
}

export default function QuickReplyPicker({ replies, query, onSelect, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = replies.filter(r => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      (r.shortcut ?? '').toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q)
    )
  })

  // Fecha ao clicar fora do popover
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden z-50 max-h-52 overflow-y-auto"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
        <Zap className="h-3 w-3 text-orange-400" />
        <span className="text-xs text-slate-400 font-medium">Respostas rápidas</span>
        <kbd className="ml-auto text-[10px] text-slate-500 bg-slate-700 rounded px-1">Esc para fechar</kbd>
      </div>
      {filtered.map(r => (
        <button
          key={r.id}
          onClick={() => onSelect(r.content)}
          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-700 transition-colors"
        >
          {r.shortcut && (
            <span className="shrink-0 mt-0.5 text-xs font-mono text-orange-400 bg-orange-600/20 rounded px-1.5 py-0.5">
              {r.shortcut}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{r.title}</p>
            <p className="text-xs text-slate-400 truncate">{r.content}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
