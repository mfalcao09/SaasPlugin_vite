interface Props {
  visible: boolean
}

/**
 * Indicador visual de "contato está digitando..." — 3 dots com animate-bounce escalonado.
 * Renderizado em ChatArea abaixo das mensagens quando isContactTyping === true.
 */
export default function TypingIndicator({ visible }: Props) {
  if (!visible) return null

  return (
    <div className="flex justify-start px-1">
      <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-3 py-2 inline-flex items-center gap-1">
        <span
          className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  )
}
