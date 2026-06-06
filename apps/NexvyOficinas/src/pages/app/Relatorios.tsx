import { useQuery } from '@tanstack/react-query'
import { BarChart2, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'

export default function Relatorios() {
  const { empresaId } = useAuth()

  const { data: ordens = [], isLoading: loadingOS } = useQuery({
    queryKey: ['ordens_servico', empresaId],
    queryFn: async () => { const r = await db.ordensServico.list(empresaId!); return r.data ?? [] },
    enabled: !!empresaId,
  })

  const { data: lancamentos = [], isLoading: loadingLanc } = useQuery({
    queryKey: ['lancamentos', empresaId],
    queryFn: async () => { const r = await db.lancamentos.list(empresaId!); return r.data ?? [] },
    enabled: !!empresaId,
  })

  const isLoading = loadingOS || loadingLanc

  const statusData = ['aberta','em_andamento','aguardando_peca','concluida','cancelada'].map(s => ({
    name: s.replace('_', ' '),
    total: (ordens as any[]).filter((o: any) => o.status === s).length,
  })).filter(d => d.total > 0)

  const receitaTotal = (lancamentos as any[]).filter((l: any) => l.tipo === 'entrada' && l.status === 'confirmado').reduce((a: number, l: any) => a + (l.valor ?? 0), 0)
  const despesaTotal = (lancamentos as any[]).filter((l: any) => l.tipo === 'saida' && l.status === 'confirmado').reduce((a: number, l: any) => a + (l.valor ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Relatorios</h1>
        <p className="text-slate-400 text-sm mt-1">Analise de desempenho da oficina</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Total de OS</p>
              <p className="text-3xl font-bold text-white">{(ordens as any[]).length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Receita Total</p>
              <p className="text-3xl font-bold text-green-400">{formatCurrency(receitaTotal)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Saldo</p>
              <p className="text-3xl font-bold text-orange-400">{formatCurrency(receitaTotal - despesaTotal)}</p>
            </div>
          </div>

          {statusData.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <h2 className="font-semibold text-white mb-4">OS por Status</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                  <Bar dataKey="total" fill="#ea580c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {statusData.length === 0 && (
            <div className="py-16 text-center">
              <BarChart2 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">Nenhum dado disponivel ainda.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
