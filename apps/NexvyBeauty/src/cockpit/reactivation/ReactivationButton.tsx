// WS3 — Reativação · botão de disparo único.
//
// 1 clique → dispara a mensagem pronta da IA no WhatsApp da cliente (via
// sendReactivation → evolution-send). Mapeia o resultado em toasts em pt-BR,
// com o CTA "conecte seu WhatsApp" quando não há instância conectada.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ReactivationButtonProps } from '@/cockpit/types'
import { sendReactivation } from './sendReactivation'

export function ReactivationButton({ item, onSent, className }: ReactivationButtonProps) {
  const [sending, setSending] = useState(false)

  async function handleClick() {
    setSending(true)
    try {
      const outcome = await sendReactivation(item)
      switch (outcome) {
        case 'sent':
          toast.success('Mensagem enviada no WhatsApp ✅')
          onSent?.(item)
          break
        case 'no_phone':
          toast.error('Cliente sem telefone — não dá pra enviar')
          break
        case 'no_instance':
          toast.error('Conecte seu WhatsApp primeiro pra disparar')
          break
        case 'error':
        default:
          toast.error('Não foi possível enviar agora')
          break
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Button className={cn('gap-2', className)} onClick={handleClick} disabled={sending}>
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      Disparar reativação
    </Button>
  )
}
