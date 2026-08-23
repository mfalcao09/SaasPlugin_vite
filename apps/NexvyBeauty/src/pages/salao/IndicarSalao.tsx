import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

const STAGE_LABEL: Record<string, string> = {
  captured: 'Capturado',
  in_conversation: 'Em conversa',
  checkout: 'Checkout',
  paid: 'Pago',
}

export default function IndicarSalao() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [pref, setPref] = useState<'pix' | 'subscription_credit'>('subscription_credit')

  const ensure = useQuery({
    queryKey: ['affiliate-salon', 'ensure', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('affiliate-salon', {
        body: { action: 'ensure_link' },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
      const payout = (data as { affiliate?: { payout_preference?: string } })?.affiliate?.payout_preference
      if (payout === 'pix' || payout === 'subscription_credit') setPref(payout)
      return data as { public_url: string; affiliate: { payout_preference?: string }; link: { ref_code: string } }
    },
    retry: false,
  })

  const stages = useQuery({
    queryKey: ['affiliate-salon', 'stages', organizationId],
    enabled: !!organizationId && !!ensure.data,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('affiliate-salon', {
        body: { action: 'list_stages' },
      })
      if (error) throw error
      return ((data as { stages?: Array<{ stage: string; updated_at: string; co_sell: boolean; meeting_at: string | null }> })?.stages) ?? []
    },
  })

  const setPreference = useMutation({
    mutationFn: async (payout_preference: 'pix' | 'subscription_credit') => {
      const { data, error } = await supabase.functions.invoke('affiliate-salon', {
        body: { action: 'set_payout_preference', payout_preference },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
    },
    onSuccess: () => {
      toast.success('Comissão será paga nessa forma')
      qc.invalidateQueries({ queryKey: ['affiliate-salon'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const markMeeting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('affiliate-salon', {
        body: { action: 'mark_cosell', meeting_at: new Date().toISOString() },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
    },
    onSuccess: () => {
      toast.success('Reunião registrada (co-sell)')
      qc.invalidateQueries({ queryKey: ['affiliate-salon', 'stages'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!organizationId) {
    return <SalaoLayout><NoOrg /></SalaoLayout>
  }

  const url = ensure.data?.public_url

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Indicar outro salão"
          description="Gere seu link. A comissão entra como crédito na sua assinatura ou PIX — você escolhe."
        />

        {ensure.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : ensure.error ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              {(ensure.error as Error).message || 'Não foi possível gerar o link. Confira se o plano do salão está ativo.'}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> Seu link de indicação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">{url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!url) return
                    await navigator.clipboard.writeText(url)
                    toast.success('Link copiado')
                  }}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Como quer receber a comissão?</Label>
                <RadioGroup
                  value={pref}
                  onValueChange={(v) => {
                    const next = v as 'pix' | 'subscription_credit'
                    setPref(next)
                    setPreference.mutate(next)
                  }}
                  className="grid sm:grid-cols-2 gap-3"
                >
                  <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                    <RadioGroupItem value="subscription_credit" />
                    <span>
                      <span className="font-medium">Crédito na assinatura</span>
                      <span className="block text-xs text-muted-foreground">Mês grátis / dias na sua mensalidade Nexvy</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                    <RadioGroupItem value="pix" />
                    <span>
                      <span className="font-medium">PIX</span>
                      <span className="block text-xs text-muted-foreground">Após o hold de 30 dias, lote manual</span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4" /> Funil dos indicados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estágio sem abrir o chat e sem dado pessoal do outro salão.
            </p>
            {stages.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !stages.data?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum indicado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {stages.data.map((s, i) => (
                  <li key={`${s.updated_at}-${i}`} className="flex items-center justify-between text-sm">
                    <Badge variant="secondary">{STAGE_LABEL[s.stage] ?? s.stage}</Badge>
                    <span className="text-muted-foreground">
                      {s.co_sell ? 'co-sell' : ''} {s.updated_at ? new Date(s.updated_at).toLocaleDateString('pt-BR') : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="outline" onClick={() => markMeeting.mutate()} disabled={markMeeting.isPending}>
              Registrei uma reunião (co-sell)
            </Button>
          </CardContent>
        </Card>
      </div>
    </SalaoLayout>
  )
}
