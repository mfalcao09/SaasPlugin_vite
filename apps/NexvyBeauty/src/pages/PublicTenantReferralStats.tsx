import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gift, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

type Stats = {
  clicks: number
  conversions: number
  pending_count: number
  approved_count: number
  paid_count: number
  cancelled_count: number
  program: 'tenant'
}

export default function PublicTenantReferralStats() {
  const { slug = '', ref = '' } = useParams()

  const stats = useQuery({
    queryKey: ['tenant-referral-public', slug, ref],
    enabled: !!ref,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await (supabase as any).rpc('tenant_referral_public_stats', { p_ref: ref })
      if (error) throw error
      if (!data) throw new Error('Link não encontrado')
      return data as Stats
    },
    retry: false,
  })

  if (stats.isLoading) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Centered>
    )
  }

  if (stats.isError || !stats.data) {
    return (
      <Centered>
        <p className="text-lg font-medium">Link de indicação não encontrado</p>
      </Centered>
    )
  }

  const s = stats.data
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-10 space-y-6">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Suas indicações</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Cliques e status da comissão. Sem dados da amiga e sem conversas.
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Cliques" value={s.clicks} />
          <Stat label="Conversões" value={s.conversions} />
          <Stat label="Em hold" value={s.pending_count} />
          <Stat label="Aprovadas" value={s.approved_count} />
          <Stat label="Pagas pelo salão" value={s.paid_count} />
          <Stat label="Canceladas" value={s.cancelled_count} />
        </dl>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  )
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">{children}</div>
)
