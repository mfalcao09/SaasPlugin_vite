import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Scissors, Plus, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'

interface Profissional {
  id: string
  organization_id: string
  nome: string
  email: string | null
  telefone: string | null
  especialidades: string[] | null
  comissao_pct: number | null
  foto_url: string | null
  ativo: boolean | null
  created_at?: string
}

// A tabela `profissionais` ainda não consta no types.ts gerado do Supabase
// (apenas as tabelas de oficina foram geradas). Acessamos via builder destipado
// até o types.ts ser regenerado com o schema do salão. O retorno do select é
// reanexado ao tipo Profissional para manter a leitura tipada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any }

export default function Profissionais() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [especialidades, setEspecialidades] = useState('')
  const [comissaoPct, setComissaoPct] = useState('')

  const { data: profissionais = [], isLoading } = useQuery({
    queryKey: ['profissionais', organizationId],
    queryFn: async () => {
      const { data, error } = await db
        .from('profissionais').select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Profissional[]
    },
    enabled: !!organizationId,
  })

  const criar = useMutation({
    mutationFn: async () => {
      const especialidadesArr = especialidades
        .split(',')
        .map(e => e.trim())
        .filter(Boolean)
      const { error } = await db.from('profissionais').insert({
        organization_id: organizationId!,
        nome,
        email: email || null,
        telefone: telefone || null,
        especialidades: especialidadesArr,
        comissao_pct: comissaoPct ? Number(comissaoPct) : 0,
        ativo: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais', organizationId] })
      toast.success('Profissional cadastrado!')
      setShowForm(false); setNome(''); setEmail(''); setTelefone(''); setEspecialidades(''); setComissaoPct('')
    },
    onError: () => toast.error('Erro ao cadastrar profissional.'),
  })

  const filtered = profissionais.filter(p =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.telefone?.includes(search) ||
    (p.especialidades ?? []).some(e => e.toLowerCase().includes(search.toLowerCase()))
  )

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profissionais</h1>
          <p className="text-muted-foreground text-sm mt-1">{profissionais.length} profissionais cadastrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Profissional
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Novo Profissional</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Telefone" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={especialidades} onChange={e => setEspecialidades(e.target.value)} placeholder="Especialidades (separadas por vírgula)" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary sm:col-span-2" />
            <input value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="Comissão (%)" type="number" min="0" max="100" step="0.01" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!nome.trim() || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, email ou especialidade..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Scissors className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'Nenhum profissional encontrado.' : 'Nenhum profissional cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Especialidades</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Contato</th>
                <th className="px-5 py-3 font-medium">Comissão</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-foreground font-medium">{p.nome}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">
                    {(p.especialidades ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(p.especialidades ?? []).map((esp, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground">{esp}</span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{p.email ?? p.telefone ?? '—'}</td>
                  <td className="px-5 py-3 text-foreground">{(p.comissao_pct ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.ativo !== false ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{p.ativo !== false ? 'ativo' : 'inativo'}</span>
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
