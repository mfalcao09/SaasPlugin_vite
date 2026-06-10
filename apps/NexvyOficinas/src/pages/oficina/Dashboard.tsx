import { useQuery } from '@tanstack/react-query'
import { Wrench, Users, DollarSign, FileText, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { OficinaLayout, NoOrg, useOrganizationId, formatCurrency } from './_shared'

export default function Dashboard() {
  const organizationId = useOrganizationId()
  const navigate = useNavigate()

  const { data: clientes } = useQuery({
    queryKey: ['clientes', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const { data: ordens } = useQuery({
    queryKey: ['ordens_servico', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ordens_servico').select('*').eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const { data: orcamentos } = useQuery({
    queryKey: ['orcamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('orcamentos').select('id').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const { data: lancamentos } = useQuery({
    queryKey: ['lancamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('tipo, valor, status').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const ordensAbertas = (ordens ?? []).filter((o: any) => o.status === 'aberta' || o.status === 'em_andamento')

  const receitaMes = (lancamentos ?? [])
    .filter((l: any) => l.tipo === 'entrada' && l.status === 'confirmado')
    .reduce((acc: number, l: any) => acc + Number(l.valor ?? 0), 0)

  const stats = [
    { label: 'Clientes', value: String(clientes?.length ?? 0), icon: Users, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'OS Abertas', value: String(ordensAbertas.length), icon: Wrench, color: 'text-primary' },
    { label: 'Receita Confirmada', value: formatCurrency(receitaMes), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Orçamentos', value: String(orcamentos?.length ?? 0), icon: FileText, color: 'text-purple-600 dark:text-purple-400' },
  ]

  if (!organizationId) return <OficinaLayout><NoOrg /></OficinaLayout>

  return (
    <OficinaLayout>
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral da sua oficina</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-xl">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Ordens de Serviço Recentes</h2>
        </div>
        <div className="divide-y divide-border">
          {ordensAbertas.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground text-sm">Nenhuma OS aberta no momento.</p>
          ) : (
            ordensAbertas.slice(0, 5).map((os: any) => (
              <div key={os.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{os.numero ?? os.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{os.cliente_nome ?? '—'} · {os.veiculo_desc ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  os.status === 'aberta' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                  os.status === 'em_andamento' ? 'bg-primary/15 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {os.status?.replace('_', ' ')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="w-full bg-primary/10 border border-primary/30 rounded-xl p-5 flex items-center gap-4 hover:bg-primary/15 transition-colors text-left"
      >
        <ArrowLeft className="h-8 w-8 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-foreground">CRM de Vendas</p>
          <p className="text-sm text-muted-foreground">Voltar ao painel de leads, cadências e conversas.</p>
        </div>
      </button>
    </div>
    </OficinaLayout>
  )
}
