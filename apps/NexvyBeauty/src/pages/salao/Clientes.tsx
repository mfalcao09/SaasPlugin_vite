import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'

interface Cliente {
  id: string
  organization_id: string
  nome: string
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  status: string | null
  tags: string[] | null
  observacoes: string | null
}

interface FormState {
  nome: string
  telefone: string
  email: string
  cpf_cnpj: string
  status: string
  tags: string
  observacoes: string
}

const EMPTY_FORM: FormState = {
  nome: '',
  telefone: '',
  email: '',
  cpf_cnpj: '',
  status: 'ativo',
  tags: '',
  observacoes: '',
}

export default function Clientes() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['salao-clientes', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes').select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Cliente[]
    },
    enabled: !!organizationId,
  })

  const setField = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (c: Cliente) => {
    setForm({
      nome: c.nome ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      cpf_cnpj: c.cpf_cnpj ?? '',
      status: c.status ?? 'ativo',
      tags: (c.tags ?? []).join(', '),
      observacoes: c.observacoes ?? '',
    })
    setEditingId(c.id)
    setShowForm(true)
  }

  const buildPayload = () => ({
    nome: form.nome.trim(),
    telefone: form.telefone.trim() || null,
    email: form.email.trim() || null,
    cpf_cnpj: form.cpf_cnpj.trim() || null,
    status: form.status || 'ativo',
    tags: form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    observacoes: form.observacoes.trim() || null,
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (editingId) {
        const { error } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', editingId)
          .eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clientes')
          .insert({ ...payload, organization_id: organizationId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success(editingId ? 'Cliente atualizado!' : 'Cliente cadastrado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar cliente.'),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success('Cliente excluído.')
    },
    onError: () => toast.error('Erro ao excluir cliente.'),
  })

  const handleDelete = (c: Cliente) => {
    if (window.confirm(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) {
      excluir.mutate(c.id)
    }
  }

  const filtered = clientes.filter(c =>
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf_cnpj?.includes(search)
  )

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{clientes.length} clientes cadastrados</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Cliente
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">{editingId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={form.nome} onChange={e => setField('nome', e.target.value)} placeholder="Nome *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.telefone} onChange={e => setField('telefone', e.target.value)} placeholder="Telefone" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.email} onChange={e => setField('email', e.target.value)} placeholder="Email" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={form.cpf_cnpj} onChange={e => setField('cpf_cnpj', e.target.value)} placeholder="CPF / CNPJ" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <select value={form.status} onChange={e => setField('status', e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
            <input value={form.tags} onChange={e => setField('tags', e.target.value)} placeholder="Tags (separadas por vírgula)" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
          </div>
          <textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} placeholder="Observações" rows={3} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary resize-none" />
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Telefone</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">CPF/CNPJ</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-foreground font-medium">{c.nome}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{c.telefone ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden lg:table-cell">{c.cpf_cnpj ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{c.status ?? 'ativo'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c)} disabled={excluir.isPending} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors" title="Excluir">
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
