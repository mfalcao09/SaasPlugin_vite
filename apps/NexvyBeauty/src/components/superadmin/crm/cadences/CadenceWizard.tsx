import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight, Plus, Trash2, GripVertical, Rocket, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  /** Controla a visibilidade do Dialog (o wizard abre SOBRE a lista, não a substitui). */
  open: boolean;
  /** Callback do Dialog (X / Esc / clique fora) — o manager reseta a view e dá refresh ao fechar. */
  onOpenChange: (open: boolean) => void;
  cadenceId: string | null;
  /** Deep-link do hub do produto (CadenceTab): prefill do product_id ao CRIAR
   *  (platform_crm_cadences.product_id é NOT NULL). Cadências já existentes
   *  mantêm o product_id gravado — não é sobrescrito no update. */
  productId?: string;
}

type StepDraft = {
  id?: string;
  order_index: number;
  name: string;
  objective: string;
  execute_immediately: boolean;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  delay_from: 'previous_step' | 'enrollment';
  context_inline: string;
  tone: string;
  conditions: {
    only_if_no_response?: boolean;
    only_if_no_purchase?: boolean;
    only_if_not_human?: boolean;
  };
};

const OBJECTIVES = ['Pós Live', 'Recuperação', 'Abandono de Checkout', 'Reativação', 'Pós Compra', 'Renovação', 'Personalizado'];
const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Seg' }, { key: 'tue', label: 'Ter' }, { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' }, { key: 'fri', label: 'Sex' }, { key: 'sat', label: 'Sáb' }, { key: 'sun', label: 'Dom' },
];
const STOP_OPTIONS: { key: string; label: string }[] = [
  { key: 'responded', label: 'Lead respondeu' },
  { key: 'purchased', label: 'Compra realizada' },
  { key: 'tag_buyer', label: 'Tag Comprador' },
  { key: 'tag_dnd', label: 'Tag Não Perturbe' },
  { key: 'pipeline_closed', label: 'Pipeline Fechado' },
  { key: 'active_customer', label: 'Cliente Ativo' },
  { key: 'meeting_scheduled', label: 'Reunião Agendada' },
  { key: 'human_handover', label: 'Atendimento Humano' },
];

const STEPS_LABELS = [
  '1. Configuração', '2. Entrada', '3. Exclusões', '4. Cronograma',
  '5. Regras de Execução', '6. Horários', '7. Parada', '8. Ações', '9. Revisão',
];

export function CadenceWizard({ open, onOpenChange, cadenceId, productId }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!cadenceId);

  // Core fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('Pós Live');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'active' | 'paused'>('draft');

  // Filters (simplified for v1 — can be extended like CampaignWizard)
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [exclusionTags, setExclusionTags] = useState<string[]>([]);

  // Steps
  const [steps, setSteps] = useState<StepDraft[]>([]);

  // Execution window
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [randomize, setRandomize] = useState(false);

  // Stop
  const [stopRules, setStopRules] = useState<Record<string, boolean>>({ responded: true, purchased: true });

  // Stop actions
  const [tagsAdd, setTagsAdd] = useState<string[]>([]);
  const [tagsRemove, setTagsRemove] = useState<string[]>([]);
  const [moveStageId, setMoveStageId] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');

  // Helpers
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    // Agentes = `platform_crm_agent_configs` (não há `product_agents` no escopo de plataforma).
    supabase.from('platform_crm_agent_configs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setAgents((data as any) ?? []));
    // Etiquetas = `platform_crm_lead_tags`.
    supabase.from('platform_crm_lead_tags').select('id, name, color').order('name')
      .then(({ data }) => setTags((data as any) ?? []));
  }, []);

  useEffect(() => {
    if (!cadenceId) return;
    setLoading(true);
    (async () => {
      const { data: c } = await supabase.from('platform_crm_cadences').select('*').eq('id', cadenceId).maybeSingle();
      if (c) {
        const cd = c as any;
        setName(cd.name);
        setDescription(cd.description ?? '');
        setObjective(cd.objective ?? 'Pós Live');
        setAgentId(cd.agent_id);
        setStatus(cd.status);
        setEntryTags(cd.entry_filters?.tags ?? []);
        setExclusionTags(cd.exclusion_filters?.tags ?? []);
        const win = cd.execution_window ?? {};
        setDays(win.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']);
        setStartTime(win.start ?? '09:00');
        setEndTime(win.end ?? '18:00');
        setRandomize(!!win.randomize);
        setStopRules(cd.stop_rules ?? {});
        const acts = cd.stop_actions ?? {};
        setTagsAdd(acts.tags_add ?? []);
        setTagsRemove(acts.tags_remove ?? []);
        setMoveStageId(acts.move_stage_id ?? null);
        setInternalNote(acts.internal_note ?? '');
      }
      const { data: st } = await supabase.from('platform_crm_cadence_steps').select('*').eq('cadence_id', cadenceId).order('order_index');
      setSteps(((st as any[]) ?? []).map((s) => ({
        id: s.id, order_index: s.order_index, name: s.name, objective: s.objective ?? '',
        execute_immediately: s.execute_immediately, delay_value: s.delay_value, delay_unit: s.delay_unit,
        delay_from: s.delay_from, context_inline: s.context_inline ?? '',
        tone: s.tone ?? '', conditions: s.conditions ?? {},
      })));

      setLoading(false);
    })();
  }, [cadenceId]);

  const addStep = () => {
    setSteps((s) => [...s, {
      order_index: s.length,
      name: `Etapa ${s.length + 1}`,
      objective: '',
      execute_immediately: s.length === 0,
      delay_value: s.length === 0 ? 0 : 2,
      delay_unit: 'days',
      delay_from: 'previous_step',
      context_inline: '',
      tone: '',
      conditions: { only_if_no_response: s.length > 0 },
    }]);
  };

  const updateStep = (i: number, patch: Partial<StepDraft>) => {
    setSteps((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const removeStep = (i: number) => {
    setSteps((arr) => arr.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order_index: idx })));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, idx) => ({ ...s, order_index: idx }));
    });
  };

  // Step pode cair fora da janela 24h da Meta?
  const stepMayBeOutOfWindow = (s: StepDraft) => {
    if (s.execute_immediately) return false;
    const v = Number(s.delay_value ?? 0);
    if (s.delay_unit === 'days') return v >= 1;
    if (s.delay_unit === 'hours') return v >= 24;
    return false;
  };

  const save = async (activate = false) => {
    if (!name.trim()) { toast.error('Informe o nome da cadência'); setStep(0); return; }
    if (steps.length === 0) { toast.error('Adicione ao menos uma etapa'); setStep(3); return; }
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      objective,
      agent_id: agentId,
      status: activate ? 'active' : status,
      entry_filters: { tags: entryTags },
      exclusion_filters: { tags: exclusionTags },
      stop_rules: stopRules,
      stop_actions: { tags_add: tagsAdd, tags_remove: tagsRemove, move_stage_id: moveStageId, internal_note: internalNote || null },
      execution_window: { days, start: startTime, end: endTime, randomize },
      channel: 'whatsapp',
    };

    let id = cadenceId;
    if (id) {
      const { error } = await supabase.from('platform_crm_cadences').update(payload).eq('id', id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      // Replace steps
      await supabase.from('platform_crm_cadence_steps').delete().eq('cadence_id', id);
    } else {
      const insertPayload = productId ? { ...payload, product_id: productId } : payload;
      const { data, error } = await supabase.from('platform_crm_cadences').insert(insertPayload).select('id').single();
      if (error || !data) { toast.error(error?.message ?? 'Falha ao criar'); setSaving(false); return; }
      id = (data as any).id;
    }

    if (steps.length) {
      const rows = steps.map((s, i) => ({
        cadence_id: id!,
        order_index: i,
        name: s.name || `Etapa ${i + 1}`,
        objective: s.objective || null,
        execute_immediately: s.execute_immediately,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        delay_from: s.delay_from,
        context_inline: s.context_inline || null,
        tone: s.tone || null,
        conditions: s.conditions,
      }));

      const { error } = await supabase.from('platform_crm_cadence_steps').insert(rows);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    // TODO(edge): a ATIVAÇÃO real (inscrever leads elegíveis + agendar/processar
    // passos + disparo via WhatsApp) depende do motor de execução server-side
    // (Edge Function). Aqui só persistimos o status; o runtime é acionado à parte.
    toast.success(activate ? 'Cadência ativada!' : 'Cadência salva');
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{cadenceId ? 'Editar cadência' : 'Nova cadência'}</DialogTitle>
          <DialogDescription>{STEPS_LABELS[step]}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 overflow-y-auto p-6">Carregando…</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> Salvar rascunho
          </Button>
          {step === STEPS_LABELS.length - 1 && (
            <Button onClick={() => save(true)} disabled={saving}>
              <Rocket className="h-4 w-4 mr-2" /> Ativar Cadência
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STEPS_LABELS.map((l, i) => (
          <button key={l} onClick={() => setStep(i)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${i === step ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card><CardContent className="p-5 space-y-4">
          <Field label="Nome da cadência *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pós Live Replay Maio" /></Field>
          <Field label="Descrição"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Objetivo">
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Agente responsável">
            <Select value={agentId ?? ''} onValueChange={(v) => setAgentId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent></Card>
      )}

      {step === 1 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Selecione tags que filtram quem entra nesta cadência. Filtros avançados (origem, pipeline, campos personalizados) podem ser adicionados depois pelo editor.</p>
          <TagsPicker label="Entrar se tiver QUALQUER destas tags" tags={tags} selected={entryTags} onChange={setEntryTags} />
        </CardContent></Card>
      )}

      {step === 2 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Leads com qualquer uma destas tags NÃO entram (ou saem) da cadência.</p>
          <TagsPicker label="Excluir se tiver QUALQUER destas tags" tags={tags} selected={exclusionTags} onChange={setExclusionTags} />
        </CardContent></Card>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {steps.map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">Etapa {i + 1}</Badge>
                  <Input value={s.name} onChange={(e) => updateStep(i, { name: e.target.value })} className="flex-1" placeholder="Nome da etapa" />
                  <Button size="icon" variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</Button>
                  <Button size="icon" variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</Button>
                  <Button size="icon" variant="ghost" onClick={() => removeStep(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <Input value={s.objective} onChange={(e) => updateStep(i, { objective: e.target.value })} placeholder="Objetivo (ex: Iniciar conversa)" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch checked={s.execute_immediately} onCheckedChange={(v) => updateStep(i, { execute_immediately: v })} />
                    <Label className="text-sm">Executar imediatamente</Label>
                  </div>
                  {!s.execute_immediately && (
                    <>
                      <div>
                        <Label className="text-xs">Após</Label>
                        <Input type="number" min={1} value={s.delay_value} onChange={(e) => updateStep(i, { delay_value: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <Label className="text-xs">Unidade</Label>
                        <Select value={s.delay_unit} onValueChange={(v: any) => updateStep(i, { delay_unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutos</SelectItem>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">A partir de</Label>
                        <Select value={s.delay_from} onValueChange={(v: any) => updateStep(i, { delay_from: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="previous_step">Etapa anterior</SelectItem>
                            <SelectItem value="enrollment">Entrada na cadência</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                {/*
                  TODO(migration): o CRM de tenant permite selecionar um "Contexto da
                  biblioteca" (tabela de contextos + coluna `context_id` no step). No
                  schema de plataforma `platform_crm_cadence_steps` NÃO existe `context_id`
                  nem uma biblioteca de contextos — mantemos apenas o contexto inline.
                */}
                <div>
                  <Label className="text-xs">Contexto inline (instruções para o agente IA)</Label>
                  <Textarea rows={3} value={s.context_inline} onChange={(e) => updateStep(i, { context_inline: e.target.value })}
                    placeholder="Ex: Esse lead participou da live e ainda não respondeu. Inicie uma conversa leve e descubra seu principal interesse." />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Executar somente se</Label>
                  <div className="flex flex-wrap gap-3">
                    <CheckBoxItem checked={!!s.conditions.only_if_no_response} onChange={(v) => updateStep(i, { conditions: { ...s.conditions, only_if_no_response: v } })} label="Não respondeu" />
                    <CheckBoxItem checked={!!s.conditions.only_if_no_purchase} onChange={(v) => updateStep(i, { conditions: { ...s.conditions, only_if_no_purchase: v } })} label="Não comprou" />
                    <CheckBoxItem checked={!!s.conditions.only_if_not_human} onChange={(v) => updateStep(i, { conditions: { ...s.conditions, only_if_not_human: v } })} label="Não foi assumido por humano" />
                  </div>
                </div>

                {stepMayBeOutOfWindow(s) && (
                  <div className="pt-2 border-t">
                    {/*
                      TODO(migration): no CRM de tenant esta etapa exigiria um Template HSM
                      de reabertura (Meta API Oficial) via `TemplatePicker` +
                      `reengagement_template_id`. Essas colunas/telas de Meta são cross-módulo
                      e não existem no schema de plataforma — exibimos apenas o aviso.
                    */}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-md p-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Esta etapa pode rodar após 24h da última mensagem. Para envio via Meta API Oficial será necessário um template HSM de reabertura (disponível em breve).</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={addStep} className="w-full"><Plus className="h-4 w-4 mr-2" /> Adicionar etapa</Button>
        </div>
      )}

      {step === 4 && (
        <Card><CardContent className="p-5 space-y-2 text-sm text-muted-foreground">
          As regras de execução são configuradas dentro de cada etapa na seção "Cronograma" (etapa 4). Use os checkboxes "Executar somente se" em cada etapa.
        </CardContent></Card>
      )}

      {step === 5 && (
        <Card><CardContent className="p-5 space-y-4">
          <div>
            <Label>Dias permitidos</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {WEEK_DAYS.map((d) => (
                <button key={d.key} type="button"
                  onClick={() => setDays((arr) => arr.includes(d.key) ? arr.filter((x) => x !== d.key) : [...arr, d.key])}
                  className={`px-3 py-1.5 rounded-md text-sm border ${days.includes(d.key) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horário inicial"><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
            <Field label="Horário final"><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={randomize} onCheckedChange={setRandomize} />
            <Label className="text-sm">Aleatorizar horário dentro da janela (envio mais natural)</Label>
          </div>
        </CardContent></Card>
      )}

      {step === 6 && (
        <Card><CardContent className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Quando interromper a cadência automaticamente?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STOP_OPTIONS.map((o) => (
              <CheckBoxItem key={o.key} label={o.label} checked={!!stopRules[o.key]}
                onChange={(v) => setStopRules((r) => ({ ...r, [o.key]: v }))} />
            ))}
          </div>
        </CardContent></Card>
      )}

      {step === 7 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Ao interromper a cadência:</p>
          <TagsPicker label="Aplicar tags" tags={tags} selected={tagsAdd} onChange={setTagsAdd} />
          <TagsPicker label="Remover tags" tags={tags} selected={tagsRemove} onChange={setTagsRemove} />
          <Field label="Nota interna (adicionada no lead)">
            <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Ex: Encerrou cadência pós-live" />
          </Field>
        </CardContent></Card>
      )}

      {step === 8 && (
        <Card><CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold">Revisão</h3>
            <p className="text-sm text-muted-foreground">Confira antes de ativar.</p>
          </div>
          <Row k="Nome" v={name || '—'} />
          <Row k="Objetivo" v={objective} />
          <Row k="Agente" v={agents.find((a) => a.id === agentId)?.name ?? '—'} />
          <Row k="Etapas" v={`${steps.length} etapa(s)`} />
          <Row k="Janela" v={`${days.join(', ').toUpperCase()} · ${startTime}–${endTime}${randomize ? ' (aleatorizado)' : ''}`} />
          <Row k="Parar se" v={Object.entries(stopRules).filter(([, v]) => v).map(([k]) => STOP_OPTIONS.find((o) => o.key === k)?.label ?? k).join(', ') || 'Nenhuma regra'} />

          <div className="pt-4">
            <h4 className="text-sm font-medium mb-2">Simulação visual</h4>
            <div className="space-y-1">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{i + 1}</div>
                  <div className="flex-1 border rounded p-2">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.execute_immediately ? 'Imediatamente' : `+${s.delay_value} ${s.delay_unit === 'minutes' ? 'min' : s.delay_unit === 'hours' ? 'h' : 'd'} (${s.delay_from === 'enrollment' ? 'da entrada' : 'da anterior'})`}
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-sm text-muted-foreground pl-10">↓ Encerrar</div>
            </div>
          </div>
        </CardContent></Card>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
        </Button>
        <Button onClick={() => setStep((s) => Math.min(STEPS_LABELS.length - 1, s + 1))} disabled={step === STEPS_LABELS.length - 1}>
          Próximo <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

function CheckBoxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}

function TagsPicker({ label, tags, selected, onChange }: { label: string; tags: { id: string; name: string; color: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</span>}
        {tags.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button key={t.id} type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
              className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'border-primary' : 'border-border'}`}
              style={on ? { backgroundColor: t.color + '33', color: t.color } : {}}>
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between text-sm border-b pb-1.5"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>;
}
