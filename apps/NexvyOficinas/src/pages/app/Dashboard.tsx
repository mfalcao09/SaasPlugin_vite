import { useQuery } from '@tanstack/react-query'
import { Wrench, Users, DollarSign, FileText, TrendingUp } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'

export default function Dashboard() {
  const { empresaId } = useAuth()

  const { data: clientes } = useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: () => db.clientes.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const { data: ordens } = useQuery({
    queryKey: ['ordens_servico', empresaId],
    queryFn: () => db.ordensServico.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const { data: lancamentos } = useQuery({
    queryKey: ['lancamentos', empresaId],
    queryFn: () => db.lancamentos.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const ordensAbertas = ordens?.filter((o: any) =>
    o.status === 'aberta' || o.status === 'em_andamento'
  ) ?? []

  const receitaMes = lancamentos
    ?.filter((l: any) => l.tipo === 'entrada' && l.status === 'confirmado')
    .reduce((acc: number, l: any) => acc + (l.valor ?? 0), 0) ?? 0

  const stats = [
    { label: 'Clientes', value: String(clientes?.length ?? 0), icon: Users, color: 'text-blue-400' },
    { label: 'OS Abertas', value: String(ordensAbertas.length), icon: Wrench, color: 'text-orange-400' },
    { label: 'Receita do Mês', value: formatCurrency(receitaMes), icon: DollarSign, color: 'text-green-400' },
    { label: 'Orçamentos', value: '—', icon: FileText, color: 'text-purple-400' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Visão geral da sua oficina</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-400">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-orange-400" />
          <h2 className="font-semibold text-white">Ordens de Serviço Recentes</h2>
        </div>
        <div className="divide-y divide-slate-700">
          {ordensAbertas.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-500 text-sm">
              Nenhuma OS aberta no momento.
            </p>
          ) : (
            ordensAbertas.slice(0, 5).map((os: any) => (
              <div key={os.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{os.numero ?? os.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-400">{os.cliente_nome ?? '—'} · {os.veiculo_desc ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  os.status === 'aberta' ? 'bg-blue-500/15 text-blue-400' :
                  os.status === 'em_andamento' ? 'bg-orange-500/15 text-orange-400' :
                  'bg-slate-500/15 text-slate-400'
                }`}>
                  {os.status?.replace('_', ' ')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-orange-600/10 border border-orange-600/30 rounded-xl p-5 flex items-center gap-4">
        <TrendingUp className="h-8 w-8 text-orange-400 shrink-0" />
        <div>
          <p className="font-semibold text-white">CRM de Vendas</p>
          <p className="text-sm text-slate-400">Gerencie leads, cadências e metas no menu lateral.</p>
        </div>
      </div>
    </div>
  )
}
