import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Zap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  conversationId: string
}

export default function AcceptTicketBar({ conversationId }: Props) {
  const { user } = useAuth()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    if (!user || accepting) return
    setAccepting(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('accept_conversation', {
        conv_id: conversationId,
        operator_id: user.id,
      })
      if (rpcError) throw rpcError
      // A barra desaparece automaticamente via realtime UPDATE de status na conversa
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar atendimento')
      setAccepting(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-900/40 border-b border-amber-700/60">
      <Zap className="h-4 w-4 text-amber-400 shrink-0" />
      <p className="flex-1 text-sm text-amber-200 font-medium">
        Conversa aguardando atendimento
      </p>
      {error && (
        <p className="text-xs text-red-400 shrink-0">{error}</p>
      )}
      <Button
        size="sm"
        onClick={handleAccept}
        disabled={accepting}
        className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-7 px-3 shrink-0"
      >
        {accepting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          'Aceitar atendimento'
        )}
      </Button>
    </div>
  )
}
