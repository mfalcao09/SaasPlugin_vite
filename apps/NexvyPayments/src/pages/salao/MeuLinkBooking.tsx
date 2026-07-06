// F2.3 (lancamento-v3) — "Meu link de agendamento": superfície de compartilhamento
// do booking público (/s/:slug, rota já existente). A dona copia o link ou mostra
// o QR — componente do stack da oferta ("cliente marca sozinha pelo WhatsApp").
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { useOrganizationId } from './_shared'

// Booking público é confinado ao apex (HostConfinementGuard) — o link de
// compartilhamento aponta sempre pro domínio raiz, mesmo aberto de app.*.
const APEX = 'https://nexvybeauty.com.br'

export function MeuLinkBooking() {
  const organizationId = useOrganizationId()
  const [copied, setCopied] = useState(false)

  const { data: slug } = useQuery({
    queryKey: ['org-slug', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', organizationId!)
        .maybeSingle()
      if (error) throw error
      return (data?.slug as string | null) ?? null
    },
  })

  if (!slug) return null

  const url = `${APEX}/s/${slug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copiado! Cole no seu WhatsApp ou Instagram.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não consegui copiar — selecione o link e copie manualmente.')
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="mr-2 h-4 w-4" />
          Meu link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seu link de agendamento</DialogTitle>
          <DialogDescription>
            Compartilhe no WhatsApp, Instagram ou balcão — a cliente escolhe o horário
            sozinha e cai direto na sua agenda.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">{url}</code>
          <Button size="icon" variant="outline" onClick={copy} aria-label="Copiar link">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex justify-center rounded-lg border bg-white p-4">
          <QRCodeSVG value={url} size={168} />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Imprima o QR e deixe no balcão — quem escaneia cai no seu link.
        </p>
      </DialogContent>
    </Dialog>
  )
}
