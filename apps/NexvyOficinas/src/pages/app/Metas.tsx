import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trophy, Plus, Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

export default function Metas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [tipo, setTipo] = useState('receita')
  const [valorMeta, setValorMeta] = useState('')
  const [periodo, setPeriodo] = useState('mensal')

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ['metas', empresaId],
    queryFn: async () => { const r = await db.metas.list(empresaId!); return r.data ?? [] },
    enabled: !!empresaId,
  })

  const criar = useMutation({
    mutationFn: async () => {
      const now = new Date()
      const inicio = now.toISOString().split('T')[0]
      const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      return await db.metas.create({
        empresa_id: empresaId!, tipo, valor_meta: parseFloat(valorMeta.replace(',', '.')),
        periodo, data_inicio: inicio, data_fim: fim,
      } as any)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', empresaId] })
      toast.success('Meta criada!')
      setShowForm(false); setValorMeta('')
    },
    onError: () => toast.error('Erro ao criar meta.'),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe os objetivos da oficina</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Nova Meta
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Nova Meta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500">
              <option value="receita">Receita</option>
              <option value="os_concluidas">OS Concluidas</option>
              <option value="novos_clientes">Novos Clientes</option>
              <option value="leads">Leads</option>
            </select>
            <input value={valorMeta} onChange={e => setValorMeta(e.target.value)} placeholder="Valor da meta *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500">
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!valorMeta || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Criar Meta
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : (metas as any[]).length === 0 ? (
          <div className="col-span-3 py-12 text-center"><Trophy className="h-10 w-10 text-slate-600 mx-auto mb-3" /><p className="text-slate-500 text-sm">Nenhuma meta definida ainda.</p></div>
        ) : (
          (metas as any[]).map((m: any) => (
            <div key={m.id} className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-white capitalize">{m.tipo?.replace('_', ' ')}</span>
                <Trophy className="h-5 w-5 text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-orange-400">{m.tipo === 'receita' ? formatCurrency(m.valor_meta) : m.valor_meta}</p>
              <p className="text-xs text-slate-500 mt-1">{m.periodo} · {m.data_inicio} a {m.data_fim}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
