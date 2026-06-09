import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Plus, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { OficinaLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

export default function Financeiro() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState('PIX')

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ['lancamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lancamentos').insert({
        organization_id: organizationId!,
        descricao,
        tipo,
        valor: parseFloat(valor.replace(',', '.')),
        categoria: categoria || null,
        forma,
        status: 'confirmado',
        data: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos', organizationId] })
      toast.success('Lançamento registrado!')
      setShowForm(false); setDescricao(''); setValor(''); setCategoria('')
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })

  const receitas = (lancamentos as any[]).filter(l => l.tipo === 'entrada' && l.status === 'confirmado').reduce((s: number, l: any) => s + Number(l.valor ?? 0), 0)
  const despesas = (lancamentos as any[]).filter(l => l.tipo === 'saida' && l.status === 'confirmado').reduce((s: number, l: any) => s + Number(l.valor ?? 0), 0)
  const saldo = receitas - despesas

  if (!organizationId) return <OficinaLayout><NoOrg /></OficinaLayout>

  return (
    <OficinaLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Financeiro</h1>
          <p className="text-slate-400 text-sm mt-1">Controle de receitas e despesas</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Lançamento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-400">Receitas</span><TrendingUp className="h-5 w-5 text-green-400" /></div>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(receitas)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-400">Despesas</span><TrendingDown className="h-5 w-5 text-red-400" /></div>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(despesas)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-400">Saldo</span><DollarSign className={`h-5 w-5 ${saldo >= 0 ? 'text-orange-400' : 'text-red-400'}`} /></div>
          <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-white' : 'text-red-400'}`}>{formatCurrency(saldo)}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Novo Lançamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 sm:col-span-2" />
            <select value={tipo} onChange={e => setTipo(e.target.value as 'entrada' | 'saida')} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500">
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
            <input value={valor} onChange={e => setValor(e.target.value)} placeholder="Valor R$ *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Categoria" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <select value={forma} onChange={e => setForma(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500">
              {['PIX','Dinheiro','Cartão de crédito','Cartão de débito','Transferência','Boleto'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!descricao || !valor || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700"><h2 className="font-semibold text-white">Lançamentos Recentes</h2></div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : (lancamentos as any[]).length === 0 ? (
          <div className="py-12 text-center"><p className="text-slate-500 text-sm">Nenhum lançamento registrado.</p></div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {(lancamentos as any[]).slice(0, 20).map((l: any) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">{l.descricao}</p>
                  <p className="text-xs text-slate-500">{l.categoria ?? '-'} · {l.forma ?? '-'} · {l.data ? formatDate(l.data) : '-'}</p>
                </div>
                <span className={`text-sm font-semibold ${l.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                  {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor ?? 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </OficinaLayout>
  )
}
