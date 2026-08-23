import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Gift, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

type Program = { enabled?: boolean; commission_pct?: number }
type LinkRow = {
  ref_code: string
  clicks: number
  referrer_name: string
  pending_count: number
  public_url: string | null
  stats_url: string | null
}

export default function IndicacaoClientes() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [clienteId, setClienteId] = useState('')
  const [pct, setPct] = useState('10')
  const [enabled, setEnabled] = useState(false)

  const programQ = useQuery({
    queryKey: ['tenant-referral', 'program', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tenant-referral', {
        body: { action: 'get_program' },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
      const program = (data as { program?: Program })?.program
      setEnabled(Boolean(program?.enabled))
      setPct(String(program?.commission_pct ?? 10))
      return data as { program: Program; slug?: string }
    },
    retry: false,
  })

  const linksQ = useQuery({
    queryKey: ['tenant-referral', 'links', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tenant-referral', {
        body: { action: 'list_links' },
      })
      if (error) throw error
      return ((data as { links?: LinkRow[] })?.links) ?? []
    },
  })

  const clientesQ = useQuery({
    queryKey: ['tenant-referral', 'clientes', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome')
        .eq('organization_id', organizationId!)
        .order('nome')
        .limit(200)
      if (error) throw error
      return (data ?? []) as { id: string; nome: string }[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('tenant-referral', {
        body: { action: 'save_program', enabled, commission_pct: Number(pct) },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
    },
    onSuccess: () => {
      toast.success('Programa do salão salvo. Comissão sai do seu faturamento.')
      qc.invalidateQueries({ queryKey: ['tenant-referral'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('tenant-referral', {
        body: { action: 'generate_client_link', cliente_id: clienteId },
      })
      const err = (data as { error?: string } | null)?.error || error?.message
      if (err) throw new Error(err)
      return data as { public_url: string; stats_url: string }
    },
    onSuccess: async (data) => {
      toast.success('Link da cliente gerado')
      if (data.public_url) await navigator.clipboard.writeText(data.public_url)
      qc.invalidateQueries({ queryKey: ['tenant-referral', 'links'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!organizationId) {
    return <SalaoLayout><NoOrg /></SalaoLayout>
  }

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Indicação de clientes"
          description="Sua cliente indica uma amiga para este salão. A comissão sai do seu faturamento — não da Nexvy."
        />

        {programQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift className="h-4 w-4" /> Programa do salão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="tenant-ref-on">Ativar indicações</Label>
                  <p className="text-xs text-muted-foreground">Sem split Cakto. Sem CPF da amiga para quem indicou.</p>
                </div>
                <Switch id="tenant-ref-on" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="tenant-ref-pct">Comissão (%)</Label>
                <Input id="tenant-ref-pct" type="number" min={1} max={50} value={pct} onChange={(e) => setPct(e.target.value)} />
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar programa</Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> Link para uma cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Escolha a cliente que vai indicar" /></SelectTrigger>
              <SelectContent>
                {(clientesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => generate.mutate()} disabled={!clienteId || generate.isPending}>
              Gerar e copiar link
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links gerados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {linksQ.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !linksQ.data?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum link ainda.</p>
            ) : (
              <ul className="space-y-3">
                {linksQ.data.map((l) => (
                  <li key={l.ref_code} className="rounded-md border p-3 text-sm space-y-2">
                    <div className="font-medium">{l.referrer_name}</div>
                    <div className="text-muted-foreground">{l.clicks} cliques · {l.pending_count} comissões em hold</div>
                    <code className="block truncate text-xs bg-muted px-2 py-1 rounded">{l.public_url}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!l.public_url) return
                        await navigator.clipboard.writeText(l.public_url)
                        toast.success('Link copiado')
                      }}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </SalaoLayout>
  )
}
