// ─── Meta do Mês — faturamento do salão (Feature C do plano CBA→salão) ───────
// O pulso do negócio pra cabeleireira: defina a meta de faturamento do mês e
// acompanhe quanto já entrou, quanto falta, o RITMO (projeção do fim do mês) e
// quem (qual profissional) trouxe mais receita. NÃO é "quota de SDR" — é meta do
// salão, org-wide. Faturado = soma dos agendamentos concluídos do mês.
// Meta vive em salon_monthly_goals (tabela dedicada, RLS por org).

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, TrendingUp, Users, RefreshCw, Loader2, CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { formatBRL } from '@/cockpit/home/format'

// Mês corrente (local). start/end em YYYY-MM-DD; dia = hoje no mês; dias = dias do mês.
function monthInfo() {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth() // 0-11
  const pad = (x: number) => String(x).padStart(2, '0')
  const dias = new Date(y, m + 1, 0).getDate()
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(dias)}`,
    dias,
    dia: n.getDate(),
    label: n.toLocaleDateString('pt-BR', { month: 'long' }),
  }
}

interface AgRow { valor: number | null; profissional_id: string | null }
interface ProfRow { id: string; nome: string | null }
interface MetaData {
  meta: number | null
  faturado: number
  atendimentos: number
  projecao: number
  porProf: Array<{ nome: string; valor: number }>
}

function MetaEditor({ metaAtual, periodStart, orgId }: { metaAtual: number | null; periodStart: string; orgId: string }) {
  const qc = useQueryClient()
  const [val, setVal] = useState(metaAtual != null ? String(metaAtual) : '')
  const save = useMutation({
    mutationFn: async () => {
      const target = Math.max(0, Number(val) || 0)
      const { error } = await supabase.from('salon_monthly_goals').upsert({
        organization_id: orgId, period_start: periodStart, target_value: target, updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,period_start' })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meta-mes', orgId] }); toast.success('Meta salva') },
    onError: () => toast.error('Não deu pra salvar a meta'),
  })
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Meta de faturamento do mês (R$)</Label>
        <Input type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} className="h-9 w-44" placeholder="Ex: 8000" />
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !val}>
        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar meta
      </Button>
    </div>
  )
}

export default function MetaMes({ demo }: { demo?: MetaData } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const mi = monthInfo()

  const { data: goal, refetch: refGoal, isFetching: fGoal } = useQuery({
    queryKey: ['meta-mes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salon_monthly_goals')
        .select('target_value')
        .eq('organization_id', organizationId!)
        .eq('period_start', mi.start)
        .maybeSingle()
      if (error) throw error
      return data as { target_value: number } | null
    },
  })

  const { data: ags = [], refetch: refAgs, isFetching: fAgs } = useQuery({
    queryKey: ['meta-mes-ags', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('valor, profissional_id')
        .eq('organization_id', organizationId!)
        .eq('status', 'concluido')
        .gte('data', mi.start)
        .lte('data', mi.end)
      if (error) throw error
      return (data ?? []) as AgRow[]
    },
  })

  const { data: profs = [] } = useQuery({
    queryKey: ['meta-mes-profs', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profissionais').select('id, nome').eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as ProfRow[]
    },
  })

  if (!isDemo && !organizationId) return <div className="p-6"><NoOrg /></div>

  // ── Agregação (faturado, ritmo, por profissional) ──
  const computed: MetaData = demo ?? (() => {
    const faturado = ags.reduce((s, a) => s + Number(a.valor ?? 0), 0)
    const nomeDe = new Map(profs.map((p) => [p.id, p.nome ?? 'Profissional']))
    const porMap = new Map<string, number>()
    for (const a of ags) {
      const nome = a.profissional_id ? (nomeDe.get(a.profissional_id) ?? 'Profissional') : 'Sem profissional'
      porMap.set(nome, (porMap.get(nome) ?? 0) + Number(a.valor ?? 0))
    }
    const porProf = [...porMap.entries()].map(([nome, valor]) => ({ nome, valor })).sort((x, y) => y.valor - x.valor)
    const projecao = mi.dia > 0 ? Math.round((faturado / mi.dia) * mi.dias) : faturado
    return { meta: goal?.target_value ?? null, faturado, atendimentos: ags.length, projecao, porProf }
  })()

  const { meta, faturado, atendimentos, projecao, porProf } = computed
  const progresso = meta && meta > 0 ? Math.min(100, Math.round((faturado / meta) * 100)) : 0
  const falta = meta ? Math.max(0, meta - faturado) : 0
  const vaiBater = meta ? projecao >= meta : false
  const maxProf = Math.max(1, ...porProf.map((p) => p.valor))

  return (
    <div className="p-6 space-y-6">
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      <PageHeader
        title="Meta do Mês"
        description="O pulso do seu mês: quanto você já faturou, quanto falta pra meta — e o ritmo pra chegar lá."
      />

      {!isDemo && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <MetaEditor metaAtual={meta} periodStart={mi.start} orgId={organizationId!} key={meta ?? 'none'} />
          <Button size="sm" variant="outline" onClick={() => { refGoal(); refAgs() }} disabled={fGoal || fAgs}>
            <RefreshCw className={`mr-2 h-4 w-4 ${fGoal || fAgs ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      )}

      {/* Headline da meta */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="py-6 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Target className="h-4 w-4" />
            Faturamento de {mi.label}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-4xl font-bold tracking-tight text-foreground">{formatBRL(faturado)}</span>
            {meta != null && <span className="text-sm text-muted-foreground">de {formatBRL(meta)} · {progresso}%</span>}
          </div>
          {meta != null ? (
            <>
              <Progress value={progresso} />
              <p className="text-sm text-muted-foreground">
                {falta > 0
                  ? <>Falta <span className="font-semibold text-foreground">{formatBRL(falta)}</span> pra bater a meta. </>
                  : <span className="font-semibold text-emerald-600 dark:text-emerald-400">Meta batida! 🎉 </span>}
                No ritmo de hoje, você fecha o mês em <span className="font-semibold text-foreground">{formatBRL(projecao)}</span>
                {' '}— {vaiBater ? 'tá no caminho 💪' : 'precisa acelerar um pouco.'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Você ainda não definiu a meta do mês. Coloque um valor ali em cima e acompanhe seu ritmo em tempo real.
            </p>
          )}
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" />
            {atendimentos} atendimento{atendimentos === 1 ? '' : 's'} concluído{atendimentos === 1 ? '' : 's'} este mês.
          </div>
        </CardContent>
      </Card>

      {/* Receita por profissional */}
      <Card>
        <CardContent className="py-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            Quem trouxe mais receita
          </h3>
          {porProf.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atendimentos concluídos este mês ainda.</p>
          ) : (
            <div className="space-y-3">
              {porProf.map((p) => (
                <div key={p.nome} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-foreground"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />{p.nome}</span>
                    <span className="font-semibold text-foreground">{formatBRL(p.valor)}</span>
                  </div>
                  <Progress value={Math.round((p.valor / maxProf) * 100)} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Seed do modo demonstração ──────────────────────────────────────────────
export const DEMO_META: MetaData = {
  meta: 8000,
  faturado: 5240,
  atendimentos: 47,
  projecao: 8730,
  porProf: [
    { nome: 'Camila (cabelo)', valor: 2980 },
    { nome: 'Patrícia (unhas)', valor: 1560 },
    { nome: 'Você', valor: 700 },
  ],
}
