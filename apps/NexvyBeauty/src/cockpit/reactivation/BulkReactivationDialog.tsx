// WS3 — Reativação · disparo em lote (linguagem de salão, não "disparo em massa").
//
// Envia a mensagem pronta de cada cliente, uma de cada vez, com um intervalo de
// segurança entre os envios (anti-spam). Mostra progresso ao vivo + status por
// cliente (✓/✗). Reusa sendReactivation (mesmo motor do botão único).
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Send, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { BulkReactivationDialogProps, OpportunityCardData } from '@/cockpit/types'
import { sendReactivation } from './sendReactivation'

/** Intervalo de segurança entre envios — espaça o disparo pra não cair em spam. */
const THROTTLE_MS = 2500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ItemStatus = 'pending' | 'ok' | 'fail'

export function BulkReactivationDialog({
  items,
  open,
  onOpenChange,
  onDone,
}: BulkReactivationDialogProps) {
  const [sending, setSending] = useState(false)
  const [current, setCurrent] = useState(0) // quantos já processou (1..N durante o loop)
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({})

  const total = items.length

  // Não deixa fechar durante o disparo (mas mantém o controle externo no resto).
  function handleOpenChange(next: boolean) {
    if (sending) return
    onOpenChange(next)
  }

  async function handleConfirm() {
    if (sending || total === 0) return
    setSending(true)
    setCurrent(0)
    setStatuses({})

    let sent = 0
    let failed = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setCurrent(i + 1)

      // Throttle ENTRE envios — nunca antes do primeiro.
      if (i > 0) await sleep(THROTTLE_MS)

      const r = await sendReactivation(item)
      if (r === 'sent') {
        sent++
        setStatuses((s) => ({ ...s, [item.id]: 'ok' }))
      } else {
        failed++
        setStatuses((s) => ({ ...s, [item.id]: 'fail' }))
      }
    }

    setSending(false)
    toast.success(`${sent} enviada${sent === 1 ? '' : 's'}, ${failed} falhou${failed === 1 ? '' : 'ram'}`)
    onDone?.({ sent, failed })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => sending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Disparar reativação para {total} cliente{total === 1 ? '' : 's'}?</DialogTitle>
          <DialogDescription>
            Vou enviar a mensagem pronta de cada um pelo seu WhatsApp, com um intervalo de segurança
            entre os envios (para não cair em spam). Você pode acompanhar abaixo.
          </DialogDescription>
        </DialogHeader>

        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando {current} de {total}…
          </div>
        )}

        <ul className="max-h-60 overflow-y-auto space-y-1 rounded-md border bg-muted/30 p-2">
          {items.map((item: OpportunityCardData) => {
            const st = statuses[item.id] ?? 'pending'
            return (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 shrink-0">
                  {st === 'ok' && <Check className="h-4 w-4 text-emerald-600" />}
                  {st === 'fail' && <X className="h-4 w-4 text-red-600" />}
                </span>
                <span className={cn('truncate', st === 'fail' && 'text-muted-foreground line-through')}>
                  {item.name}
                </span>
              </li>
            )
          })}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button className="gap-2" onClick={handleConfirm} disabled={sending || total === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Disparar {total} agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
