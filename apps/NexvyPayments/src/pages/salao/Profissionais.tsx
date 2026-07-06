import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

// Re-skin premium data-injectable. Camada de dados preservada: tabela
// `profissionais` por organization_id (cadastro/criação, como no original).

export interface Profissional {
  id: string
  organization_id?: string
  nome: string
  email: string | null
  telefone: string | null
  especialidades: string[] | null
  comissao_pct: number | null
  foto_url?: string | null
  ativo: boolean | null
  hora_inicio?: string | null
  hora_fim?: string | null
  dias_atendimento?: number[] | null
  created_at?: string
}

// Dias da semana: 0=domingo .. 6=sábado
const DIAS_SEMANA = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]
const DIAS_DEFAULT = [1, 2, 3, 4, 5, 6]
const HORA_INICIO_DEFAULT = '09:00'
const HORA_FIM_DEFAULT = '18:00'

// `profissionais` ainda não está no types.ts gerado — builder destipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any }

export default function Profissionais({ demo }: { demo?: Profissional[] } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [especialidades, setEspecialidades] = useState('')
  const [comissaoPct, setComissaoPct] = useState('')
  const [horaInicio, setHoraInicio] = useState(HORA_INICIO_DEFAULT)
  const [horaFim, setHoraFim] = useState(HORA_FIM_DEFAULT)
  const [diasAtendimento, setDiasAtendimento] = useState<number[]>(DIAS_DEFAULT)

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['profissionais', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await db
        .from('profissionais').select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Profissional[]
    },
  })

  const profissionais = demo ?? fetched
  const reset = () => {
    setShowForm(false); setEditingId(null)
    setNome(''); setEmail(''); setTelefone(''); setEspecialidades(''); setComissaoPct('')
    setHoraInicio(HORA_INICIO_DEFAULT); setHoraFim(HORA_FIM_DEFAULT); setDiasAtendimento(DIAS_DEFAULT)
  }

  const toggleDia = (dia: number) =>
    setDiasAtendimento((prev) => prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort((a, b) => a - b))

  const openNovo = () => {
    setEditingId(null)
    setNome(''); setEmail(''); setTelefone(''); setEspecialidades(''); setComissaoPct('')
    setHoraInicio(HORA_INICIO_DEFAULT); setHoraFim(HORA_FIM_DEFAULT); setDiasAtendimento(DIAS_DEFAULT)
    setShowForm(true)
  }

  const openEditar = (p: Profissional) => {
    setEditingId(p.id)
    setNome(p.nome ?? '')
    setEmail(p.email ?? '')
    setTelefone(p.telefone ?? '')
    setEspecialidades((p.especialidades ?? []).join(', '))
    setComissaoPct(p.comissao_pct != null ? String(p.comissao_pct) : '')
    setHoraInicio((p.hora_inicio ?? HORA_INICIO_DEFAULT).slice(0, 5))
    setHoraFim((p.hora_fim ?? HORA_FIM_DEFAULT).slice(0, 5))
    setDiasAtendimento(Array.isArray(p.dias_atendimento) ? p.dias_atendimento : DIAS_DEFAULT)
    setShowForm(true)
  }

  const criar = useMutation({
    mutationFn: async () => {
      const especialidadesArr = especialidades.split(',').map((e) => e.trim()).filter(Boolean)
      const { error } = await db.from('profissionais').insert({
        organization_id: organizationId!,
        nome, email: email || null, telefone: telefone || null,
        especialidades: especialidadesArr, comissao_pct: comissaoPct ? Number(comissaoPct) : 0, ativo: true,
        hora_inicio: horaInicio, hora_fim: horaFim, dias_atendimento: diasAtendimento,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais', organizationId] })
      toast.success('Profissional cadastrado!')
      reset()
    },
    onError: () => toast.error('Erro ao cadastrar profissional.'),
  })

  const atualizar = useMutation({
    mutationFn: async () => {
      const especialidadesArr = especialidades.split(',').map((e) => e.trim()).filter(Boolean)
      const { error } = await db.from('profissionais').update({
        nome, email: email || null, telefone: telefone || null,
        especialidades: especialidadesArr, comissao_pct: comissaoPct ? Number(comissaoPct) : 0,
        hora_inicio: horaInicio, hora_fim: horaFim, dias_atendimento: diasAtendimento,
      }).eq('id', editingId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais', organizationId] })
      toast.success('Profissional atualizado!')
      reset()
    },
    onError: () => toast.error('Erro ao atualizar profissional.'),
  })

  const onSave = () => {
    if (isDemo) { toast.info('Ação indisponível no modo demonstração'); return }
    if (horaInicio >= horaFim) { toast.error('A hora de início deve ser anterior à hora de fim.'); return }
    if (editingId) atualizar.mutate(); else criar.mutate()
  }

  const saving = criar.isPending || atualizar.isPending

  const filtered = profissionais.filter((p) =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.telefone?.includes(search) ||
    (p.especialidades ?? []).some((e) => e.toLowerCase().includes(search.toLowerCase())),
  )

  if (!isDemo && !organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}

        <PageHeader
          title="Profissionais"
          description={`${profissionais.length} ${profissionais.length === 1 ? 'profissional cadastrado' : 'profissionais cadastrados'}`}
          action={<Button onClick={openNovo}><Plus className="mr-2 h-4 w-4" />Novo profissional</Button>}
        />

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, email ou especialidade..." className="pl-9" />
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{search ? 'Nenhum profissional encontrado.' : 'Nenhum profissional cadastrado ainda.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Especialidades</TableHead>
                  <TableHead className="hidden md:table-cell">Contato</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => !isDemo && openEditar(p)}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {(p.especialidades ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(p.especialidades ?? []).map((esp, i) => <Badge key={i} variant="secondary" className="font-normal">{esp}</Badge>)}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{p.email ?? p.telefone ?? '—'}</TableCell>
                    <TableCell>{(p.comissao_pct ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.ativo !== false
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : 'border-muted-foreground/30 text-muted-foreground'}>
                        {p.ativo !== false ? 'ativo' : 'inativo'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar profissional' : 'Novo profissional'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Especialidades</Label><Input value={especialidades} onChange={(e) => setEspecialidades(e.target.value)} placeholder="separadas por vírgula (ex: Corte, Coloração)" /></div>
            <div className="space-y-2"><Label>Comissão (%)</Label><Input type="number" min="0" max="100" step="0.01" value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Hora de início</Label><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
              <div className="space-y-2"><Label>Hora de fim</Label><Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Dias de atendimento</Label>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map((dia) => {
                  const ativo = diasAtendimento.includes(dia.value)
                  return (
                    <Button
                      key={dia.value}
                      type="button"
                      size="sm"
                      variant={ativo ? 'default' : 'outline'}
                      onClick={() => toggleDia(dia.value)}
                      className="min-w-[3rem]"
                    >
                      {dia.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={onSave} disabled={!nome.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalaoLayout>
  )
}
