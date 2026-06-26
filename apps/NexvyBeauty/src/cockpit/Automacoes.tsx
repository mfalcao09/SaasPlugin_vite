// ─── Automações — Receitas de Automação de Salão (Feature B, inc.2) ──────────
// A cabeleireira liga/desliga cada receita, edita a mensagem e roda a PRÉVIA
// (dry-run: mostra QUEM seria contatado HOJE, sem enviar). O envio real só
// acontece pelo cron (inc.3). Regras vivem em salon_automation_rules (RLS por
// org); a prévia chama a edge function salon-automation-run (forçada a dry-run
// fora do cron). Mesma cara do AiGrowth/AcoesClientes.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Cake, CalendarClock, PackageCheck, UserMinus, Eye, Loader2, Send, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'

type Tipo = 'aniversario' | 'agendamento_24h' | 'pacote_vencendo' | 'retorno_inativo'
interface Rule { tipo: Tipo; enabled: boolean; template: string | null; antecedencia_dias: number }

interface Receita {
  tipo: Tipo; titulo: string; desc: string; icon: LucideIcon
  defaultMsg: string; diasLabel?: string; defaultDias: number
}
const RECEITAS: Receita[] = [
  { tipo: 'aniversario', titulo: 'Aniversário', desc: 'No dia do aniversário da cliente, manda um carinho com convite.', icon: Cake, defaultDias: 0,
    defaultMsg: 'Oi {nome}! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho seu aqui no salão. Vem buscar? 🎂' },
  { tipo: 'agendamento_24h', titulo: 'Lembrete 24h antes', desc: 'Um dia antes do horário, confirma o agendamento da cliente.', icon: CalendarClock, defaultDias: 0,
    defaultMsg: 'Oi {nome}! Passando pra confirmar seu horário de amanhã 💕 Posso te esperar? Qualquer coisa, me avisa.' },
  { tipo: 'pacote_vencendo', titulo: 'Pacote acabando', desc: 'Quando o pacote está perto de vencer, oferece a renovação.', icon: PackageCheck, defaultDias: 3, diasLabel: 'Avisar quantos dias antes de vencer',
    defaultMsg: 'Oi {nome}! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? Posso já deixar separado 😉' },
  { tipo: 'retorno_inativo', titulo: 'Cliente sumida', desc: 'Quando a cliente cruza X dias sem voltar, chama de volta.', icon: UserMinus, defaultDias: 45, diasLabel: 'Dias sem voltar pra disparar',
    defaultMsg: 'Oi {nome}! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana? Tenho um mimo te esperando 🎁' },
]

function ReceitaCard({ receita, rule, orgId, demo }: { receita: Receita; rule?: Rule; orgId: string | null; demo?: boolean }) {
  const Icon = receita.icon
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(rule?.enabled ?? false)
  const [template, setTemplate] = useState(rule?.template ?? '')
  const [dias, setDias] = useState(rule?.antecedencia_dias ?? receita.defaultDias)

  const save = useMutation({
    mutationFn: async (_patch: { enabled?: boolean; persistTexto?: boolean }) => {
      if (demo || !orgId) return
      const { error } = await supabase.from('salon_automation_rules').upsert({
        organization_id: orgId, tipo: receita.tipo,
        enabled: _patch.enabled ?? enabled,
        template: template.trim() || null,
        antecedencia_dias: dias,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,tipo' })
      if (error) throw error
    },
    onSuccess: (_d, patch) => {
      if (orgId) qc.invalidateQueries({ queryKey: ['salon-rules', orgId] })
      if (patch.persistTexto) toast.success('Mensagem salva')
    },
    onError: () => toast.error('Não deu pra salvar — tenta de novo'),
  })

  return (
    <Card className={enabled ? 'border-primary/40' : undefined}>
      <CardContent className="py-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{receita.titulo}</h3>
              <p className="text-xs text-muted-foreground">{receita.desc}</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); save.mutate({ enabled: v }) }}
          />
        </div>

        {enabled && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            {receita.diasLabel && (
              <div className="space-y-1.5">
                <Label className="text-xs">{receita.diasLabel}</Label>
                <Input
                  type="number" min={1} className="h-8 w-28"
                  value={dias}
                  onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem (use <code>{'{nome}'}</code> pro 1º nome)</Label>
              <Textarea
                rows={3} value={template} placeholder={receita.defaultMsg}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Em branco = usa a mensagem padrão acima.</p>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => save.mutate({ persistTexto: true })} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface PreviewEvento { tipo: string; cliente_nome: string; telefone: string | null; mensagem: string }

export default function Automacoes({ demo }: { demo?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewEvento[] | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['salon-rules', organizationId],
    enabled: !demo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salon_automation_rules')
        .select('tipo, enabled, template, antecedencia_dias')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as Rule[]
    },
  })

  if (!demo && !organizationId) return <div className="p-6"><NoOrg /></div>

  const ruleOf = (tipo: Tipo) => rules.find((r) => r.tipo === tipo)
  const ligadas = rules.filter((r) => r.enabled).length

  async function rodarPrevia() {
    if (demo) {
      setPreview([
        { tipo: 'aniversario', cliente_nome: 'Helena Castro', telefone: '5511988880011', mensagem: 'Oi Helena! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho…' },
        { tipo: 'retorno_inativo', cliente_nome: 'Joana Lima', telefone: '5511988880002', mensagem: 'Oi Joana! Senti sua falta por aqui 💕 Que tal marcar um horário…' },
      ])
      return
    }
    setPreviewing(true)
    setPreview(null)
    try {
      const { data, error } = await supabase.functions.invoke('salon-automation-run', {
        body: { organization_id: organizationId },
      })
      if (error) throw error
      const r = (data?.resultado ?? {})[organizationId as string]
      setPreview((r?.eventos ?? []) as PreviewEvento[])
    } catch {
      toast.error('Não deu pra rodar a prévia agora')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {demo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      <PageHeader
        title="Automações"
        description="Receitas que mandam o WhatsApp sozinhas, na hora certa. Você liga as que quiser — e vê a prévia antes."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={rodarPrevia} disabled={previewing} className="gap-1.5">
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Ver prévia (não envia)
        </Button>
        <span className="text-xs text-muted-foreground">
          {ligadas > 0 ? `${ligadas} receita${ligadas === 1 ? '' : 's'} ligada${ligadas === 1 ? '' : 's'}.` : 'Nenhuma receita ligada ainda.'}
        </span>
      </div>

      {preview && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Prévia de hoje — {preview.length} {preview.length === 1 ? 'cliente seria contatada' : 'clientes seriam contatadas'} (nada foi enviado)
            </h3>
            {preview.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento pra disparar hoje com as receitas ligadas.</p>
            ) : (
              <ul className="space-y-1.5">
                {preview.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <Send className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="font-medium text-foreground">{e.cliente_nome}</span>
                    <Badge variant="outline" className="text-[10px]">{e.tipo}</Badge>
                    <span className="truncate text-xs text-muted-foreground">{e.mensagem}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {RECEITAS.map((r) => (
          <ReceitaCard key={r.tipo} receita={r} rule={ruleOf(r.tipo)} orgId={organizationId} demo={demo} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        O envio automático roda uma vez por dia, pelo sistema. A mesma cliente nunca recebe a mesma
        mensagem 2× pelo mesmo motivo. Clientes sem WhatsApp cadastrado são puladas.
      </p>
    </div>
  )
}
