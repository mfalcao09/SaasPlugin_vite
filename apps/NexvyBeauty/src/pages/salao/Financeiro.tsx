import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Plus, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

// Re-skin premium data-injectable. Camada de dados preservada: tabela
// `lancamentos` por organization_id (registro de entradas/saídas).

export interface Lancamento {
  id: string
  organization_id?: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  data: string | null
  status: string | null
  forma: string | null
  categoria: string | null
}

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto']

export default function Financeiro({ demo }: { demo?: Lancamento[] } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState('PIX')

  const { data: fetched = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ['lancamentos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lancamento[]
    },
  })

  const lancamentos = demo ?? fetched
  const reset = () => { setShowForm(false); setDescricao(''); setValor(''); setCategoria('') }

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lancamentos').insert({
        organization_id: organizationId!,
        descricao, tipo, valor: parseFloat(valor.replace(',', '.')),
        categoria: categoria || null, forma, status: 'confirmado',
        data: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos', organizationId] })
      toast.success('Lançamento registrado!')
      reset()
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })

  const onSave = () => isDemo ? toast.info('Ação indisponível no modo demonstração') : criar.mutate()

  const receitas = lancamentos.filter((l) => l.tipo === 'entrada' && l.status === 'confirmado').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const despesas = lancamentos.filter((l) => l.tipo === 'saida' && l.status === 'confirmado').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const saldo = receitas - despesas

  if (!isDemo && !organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  const kpis = [
    { label: 'Receitas', value: formatCurrency(receitas), icon: TrendingUp, cls: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Despesas', value: formatCurrency(despesas), icon: TrendingDown, cls: 'text-red-600 dark:text-red-400' },
    { label: 'Saldo', value: formatCurrency(saldo), icon: DollarSign, cls: saldo >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400' },
  ]

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}

        <PageHeader
          title="Financeiro"
          description="Controle de receitas e despesas"
          action={<Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Novo lançamento</Button>}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                <k.icon className={`h-5 w-5 ${k.cls}`} />
              </CardHeader>
              <CardContent><div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Lançamentos recentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : lancamentos.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum lançamento registrado.</p>
            ) : (
              <div className="divide-y divide-border">
                {lancamentos.slice(0, 20).map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium">{l.descricao}</p>
                      <p className="text-xs text-muted-foreground">{l.categoria ?? '-'} · {l.forma ?? '-'} · {l.data ? formatDate(l.data) : '-'}</p>
                    </div>
                    <span className={`text-sm font-semibold ${l.tipo === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Descrição *</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Serviço — coloração" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as 'entrada' | 'saida')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Valor (R$) *</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Categoria</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={onSave} disabled={!descricao || !valor || criar.isPending}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalaoLayout>
  )
}
