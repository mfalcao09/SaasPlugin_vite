import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { SalaoLayout, NoOrg, formatCurrency, useOrganizationId } from './_shared'

interface Servico {
  id: string
  organization_id: string
  nome: string
  preco_base: number | null
  ativo: boolean | null
  duracao_minutos: number | null
  categoria: string | null
  descricao: string | null
}

interface ServicoForm {
  nome: string
  categoria: string
  descricao: string
  duracao_minutos: string
  preco_base: string
  ativo: boolean
}

const EMPTY_FORM: ServicoForm = {
  nome: '',
  categoria: '',
  descricao: '',
  duracao_minutos: '30',
  preco_base: '',
  ativo: true,
}

export default function Servicos() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ServicoForm>(EMPTY_FORM)

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ['servicos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servico_catalogo')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Servico[]
    },
    enabled: !!organizationId,
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId!,
        nome: form.nome.trim(),
        categoria: form.categoria.trim() || null,
        descricao: form.descricao.trim() || null,
        duracao_minutos: form.duracao_minutos ? Number(form.duracao_minutos) : 30,
        preco_base: form.preco_base ? Number(form.preco_base) : 0,
        ativo: form.ativo,
      }
      if (editingId) {
        const { error } = await supabase
          .from('servico_catalogo')
          .update(payload)
          .eq('id', editingId)
          .eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('servico_catalogo').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicos', organizationId] })
      toast.success(editingId ? 'Serviço atualizado!' : 'Serviço cadastrado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar serviço.'),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('servico_catalogo')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicos', organizationId] })
      toast.success('Serviço excluído!')
    },
    onError: () => toast.error('Erro ao excluir serviço.'),
  })

  const abrirNovo = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const abrirEdicao = (s: Servico) => {
    setEditingId(s.id)
    setForm({
      nome: s.nome ?? '',
      categoria: s.categoria ?? '',
      descricao: s.descricao ?? '',
      duracao_minutos: s.duracao_minutos != null ? String(s.duracao_minutos) : '30',
      preco_base: s.preco_base != null ? String(s.preco_base) : '',
      ativo: s.ativo ?? true,
    })
    setShowForm(true)
  }

  const filtered = servicos.filter(s =>
    s.nome?.toLowerCase().includes(search.toLowerCase()) ||
    s.categoria?.toLowerCase().includes(search.toLowerCase())
  )

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Serviços</h1>
          <p className="text-muted-foreground text-sm mt-1">{servicos.length} serviços cadastrados</p>
        </div>
        <button onClick={() => (showForm ? resetForm() : abrirNovo())} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Serviço
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">{editingId ? 'Editar Serviço' : 'Novo Serviço'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Categoria" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.duracao_minutos} onChange={e => setForm(f => ({ ...f, duracao_minutos: e.target.value }))} placeholder="Duração (min)" type="number" min="0" step="5" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.preco_base} onChange={e => setForm(f => ({ ...f, preco_base: e.target.value }))} placeholder="Preço base (R$)" type="number" min="0" step="0.01" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição" rows={2} className="sm:col-span-2 px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground select-none cursor-pointer w-fit">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} className="h-4 w-4 rounded border-input accent-primary" />
            Serviço ativo
          </label>
          <div className="flex gap-2">
            <button onClick={() => salvar.mutate()} disabled={!form.nome.trim() || salvar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou categoria..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'Nenhum serviço encontrado.' : 'Nenhum serviço cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Serviço</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Categoria</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Duração</th>
                <th className="px-5 py-3 font-medium">Preço</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-foreground font-medium">
                    {s.nome}
                    {s.descricao ? <span className="block text-xs text-muted-foreground font-normal">{s.descricao}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{s.categoria ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{s.duracao_minutos != null ? `${s.duracao_minutos} min` : '—'}</td>
                  <td className="px-5 py-3 text-foreground font-semibold">{formatCurrency(s.preco_base)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{s.ativo ? 'ativo' : 'inativo'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => abrirEdicao(s)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => excluir.mutate(s.id)} disabled={excluir.isPending} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </SalaoLayout>
  )
}
