import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2, Pencil, Trash2, Flame, Merge, Eye, Activity, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { scoreTier } from '@/components/lead/LeadScoreBadge'
import { normalizeBrPhone } from '@/cockpit/types'
import { MaybeSalaoShell, NoOrg, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'
import ClienteDetail from './ClienteDetail'

// Re-skin premium (dark via tokens, shadcn) + data-injectable: sem `demo`
// busca Supabase real; com `demo` usa seed (rota /demo, sem auth, sem gravar).
// Camada de dados preservada: tabela `clientes` por organization_id.

export interface Cliente {
  id: string
  organization_id?: string
  nome: string
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  status: string | null
  tags: string[] | null
  observacoes: string | null
  /** vínculo opcional com um lead do CRM (origem do score/temperatura) */
  lead_id?: string | null
  /** data de nascimento (YYYY-MM-DD) — alimenta a alavanca de aniversariantes + faixa etária */
  data_nascimento?: string | null
  /** [B4] O QUE o contato é — os 3 eixos convivem neste campo:
   *  forma (determinístico): ruido | grupo | nao_br | lid
   *  relação (transacional): cliente | lead
   *  assunto (agente lê a conversa): pessoal | misto | indefinido */
  tipo_contato?: string | null
  /** [B4] ONDE aparece: principal | a_revisar | lixeira */
  carteira_estado?: string | null
  /** [B4] saída do classificador COM evidência — é o que a dona compra quando
   *  pergunta "por que essa é pessoal?" */
  sinais_wa?: {
    assunto?: string
    confianca?: number | null
    versao?: string
    evidencias?: string[]
    sinais?: { pediu_horario?: boolean; perguntou_preco?: boolean; servicos_citados?: string[] }
    janela?: { msgs_lidas?: number; de?: string | null; ate?: string | null }
  } | null
  classificacao_motivo?: string | null
  /** [B4] decisão humana. Preenchido = nenhum classificador toca esta linha. */
  revisado_em?: string | null
  /** endereço estruturado (CEP preenche logradouro/bairro/cidade/uf; número e complemento manuais) — pra segmentar por região */
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  created_at?: string | null
}

interface FormState {
  nome: string; telefone: string; email: string; cpf_cnpj: string; status: string; tags: string; observacoes: string; data_nascimento: string
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string
}

const EMPTY_FORM: FormState = {
  nome: '', telefone: '', email: '', cpf_cnpj: '', status: 'ativo', tags: '', observacoes: '', data_nascimento: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}

// Idade a partir de YYYY-MM-DD (sem new Date(iso) — evita shift de fuso). null se inválida.
function idadeDe(iso: string): number | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const hoje = new Date()
  let age = hoje.getFullYear() - y
  const mm = hoje.getMonth() + 1
  if (mm < m || (mm === m && hoje.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : null
}

type SortMode = 'default' | 'hottest'

// [B4] Fatias da carteira produzidas pela classificação Camada 1.
// 'principal'  = carteira real (o que a dona trabalha)
// 'a_revisar'  = número BR discável que chegou pelo sync do WhatsApp sem nome
// 'lixeira'    = LID/0800/DDD inexistente — ruído, mas recuperável
type CarteiraView = 'principal' | 'a_revisar' | 'lixeira'

// [B4] O eixo ASSUNTO, decidido pelo agente que lê a conversa. Vive no mesmo campo
// que `cliente` porque é uma tag do mesmo tipo — decisão do Marcelo. `pessoal`
// continua VISÍVEL na carteira; quem a exclui de campanha é o gate de disparo.
type TipoFiltro = 'todos' | 'cliente' | 'lead' | 'misto' | 'pessoal' | 'indefinido'

const TIPO_META: Record<string, { label: string; classe: string; ajuda: string }> = {
  cliente:    { label: 'Cliente',    classe: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', ajuda: 'Já agendou ou pagou — relação comprovada.' },
  lead:       { label: 'Lead',       classe: 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-300',            ajuda: 'Fala de serviço, ainda não comprou.' },
  misto:      { label: 'Misto',      classe: 'border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-300',    ajuda: 'Fala de salão E de vida pessoal.' },
  pessoal:    { label: 'Pessoal',    classe: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300',        ajuda: 'Conversa pessoal — fora das campanhas do salão.' },
  indefinido: { label: 'A definir',  classe: 'border-muted-foreground/30 text-muted-foreground',                              ajuda: 'Pouca conversa para afirmar.' },
}

const TIPO_FILTROS: { value: TipoFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'lead', label: 'Leads' },
  { value: 'misto', label: 'Mistos' },
  { value: 'pessoal', label: 'Pessoais' },
  { value: 'indefinido', label: 'A definir' },
]

const CARTEIRA_TABS: { value: CarteiraView; label: string; hint: string }[] = [
  { value: 'principal', label: 'Minha carteira', hint: 'Seus clientes.' },
  {
    value: 'a_revisar',
    label: 'A revisar',
    hint: 'Contatos do WhatsApp com telefone válido, mas sem nome. Podem ser clientes — marque os que forem.',
  },
  {
    value: 'lixeira',
    label: 'Ruído',
    hint: 'Números não discáveis no Brasil (IDs internos do WhatsApp, 0800, DDD inexistente). Nada foi apagado — se algum for cliente, é só marcar.',
  },
]

// ─── Tier do lead vinculado (Quente/Morno/Frio) ─────────────────────────
// Reusa o helper canônico do LeadScoreBadge (mesmos cortes 70/40 + cores).
function TierBadge({ score }: { score: number }) {
  const t = scoreTier(score)
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${t.bg} ${t.text}`} title={`Lead score ${Math.round(score)} · ${t.label}`}>
      <Flame className="h-3 w-3" />
      {t.label}
    </Badge>
  )
}

// ─── Detecção de duplicatas (client-side, por telefone normalizado) ──────
interface DupGroup {
  phone: string
  keep: Cliente
  dups: Cliente[]
}

/** Conta quantos campos relevantes do cadastro estão preenchidos (tie de qualidade). */
function filledScore(c: Cliente): number {
  let n = 0
  if (c.nome?.trim()) n++
  if (c.telefone?.trim()) n++
  if (c.email?.trim()) n++
  if (c.cpf_cnpj?.trim()) n++
  if (c.observacoes?.trim()) n++
  if (c.tags && c.tags.length) n++
  if (c.lead_id) n++
  return n
}

/**
 * Agrupa por telefone normalizado; grupos com ≥2 viram duplicatas.
 * keep = mais dados preenchidos; empate → created_at mais antigo.
 */
function detectDuplicates(clientes: Cliente[]): DupGroup[] {
  const byPhone = new Map<string, Cliente[]>()
  for (const c of clientes) {
    const phone = normalizeBrPhone(c.telefone)
    if (!phone) continue // ignora vazios/null
    const arr = byPhone.get(phone) ?? []
    arr.push(c)
    byPhone.set(phone, arr)
  }
  const groups: DupGroup[] = []
  for (const [phone, arr] of byPhone) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => {
      const fd = filledScore(b) - filledScore(a)
      if (fd !== 0) return fd
      // tie-break: created_at mais antigo primeiro (vira o keep)
      const ta = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY
      const tb = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY
      return ta - tb
    })
    const [keep, ...dups] = sorted
    groups.push({ phone, keep, dups })
  }
  return groups
}

export default function Clientes({ demo, bare }: { demo?: Cliente[]; bare?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [cepLoading, setCepLoading] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [carteiraView, setCarteiraView] = useState<CarteiraView>('principal')
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [mergeTarget, setMergeTarget] = useState<DupGroup | null>(null)
  // Perfil 360: cliente selecionado abre o Sheet de detalhe.
  const [selected, setSelected] = useState<Cliente | null>(null)

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['salao-clientes', organizationId, carteiraView, tipoFiltro],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      // [B4] A carteira operacional é só 'principal'. As outras fatias vêm da
      // classificação e continuam acessíveis pelas abas — filtrar não pode parecer
      // perder. Seguro porque a Camada 1 POSITIVA trava em 'principal' todo cliente
      // com agendamento/pagamento: nenhum cliente real cai fora daqui.
      let query = supabase
        .from('clientes').select('*')
        .eq('organization_id', organizationId!)
        .eq('carteira_estado', carteiraView)
      // Filtro por ASSUNTO aplicado NO BANCO, não em memória: a lista é limitada a
      // 500, então filtrar depois esconderia resultado que existe.
      if (tipoFiltro !== 'todos') query = query.eq('tipo_contato', tipoFiltro)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Cliente[]
    },
  })

  // [B4] Contagem por fatia — alimenta as abas. Sem este número a dona não teria
  // como saber que 80 mil contatos foram classificados, e "filtrado" viraria "sumiu".
  const { data: carteiraCounts } = useQuery({
    queryKey: ['salao-clientes-carteira-counts', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const entries = await Promise.all(
        CARTEIRA_TABS.map(async ({ value }) => {
          const { count, error } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId!)
            .eq('carteira_estado', value)
          if (error) throw error
          return [value, count ?? 0] as const
        }),
      )
      return Object.fromEntries(entries) as Record<CarteiraView, number>
    },
  })

  const clientes = demo ?? fetched

  // ─── Feature #3: scores dos leads vinculados ──────────────────────────
  // Busca leads referenciados por clientes.lead_id (só dado real, só se houver vínculos).
  const leadIds = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.lead_id).filter((id): id is string => !!id))),
    [clientes],
  )

  const { data: leadScores = {} } = useQuery({
    queryKey: ['salao-clientes-lead-scores', organizationId, leadIds],
    enabled: !isDemo && !!organizationId && leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads').select('id, score, temperature')
        .eq('organization_id', organizationId!)
        .in('id', leadIds)
      if (error) throw error
      const map: Record<string, { score: number | null; temperature: string | null }> = {}
      for (const l of (data ?? []) as { id: string; score: number | null; temperature: string | null }[]) {
        map[l.id] = { score: l.score, temperature: l.temperature }
      }
      return map
    },
  })

  /** score do lead vinculado a um cliente (ou null se sem lead/sem score). */
  const scoreOf = (c: Cliente): number | null => {
    if (!c.lead_id) return null
    const s = leadScores[c.lead_id]?.score
    return s == null ? null : s
  }

  // ─── Feature #4: duplicatas (só dado real) ────────────────────────────
  const dupGroups = useMemo(() => (isDemo ? [] : detectDuplicates(clientes)), [isDemo, clientes])

  const setField = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  // ── Busca de endereço por CEP (ViaCEP, público + CORS-ok). Preenche logradouro/
  //    bairro/cidade/uf; número e complemento ficam manuais. ──
  const buscarCep = async (cepRaw: string) => {
    const cep = cepRaw.replace(/\D/g, '')
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await r.json()
      if (d.erro) { toast.error('CEP não encontrado'); return }
      setForm((prev) => ({
        ...prev,
        logradouro: d.logradouro || prev.logradouro,
        bairro: d.bairro || prev.bairro,
        cidade: d.localidade || prev.cidade,
        uf: d.uf || prev.uf,
      }))
    } catch {
      toast.error('Não deu pra buscar o CEP agora')
    } finally {
      setCepLoading(false)
    }
  }

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false) }
  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }
  const openEdit = (c: Cliente) => {
    setForm({
      nome: c.nome ?? '', telefone: c.telefone ?? '', email: c.email ?? '', cpf_cnpj: c.cpf_cnpj ?? '',
      status: c.status ?? 'ativo', tags: (c.tags ?? []).join(', '), observacoes: c.observacoes ?? '',
      data_nascimento: c.data_nascimento ?? '',
      cep: c.cep ?? '', logradouro: c.logradouro ?? '', numero: c.numero ?? '', complemento: c.complemento ?? '',
      bairro: c.bairro ?? '', cidade: c.cidade ?? '', uf: c.uf ?? '',
    })
    setEditingId(c.id); setShowForm(true)
  }

  const buildPayload = () => {
    const g = (s: string) => s.trim()
    // Recompõe o `endereco` legado (texto livre) a partir dos campos estruturados,
    // pra não quebrar quem ainda lê essa coluna.
    const enderecoComposto = [
      g(form.logradouro),
      g(form.numero) && `nº ${g(form.numero)}`,
      g(form.complemento),
      g(form.bairro),
      [g(form.cidade), g(form.uf)].filter(Boolean).join('/'),
    ].filter(Boolean).join(', ') || null
    return {
      nome: g(form.nome),
      telefone: g(form.telefone) || null,
      email: g(form.email) || null,
      cpf_cnpj: g(form.cpf_cnpj) || null,
      status: form.status || 'ativo',
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      observacoes: g(form.observacoes) || null,
      data_nascimento: g(form.data_nascimento) || null,
      cep: g(form.cep) || null,
      logradouro: g(form.logradouro) || null,
      numero: g(form.numero) || null,
      complemento: g(form.complemento) || null,
      bairro: g(form.bairro) || null,
      cidade: g(form.cidade) || null,
      uf: g(form.uf) || null,
      endereco: enderecoComposto,
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clientes').insert({ ...payload, organization_id: organizationId! })
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
      const { error } = await supabase.from('clientes').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      qc.invalidateQueries({ queryKey: ['salao-clientes-carteira-counts', organizationId] })
      toast.success('Cliente excluído.')
    },
    onError: () => toast.error('Erro ao excluir cliente.'),
  })

  // [B4] Resgate manual: a dona diz "isto é cliente". Grava revisado_em, que TRAVA a
  // linha — nenhuma reclassificação automática futura pode devolvê-la para a lixeira.
  // É o contrapeso obrigatório de classificar automaticamente: a máquina erra, e a
  // pessoa que conhece a clientela precisa poder desfazer em um clique.
  // [B4] Contagem por ASSUNTO dentro da fatia visível — é o número que a análise de
  // carteira vende: "você tem N contatos que falam de salão e nunca agendaram".
  const { data: tipoCounts } = useQuery({
    queryKey: ['salao-clientes-tipo-counts', organizationId, carteiraView],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const tipos = TIPO_FILTROS.filter((t) => t.value !== 'todos').map((t) => t.value)
      const entries = await Promise.all(
        tipos.map(async (t) => {
          const { count, error } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId!)
            .eq('carteira_estado', carteiraView)
            .eq('tipo_contato', t)
          if (error) throw error
          return [t, count ?? 0] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, number>
    },
  })

  // [B4] A dona diz "isto é pessoal" — mesma trava do "É cliente": grava revisado_em,
  // e a partir daí nenhum classificador automático mexe nessa linha.
  const marcarTipo = useMutation({
    mutationFn: async ({ c, tipo }: { c: Cliente; tipo: 'cliente' | 'pessoal' }) => {
      const { error } = await supabase.from('clientes').update({
        tipo_contato: tipo,
        carteira_estado: 'principal',
        revisado_em: new Date().toISOString(),
        classificacao_motivo: `revisao da dona: marcado como ${tipo}`,
      }).eq('id', c.id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      qc.invalidateQueries({ queryKey: ['salao-clientes-carteira-counts', organizationId] })
      qc.invalidateQueries({ queryKey: ['salao-clientes-tipo-counts', organizationId] })
      toast.success(v.tipo === 'cliente' ? 'Movido para a sua carteira.' : 'Marcado como pessoal — fora das campanhas.')
    },
    onError: () => toast.error('Não deu pra salvar agora.'),
  })

  // ─── Feature #4: merge transacional via RPC ───────────────────────────
  const juntar = useMutation({
    mutationFn: async (group: DupGroup) => {
      const { data, error } = await supabase.rpc('merge_clientes', {
        p_keep: group.keep.id,
        p_dups: group.dups.map((d) => d.id),
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (removidos) => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success(`${removidos ?? 0} cadastro(s) duplicado(s) removido(s).`)
      setMergeTarget(null)
    },
    onError: (e) => {
      toast.error((e as Error)?.message || 'Erro ao juntar cadastros.')
      setMergeTarget(null)
    },
  })

  const onSave = () => isDemo ? toast.info('Ação indisponível no modo demonstração') : salvar.mutate()
  const handleDelete = (c: Cliente) => {
    if (isDemo) return toast.info('Ação indisponível no modo demonstração')
    if (window.confirm(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) excluir.mutate(c.id)
  }

  const filtered = clientes.filter((c) =>
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf_cnpj?.includes(search),
  )

  // Ordenação: default mantém a ordem da query (created_at desc); "hottest"
  // ordena por score do lead desc, clientes sem score por último (estável).
  const visible = useMemo(() => {
    if (sortMode !== 'hottest') return filtered
    return [...filtered].sort((a, b) => {
      const sa = scoreOf(a)
      const sb = scoreOf(b)
      if (sa == null && sb == null) return 0
      if (sa == null) return 1
      if (sb == null) return -1
      return sb - sa
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortMode, leadScores])

  if (!isDemo && !organizationId) return <MaybeSalaoShell bare={bare}><NoOrg /></MaybeSalaoShell>

  return (
    <MaybeSalaoShell bare={bare}>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}

        <PageHeader
          title="Clientes"
          description={`${clientes.length} ${clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`}
          action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>}
        />

        {/* Feature #4: banner de duplicatas (só dado real) */}
        {!isDemo && dupGroups.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Merge className="h-4 w-4" />
              Clientes duplicadas: {dupGroups.length} — juntar
            </div>
            <div className="mt-3 space-y-2">
              {dupGroups.map((g) => (
                <div key={g.phone} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{[g.keep, ...g.dups].map((c) => c.nome).join(' · ')}</span>
                    <span className="ml-2 text-muted-foreground">{g.keep.telefone ?? g.phone}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setMergeTarget(g)}>
                    <Merge className="mr-1 h-3.5 w-3.5" />Juntar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 2d: Saúde da Base virou aviso aqui (saiu do menu) — link pro diagnóstico */}
        {!isDemo && (
          <Link to="/saude" className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60">
            <span className="flex items-center gap-2 text-foreground">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Quer saber se sua base está saudável? Veja a <span className="font-medium">qualidade do cadastro</span>.
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {/* [B4] Abas da carteira — só aparecem se a classificação separou alguma coisa.
            Existem para que "filtrado" nunca seja confundido com "sumiu". */}
        {!isDemo && ((carteiraCounts?.a_revisar ?? 0) > 0 || (carteiraCounts?.lixeira ?? 0) > 0) && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {CARTEIRA_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  size="sm"
                  variant={carteiraView === tab.value ? 'default' : 'outline'}
                  onClick={() => setCarteiraView(tab.value)}
                >
                  {tab.label}
                  <Badge variant="secondary" className="ml-2 tabular-nums">
                    {(carteiraCounts?.[tab.value] ?? 0).toLocaleString('pt-BR')}
                  </Badge>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {CARTEIRA_TABS.find((t) => t.value === carteiraView)?.hint}
              {(carteiraCounts?.[carteiraView] ?? 0) > 500 &&
                ` Mostrando os 500 mais recentes de ${(carteiraCounts?.[carteiraView] ?? 0).toLocaleString('pt-BR')}.`}
            </p>
          </div>
        )}

        {/* [B4] ANÁLISE DA CARTEIRA — é isto que se vende. O agente leu as conversas
            e separou o que é do salão do que é vida pessoal, com evidência por contato. */}
        {!isDemo && (tipoCounts?.pessoal ?? 0) + (tipoCounts?.misto ?? 0) + (tipoCounts?.lead ?? 0) > 0 && (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Análise da carteira</span>
              <span className="text-xs text-muted-foreground">
                — o agente leu as conversas e separou o que é do salão
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {TIPO_FILTROS.filter((t) => t.value !== 'todos').map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipoFiltro(tipoFiltro === t.value ? 'todos' : (t.value as TipoFiltro))}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    tipoFiltro === t.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="text-lg font-bold tabular-nums">
                    {(tipoCounts?.[t.value] ?? 0).toLocaleString('pt-BR')}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                </button>
              ))}
            </div>
            {tipoFiltro !== 'todos' && (
              <p className="mt-3 text-xs text-muted-foreground">
                {TIPO_META[tipoFiltro]?.ajuda}{' '}
                <button className="text-primary underline" onClick={() => setTipoFiltro('todos')}>
                  limpar filtro
                </button>
              </p>
            )}
            {(tipoCounts?.lead ?? 0) > 0 && tipoFiltro === 'todos' && (
              <p className="mt-3 text-xs text-muted-foreground">
                <b className="text-foreground">{(tipoCounts?.lead ?? 0).toLocaleString('pt-BR')} contatos falam de
                serviço e nunca agendaram.</b> Esse é o dinheiro parado na sua carteira.
              </p>
            )}
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..." className="pl-9" />
          </div>
          {/* Feature #3: ordenação */}
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Mais recentes primeiro</SelectItem>
              <SelectItem value="hottest">Mais quentes primeiro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search
                  ? 'Nenhum cliente encontrado.'
                  : carteiraView === 'principal'
                    ? 'Nenhum cliente cadastrado ainda.'
                    : 'Nada nesta aba.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const score = scoreOf(c)
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(c)}
                      title="Ver perfil 360"
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{c.nome || <span className="text-muted-foreground">(sem nome)</span>}</span>
                          {score != null && <TierBadge score={score} />}
                          {/* [B4] A tag do agente + a EVIDÊNCIA no title. A dona vai
                              perguntar "por que essa é pessoal?" — a resposta tem que
                              estar a um hover, não numa reunião. */}
                          {c.tipo_contato && TIPO_META[c.tipo_contato] && (
                            <Badge
                              variant="outline"
                              className={TIPO_META[c.tipo_contato].classe}
                              title={
                                c.sinais_wa?.evidencias?.length
                                  ? `Porque: ${c.sinais_wa.evidencias.join(' · ')}`
                                  : TIPO_META[c.tipo_contato].ajuda
                              }
                            >
                              {TIPO_META[c.tipo_contato].label}
                              {c.revisado_em ? ' ✓' : ''}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{c.telefone ?? '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{c.email ?? '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{c.cpf_cnpj ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.status === 'inativo'
                          ? 'border-muted-foreground/30 text-muted-foreground'
                          : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}>
                          {c.status ?? 'ativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* [B4] Revisão da dona. Os dois botões gravam revisado_em —
                              a partir daí nenhum classificador automático mexe na linha.
                              É o contrapeso obrigatório de classificar por IA: a máquina
                              erra, e quem conhece a clientela precisa desfazer num clique. */}
                          {/* Resgate: nas abas fora da carteira, trazer de volta. */}
                          {!isDemo && carteiraView !== 'principal' && (
                            <Button
                              size="sm" variant="outline" disabled={marcarTipo.isPending}
                              onClick={(e) => { e.stopPropagation(); marcarTipo.mutate({ c, tipo: 'cliente' }) }}
                              title="Mover para a minha carteira"
                            >
                              É cliente
                            </Button>
                          )}
                          {/* Correção do agente: só aparece onde ELE opinou (tem sinais_wa)
                              e a dona ainda não decidiu. Sem isso o botão poluiria 500
                              linhas de uma carteira que ninguém classificou. */}
                          {!isDemo && carteiraView === 'principal' && c.sinais_wa && !c.revisado_em && (
                            c.tipo_contato === 'pessoal' ? (
                              <Button
                                size="sm" variant="ghost" disabled={marcarTipo.isPending}
                                onClick={(e) => { e.stopPropagation(); marcarTipo.mutate({ c, tipo: 'cliente' }) }}
                                title="Na verdade é cliente do salão"
                                className="text-muted-foreground hover:text-emerald-600"
                              >
                                É cliente
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="ghost" disabled={marcarTipo.isPending}
                                onClick={(e) => { e.stopPropagation(); marcarTipo.mutate({ c, tipo: 'pessoal' }) }}
                                title="Marcar como pessoal — sai das campanhas do salão"
                                className="text-muted-foreground hover:text-amber-600"
                              >
                                É pessoal
                              </Button>
                            )
                          )}
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c) }} title="Ver perfil 360"><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(c) }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(c) }} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Form modal */}
      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar cliente' : 'Novo cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setField('nome', e.target.value)} placeholder="Nome completo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setField('telefone', e.target.value)} placeholder="(00) 00000-0000" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="email@exemplo.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>CPF / CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setField('cpf_cnpj', e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Data de nascimento
                {form.data_nascimento && idadeDe(form.data_nascimento) != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({idadeDe(form.data_nascimento)} anos)</span>
                )}
              </Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setField('data_nascimento', e.target.value)} />
            </div>

            {/* ── Endereço: CEP preenche logradouro/bairro/cidade/uf; número e complemento manuais ── */}
            <div className="space-y-2">
              <Label>CEP</Label>
              <div className="flex items-center gap-2">
                <Input value={form.cep} onChange={(e) => setField('cep', e.target.value)} onBlur={() => buscarCep(form.cep)} placeholder="00000-000" className="w-40" inputMode="numeric" />
                {cepLoading && <span className="text-xs text-muted-foreground">buscando endereço…</span>}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setField('logradouro', e.target.value)} placeholder="Rua, avenida…" /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={form.numero} onChange={(e) => setField('numero', e.target.value)} className="w-24" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setField('complemento', e.target.value)} placeholder="apto, bloco…" /></div>
              <div className="space-y-2"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setField('bairro', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setField('cidade', e.target.value)} /></div>
              <div className="space-y-2"><Label>UF</Label><Input value={form.uf} onChange={(e) => setField('uf', e.target.value.toUpperCase())} maxLength={2} className="w-16" /></div>
            </div>

            <div className="space-y-2"><Label>Tags</Label><Input value={form.tags} onChange={(e) => setField('tags', e.target.value)} placeholder="separadas por vírgula" /></div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={onSave} disabled={!form.nome.trim() || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature #4: confirmação de merge */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => { if (!o) setMergeTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Juntar cadastros duplicados?</AlertDialogTitle>
            <AlertDialogDescription>
              {mergeTarget && (
                <>Juntar {mergeTarget.dups.length + 1} cadastros de {mergeTarget.keep.nome} num só? Agendamentos e histórico vão pro cadastro mantido.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={juntar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (mergeTarget) juntar.mutate(mergeTarget) }}
              disabled={juntar.isPending}
            >
              {juntar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Juntar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Perfil 360 do cliente (Sheet shadcn). No demo mostra só o cabeçalho +
          aviso; fora do demo dispara as queries por organization_id+cliente_id. */}
      <ClienteDetail
        cliente={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null) }}
        demo={isDemo}
      />
    </MaybeSalaoShell>
  )
}
