import { UserCircle, UserPlus } from 'lucide-react'

interface Props {
  name: string
  phone: string
  time: string
  isOutbound: boolean
  /** Sprint6 F6 — callback para vincular este contato como cliente */
  onLinkCliente?: (name: string, phone: string) => void
}

/** Formata número de telefone: "11999991234" → "(11) 99999-1234" */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

export default function ContactBubble({ name, phone, time, isOutbound, onLinkCliente }: Props) {
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <div className="flex items-center gap-2">
        <UserCircle className="h-8 w-8 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{name}</p>
          <p className="text-xs text-slate-400">{formatPhone(phone)}</p>
        </div>
      </div>

      {onLinkCliente && (
        <button
          type="button"
          onClick={() => onLinkCliente(name, phone)}
          className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors self-start mt-0.5"
        >
          <UserPlus className="h-3 w-3" />
          Vincular como cliente
        </button>
      )}

      <p className={`text-xs self-end ${isOutbound ? 'text-orange-200' : 'text-slate-500'}`}>
        {time}
      </p>
    </div>
  )
}
