import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Plus, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

interface Lancamento {
  id: string
  organization_id: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  data: string | null
  status: string | null
  forma: string | null
  categoria: string | null
}

export default function Financeiro() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState('PIX')

  const { data: lancamentos = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ['lancamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lancamento[]
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

  const receitas = lancamentos.filter(l => l.tipo === 'entrada' && l.status === 'confirmado').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const despesas = lancamentos.filter(l => l.tipo === 'saida' && l.status === 'confirmado').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const saldo = receitas - despesas

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle de receitas e despesas</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Lançamento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Receitas</span><TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(receitas)}</p>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Despesas</span><TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" /></div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(despesas)}</p>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Saldo</span><DollarSign className={`h-5 w-5 ${saldo >= 0 ? 'text-primary' : 'text-red-600 dark:text-red-400'}`} /></div>
          <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(saldo)}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Novo Lançamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary sm:col-span-2" />
            <select value={tipo} onChange={e => setTipo(e.target.value as 'entrada' | 'saida')} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
            <input value={valor} onChange={e => setValor(e.target.value)} placeholder="Valor R$ *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Categoria" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <select value={forma} onChange={e => setForma(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              {['PIX','Dinheiro','Cartão de crédito','Cartão de débito','Transferência','Boleto'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!descricao || !valor || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b"><h2 className="font-semibold text-foreground">Lançamentos Recentes</h2></div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : lancamentos.length === 0 ? (
          <div className="py-12 text-center"><p className="text-muted-foreground text-sm">Nenhum lançamento registrado.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {lancamentos.slice(0, 20).map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{l.descricao}</p>
                  <p className="text-xs text-muted-foreground">{l.categoria ?? '-'} · {l.forma ?? '-'} · {l.data ? formatDate(l.data) : '-'}</p>
                </div>
                <span className={`text-sm font-semibold ${l.tipo === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor ?? 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </SalaoLayout>
  )
}
