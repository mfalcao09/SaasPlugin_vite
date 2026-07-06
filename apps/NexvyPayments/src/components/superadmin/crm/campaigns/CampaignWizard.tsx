import { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Rocket, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePlatformCrmCampaignContexts } from '../data/usePlatformCrmCampaignContexts';

/**
 * Assistente de campanha (super_admin) — porte 1:1 do `CampaignWizard` de tenant,
 * tocando `platform_crm_campaigns`. CORE: CRUD de campanha + público (tags/origem/
 * canal) + contexto (inline + biblioteca) + agente + velocidade + agenda +
 * pós-resposta + pós-cadência. Sem organization_id / product_id (RLS isola).
 *
 * Dados desacoplados:
 *   - Agentes = `platform_crm_agent_configs` (não `product_agents`).
 *   - Etiquetas = `platform_crm_lead_tags`.
 *   - Biblioteca de contextos = `platform_crm_campaign_contexts`.
 *   - Pós-cadência = `platform_crm_cadences` (FK `post_cadence_id`).
 *   - Origens/Canais = valores distintos de `platform_crm_leads`.
 *
 * TODO(migration): o CRM de tenant tem seções que dependem de tabelas cross-módulo
 * inexistentes no schema de plataforma e foram removidas aqui:
 *   - Produto + etapas do pipeline (`products` / `pipeline_stages`).
 *   - Números de envio + Template HSM Meta (`evolution_instances` /
 *     `whatsapp_meta_connections` / `MultiTemplatePicker`).
 *   - Filtros por campos personalizados (`custom_fields`).
 * O formato do JSON `audience_filters` / `exclusion_filters` / `post_response_actions`
 * é preservado 1:1 para que o motor de disparo (Edge Function) o consuma sem mudança.
 *
 * TODO(edge): o PREVIEW de público (`campaign-preview`) e o DISPARO real
 * (`campaign-start`: preparar contatos + agendar + enviar via WhatsApp) rodam
 * server-side. Aqui o preview mostra o total de leads e "Iniciar" persiste a
 * campanha marcando o status para o runtime processar à parte.
 */

type Filters = {
  origins?: string[];
  channels?: string[];
  tag_ids?: string[];
  temperature?: string[];
  search?: { name?: string; email?: string; phone?: string };
  created_after?: string;
  created_before?: string;
};

const SPEED_PRESETS = [
  { value: 'safe', label: '🐢 Seguro', desc: '2 a 5 minutos entre envios' },
  { value: 'recommended', label: '🟢 Recomendado', desc: '1 a 3 minutos entre envios' },
  { value: 'fast', label: '🚀 Rápido', desc: '30 segundos a 2 minutos' },
  { value: 'aggressive', label: '⚠️ Agressivo', desc: '10 a 45 segundos' },
];

type AgentOpt = { id: string; name: string };
type TagOpt = { id: string; name: string };
type CadenceOpt = { id: string; name: string };

export function CampaignWizard({
  campaignId,
  onClose,
}: {
  campaignId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(!!campaignId);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const { contexts: libraryContexts } = usePlatformCrmCampaignContexts();

  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [cadences, setCadences] = useState<CadenceOpt[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'draft',
    agent_id: '',
    audience_filters: {} as Filters,
    exclusion_filters: {} as Filters,
    contexts: [] as Array<{ context_id?: string; inline_text?: string; weight: number }>,
    inline_context: '',
    context_distribution: 'random',
    speed_preset: 'recommended',
    schedule_type: 'now',
    scheduled_at: '',
    recurrence: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } as { days: number[]; start: string; end: string },
    post_response_actions: {
      stop: true,
      take_over: false,
      temperature: '',
      note: '',
      tags_add: [] as string[],
      tags_remove: [] as string[],
    },
    post_cadence_id: null as string | null,
  });

  // Carregar dados auxiliares de plataforma.
  useEffect(() => {
    (async () => {
      const [a, t, cad, leads] = await Promise.all([
        supabase.from('platform_crm_agent_configs').select('id, name').eq('is_active', true).order('name'),
        supabase.from('platform_crm_lead_tags').select('id, name').order('name'),
        supabase.from('platform_crm_cadences').select('id, name').order('name'),
        supabase.from('platform_crm_leads').select('lead_origin, lead_channel').limit(2000),
      ]);
      setAgents((a.data as AgentOpt[]) ?? []);
      setTags((t.data as TagOpt[]) ?? []);
      setCadences((cad.data as CadenceOpt[]) ?? []);
      const orgs = new Set<string>();
      const chans = new Set<string>();
      ((leads.data as any[]) ?? []).forEach((l) => {
        if (l.lead_origin) orgs.add(l.lead_origin);
        if (l.lead_channel) chans.add(l.lead_channel);
      });
      setOrigins(Array.from(orgs).sort());
      setChannels(Array.from(chans).sort());
    })();
  }, []);

  // Carregar campanha existente.
  useEffect(() => {
    if (!campaignId) return;
    supabase.from('platform_crm_campaigns').select('*').eq('id', campaignId).maybeSingle().then(({ data }) => {
      if (data) {
        const d = data as any;
        setForm({
          name: d.name ?? '',
          description: d.description ?? '',
          status: d.status,
          agent_id: d.agent_id ?? '',
          audience_filters: (d.audience_filters as Filters) ?? {},
          exclusion_filters: (d.exclusion_filters as Filters) ?? {},
          contexts: (d.contexts as any) ?? [],
          inline_context: '',
          context_distribution: d.context_distribution,
          speed_preset: d.speed_preset,
          schedule_type: d.schedule_type,
          scheduled_at: d.scheduled_at ?? '',
          recurrence: (d.recurrence as any) ?? { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
          post_response_actions: {
            stop: true,
            take_over: false,
            temperature: '',
            note: '',
            tags_add: (d.tags_on_response as string[]) ?? [],
            tags_remove: [],
            ...((d.post_response_actions as any) ?? {}),
          },
          post_cadence_id: d.post_cadence_id ?? null,
        });
      }
      setLoading(false);
    });
  }, [campaignId]);

  // Preview de público (client-side, debounced). TODO(edge): matching preciso
  // por filtros roda no `campaign-preview`; aqui mostramos o total de leads.
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    const { count } = await supabase
      .from('platform_crm_leads')
      .select('id', { count: 'exact', head: true });
    setPreview({ total: count ?? 0 });
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(loadPreview, 300);
    return () => clearTimeout(handle);
  }, [loadPreview]);

  const toggleArr = (group: 'audience_filters' | 'exclusion_filters', key: keyof Filters, value: string) => {
    setForm((f) => {
      const arr = (f[group][key] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...f, [group]: { ...f[group], [key]: next.length ? next : undefined } };
    });
  };

  const setSearchField = (key: 'name' | 'email' | 'phone', value: string) => {
    setForm((f) => ({
      ...f,
      audience_filters: {
        ...f.audience_filters,
        search: { ...(f.audience_filters.search ?? {}), [key]: value || undefined },
      },
    }));
  };

  const setDateField = (key: 'created_after' | 'created_before', value: string) => {
    setForm((f) => ({
      ...f,
      audience_filters: { ...f.audience_filters, [key]: value || undefined },
    }));
  };

  const buildPayload = () => {
    const contexts = [...form.contexts];
    if (form.inline_context.trim() && !contexts.some((c) => c.inline_text === form.inline_context)) {
      contexts.push({ inline_text: form.inline_context.trim(), weight: 1 });
    }
    return {
      name: form.name,
      description: form.description || null,
      channel: 'whatsapp',
      status: form.status,
      agent_id: form.agent_id || null,
      // Mantemos tags_on_response em sincronia com tags_add (compat com o motor de resposta).
      tags_on_response: form.post_response_actions.tags_add ?? [],
      audience_filters: form.audience_filters,
      exclusion_filters: form.exclusion_filters,
      contexts,
      context_distribution: form.context_distribution,
      speed_preset: form.speed_preset,
      schedule_type: form.schedule_type,
      scheduled_at: form.scheduled_at || null,
      recurrence: form.schedule_type === 'recurring' ? form.recurrence : null,
      post_response_actions: form.post_response_actions,
      post_cadence_id: form.post_cadence_id ?? null,
    };
  };

  const saveDraft = async (): Promise<string | null> => {
    if (!form.name.trim()) { toast.error('Nome da campanha é obrigatório'); return null; }
    if (!form.agent_id) { toast.error('Selecione um agente'); return null; }
    setSaving(true);
    try {
      const payload = buildPayload();
      const { data, error } = campaignId
        ? await supabase.from('platform_crm_campaigns').update(payload).eq('id', campaignId).select('id').single()
        : await supabase.from('platform_crm_campaigns').insert(payload).select('id').single();
      if (error) { toast.error(error.message); return null; }
      toast.success('Rascunho salvo');
      return (data as any)?.id ?? null;
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    const id = await saveDraft();
    if (!id) return;
    setStarting(true);
    // TODO(edge): o disparo real (preparar contatos + agendar + enviar via WhatsApp)
    // depende do motor server-side (`campaign-start` Edge Function). Aqui só
    // persistimos; o runtime é acionado à parte.
    setStarting(false);
    toast.message('Disparo em breve', {
      description: 'A campanha foi salva. O envio automático via WhatsApp será ativado quando o motor de disparo estiver disponível.',
    });
    onClose();
  };

  const selectedContexts = useMemo(() => {
    return form.contexts
      .map((c) => c.context_id ? libraryContexts.find((lc) => lc.id === c.context_id) : null)
      .filter(Boolean) as any[];
  }, [form.contexts, libraryContexts]);

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 sticky top-0 bg-background/80 backdrop-blur z-10 py-2 -mx-4 px-4 border-b">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <h1 className="font-semibold flex-1 truncate">
          {campaignId ? 'Editar campanha' : 'Nova campanha inteligente'}
        </h1>
        <Button variant="outline" onClick={saveDraft} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar rascunho
        </Button>
        <Button onClick={start} disabled={starting || saving}>
          {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
          Iniciar campanha
        </Button>
      </div>

      {/* 1. Configuração */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Configuração</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nome da campanha *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Reativação Live" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* 2. Público */}
      <Card>
        <CardHeader><CardTitle className="text-base">2. Quem deve receber?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FilterBlock
            title="Origens"
            options={origins.map((o) => ({ value: o, label: o }))}
            selected={form.audience_filters.origins ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'origins', v)}
            emptyHint="Nenhuma origem registrada nos leads."
          />
          <FilterBlock
            title="Canais"
            options={channels.map((c) => ({ value: c, label: c }))}
            selected={form.audience_filters.channels ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'channels', v)}
            emptyHint="Nenhum canal registrado nos leads."
          />
          <FilterBlock
            title="Temperatura"
            options={[
              { value: 'hot', label: 'Quente' },
              { value: 'warm', label: 'Morno' },
              { value: 'cold', label: 'Frio' },
            ]}
            selected={form.audience_filters.temperature ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'temperature', v)}
          />
          <TagFilterBlock
            title="Etiquetas (possui ao menos uma)"
            tags={tags}
            selected={form.audience_filters.tag_ids ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'tag_ids', v)}
          />
        </CardContent>
      </Card>

      {/* 2b. Busca específica */}
      <Card>
        <CardHeader><CardTitle className="text-base">Buscar leads específicos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Nome contém</Label>
            <Input
              value={form.audience_filters.search?.name ?? ''}
              onChange={(e) => setSearchField('name', e.target.value)}
              placeholder="Ex: João"
            />
          </div>
          <div>
            <Label>E-mail contém</Label>
            <Input
              value={form.audience_filters.search?.email ?? ''}
              onChange={(e) => setSearchField('email', e.target.value)}
              placeholder="Ex: @gmail.com"
            />
          </div>
          <div>
            <Label>Telefone contém</Label>
            <Input
              value={form.audience_filters.search?.phone ?? ''}
              onChange={(e) => setSearchField('phone', e.target.value)}
              placeholder="Ex: 5511"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Inscrito a partir de</Label>
              <Input
                type="date"
                value={form.audience_filters.created_after?.slice(0, 10) ?? ''}
                onChange={(e) => setDateField('created_after', e.target.value)}
              />
            </div>
            <div>
              <Label>Até</Label>
              <Input
                type="date"
                value={form.audience_filters.created_before?.slice(0, 10) ?? ''}
                onChange={(e) => setDateField('created_before', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Exclusões */}
      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-base">3. Quem NÃO deve receber?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <TagFilterBlock
            title="Sem as etiquetas"
            tags={tags}
            selected={form.exclusion_filters.tag_ids ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'tag_ids', v)}
            destructive
          />
          <FilterBlock
            title="Sem origens"
            options={origins.map((o) => ({ value: o, label: o }))}
            selected={form.exclusion_filters.origins ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'origins', v)}
            destructive
            emptyHint="Nenhuma origem registrada nos leads."
          />
          <FilterBlock
            title="Sem canais"
            options={channels.map((c) => ({ value: c, label: c }))}
            selected={form.exclusion_filters.channels ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'channels', v)}
            destructive
            emptyHint="Nenhum canal registrado nos leads."
          />
        </CardContent>
      </Card>

      {/* Resumo público */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex flex-wrap items-center gap-6 text-sm">
          {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          <div><span className="text-muted-foreground">Total de leads:</span> <strong className="text-primary text-lg">{preview?.total ?? '—'}</strong></div>
          <div className="text-xs text-muted-foreground">
            A contagem exata do público (aplicando filtros e exclusões) é calculada no disparo.
          </div>
        </CardContent>
      </Card>

      {/* 4. Agente e Contexto */}
      <Card>
        <CardHeader><CardTitle className="text-base">4. Agente IA e Contexto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Agente *</Label>
            <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                {!agents.length && <SelectItem value="__none__" disabled>Nenhum agente ativo</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Contexto inline (opcional)</Label>
            <Textarea
              rows={5}
              value={form.inline_context}
              onChange={(e) => setForm({ ...form, inline_context: e.target.value })}
              placeholder="Ex: Este lead participou da aula ao vivo. Descubra qual foi sua principal objeção. Não envie proposta imediatamente."
            />
          </div>

          {!!libraryContexts.length && (
            <div>
              <Label>Ou selecione contextos da biblioteca</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {libraryContexts.map((c) => {
                  const sel = form.contexts.some((x) => x.context_id === c.id);
                  return (
                    <Badge
                      key={c.id}
                      variant={sel ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setForm((f) => ({
                        ...f,
                        contexts: sel
                          ? f.contexts.filter((x) => x.context_id !== c.id)
                          : [...f.contexts, { context_id: c.id, weight: 1 }],
                      }))}
                    >{c.name}</Badge>
                  );
                })}
              </div>
            </div>
          )}

          {(selectedContexts.length > 0 || form.contexts.length > 1) && (
            <div>
              <Label>Distribuição entre contextos</Label>
              <RadioGroup value={form.context_distribution} onValueChange={(v) => setForm({ ...form, context_distribution: v })} className="flex gap-4 mt-1">
                <label className="flex items-center gap-2"><RadioGroupItem value="random" />Aleatório</label>
                <label className="flex items-center gap-2"><RadioGroupItem value="sequential" />Sequencial</label>
                <label className="flex items-center gap-2"><RadioGroupItem value="weighted" />Por peso</label>
              </RadioGroup>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Velocidade */}
      <Card>
        <CardHeader><CardTitle className="text-base">5. Velocidade</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={form.speed_preset} onValueChange={(v) => setForm({ ...form, speed_preset: v })} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SPEED_PRESETS.map((p) => (
              <label key={p.value} className={`p-3 border rounded cursor-pointer ${form.speed_preset === p.value ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem value={p.value} />
                  <span className="font-medium text-sm">{p.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* 6. Agenda */}
      <Card>
        <CardHeader><CardTitle className="text-base">6. Quando enviar?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <RadioGroup value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v })} className="flex gap-4">
            <label className="flex items-center gap-2"><RadioGroupItem value="now" />Enviar agora</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="scheduled" />Agendar</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="recurring" />Recorrente</label>
          </RadioGroup>
          {form.schedule_type === 'scheduled' && (
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          )}
          {form.schedule_type === 'recurring' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.recurrence.start} onChange={(e) => setForm({ ...form, recurrence: { ...form.recurrence, start: e.target.value } })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.recurrence.end} onChange={(e) => setForm({ ...form, recurrence: { ...form.recurrence, end: e.target.value } })} />
              </div>
              <div className="col-span-2">
                <Label>Dias da semana</Label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, idx) => {
                    const sel = form.recurrence.days?.includes(idx);
                    return (
                      <Badge
                        key={idx}
                        variant={sel ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setForm((f) => {
                          const days = f.recurrence.days ?? [];
                          return {
                            ...f,
                            recurrence: {
                              ...f.recurrence,
                              days: days.includes(idx) ? days.filter((x: number) => x !== idx) : [...days, idx],
                            },
                          };
                        })}
                      >{d}</Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 7. Pós-resposta */}
      <Card>
        <CardHeader><CardTitle className="text-base">7. Quando o lead responder…</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.post_response_actions.stop}
              onCheckedChange={(c) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, stop: !!c } })}
            />
            Parar campanha para este lead
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.post_response_actions.take_over}
              onCheckedChange={(c) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, take_over: !!c } })}
            />
            Assumir conversa automaticamente (humano)
          </label>
          <Separator />
          <div>
            <Label>Definir temperatura</Label>
            <Select
              value={form.post_response_actions.temperature || 'none'}
              onValueChange={(v) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, temperature: v === 'none' ? '' : v } })}
            >
              <SelectTrigger className="max-w-xs"><SelectValue placeholder="Manter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manter</SelectItem>
                <SelectItem value="cold">Frio</SelectItem>
                <SelectItem value="warm">Morno</SelectItem>
                <SelectItem value="hot">Quente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div>
            <Label>Etiquetas aplicadas ao responder</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((t) => {
                const sel = form.post_response_actions.tags_add?.includes(t.id);
                return (
                  <Badge
                    key={t.id}
                    variant={sel ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({
                      ...f,
                      post_response_actions: {
                        ...f.post_response_actions,
                        tags_add: sel
                          ? (f.post_response_actions.tags_add ?? []).filter((x: string) => x !== t.id)
                          : [...(f.post_response_actions.tags_add ?? []), t.id],
                      },
                    }))}
                  >{t.name}</Badge>
                );
              })}
              {!tags.length && <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}
            </div>
          </div>
          <div>
            <Label>Remover etiquetas ao responder</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((t) => {
                const sel = form.post_response_actions.tags_remove?.includes(t.id);
                return (
                  <Badge
                    key={t.id}
                    variant={sel ? 'destructive' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({
                      ...f,
                      post_response_actions: {
                        ...f.post_response_actions,
                        tags_remove: sel
                          ? (f.post_response_actions.tags_remove ?? []).filter((x: string) => x !== t.id)
                          : [...(f.post_response_actions.tags_remove ?? []), t.id],
                      },
                    }))}
                  >{t.name}</Badge>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Nota automática no lead (opcional)</Label>
            <Textarea
              rows={2}
              value={form.post_response_actions.note ?? ''}
              onChange={(e) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, note: e.target.value } })}
              placeholder="Ex: Lead respondeu à campanha de reativação — verificar contexto."
            />
          </div>
          <Separator />
          <div>
            <Label>Após o disparo — inserir em cadência</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Cada lead disparado pela campanha é inscrito automaticamente nesta cadência.
            </p>
            <Select
              value={form.post_cadence_id ?? 'none'}
              onValueChange={(v) => setForm({ ...form, post_cadence_id: v === 'none' ? null : v })}
            >
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Não inscrever em cadência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não inscrever em cadência</SelectItem>
                {cadences.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterBlock({
  title,
  options,
  selected,
  onToggle,
  destructive,
  emptyHint,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  destructive?: boolean;
  emptyHint?: string;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map((o) => {
          const sel = selected.includes(o.value);
          return (
            <Badge
              key={o.value}
              variant={sel ? (destructive ? 'destructive' : 'default') : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggle(o.value)}
            >{o.label}</Badge>
          );
        })}
        {!options.length && <p className="text-xs text-muted-foreground">{emptyHint ?? '—'}</p>}
      </div>
    </div>
  );
}

function TagFilterBlock({
  title,
  tags,
  selected,
  onToggle,
  destructive,
}: {
  title: string;
  tags: { id: string; name: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  destructive?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {tags.map((t) => {
          const sel = selected.includes(t.id);
          return (
            <Badge
              key={t.id}
              variant={sel ? (destructive ? 'destructive' : 'default') : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggle(t.id)}
            >{t.name}</Badge>
          );
        })}
        {!tags.length && <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}
      </div>
    </div>
  );
}
