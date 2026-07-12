import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Save, Rocket, Pause, Workflow, Zap, Activity, Settings as SettingsIcon,
  MessageCircle, MessageSquare, Heart, Reply, Sparkles, Trash2, GripVertical, ChevronUp, ChevronDown,
  Bot, Clock, Tag, GitBranch, Play, Wand2, PlayCircle, Repeat, UserPlus,
} from 'lucide-react';
import { useInstagramFlow, useUpdateInstagramFlow, useInstagramFlowRuns, type IGFlowBlock } from './useInstagramFlows';
import { useDryRunInstagramFlow, type FlowDryRunPlan } from './useInstagramFlowAI';
import { usePlatformCrmTags } from '../data/usePlatformCrmTags';
import { usePlatformCrmCadences } from '../data/usePlatformCrmCadences';
import { usePlatformCrmSectors } from '../data/usePlatformCrmSectors';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AIFlowGeneratorDialog } from './AIFlowGeneratorDialog';
import { InstagramPostPicker } from './InstagramPostPicker';

interface Props {
  flowId: string;
  onBack: () => void;
}

const BLOCK_CATALOG: { type: string; label: string; icon: any; color: string; description: string }[] = [
  { type: 'ig_reply_comment',  label: 'Responder comentário',  icon: Reply,          color: 'text-pink-500',    description: 'Responde publicamente no comentário.' },
  { type: 'ig_private_reply',  label: 'Enviar DM privada',      icon: MessageCircle,  color: 'text-purple-500',  description: 'DM ao autor do comentário (janela 7d).' },
  { type: 'ig_like_comment',   label: 'Curtir comentário',      icon: Heart,          color: 'text-red-500',     description: 'Dá like no comentário que disparou.' },
  { type: 'ig_send_dm',        label: 'Enviar mensagem DM',     icon: MessageSquare,  color: 'text-blue-500',    description: 'Envia texto na conversa.' },
  { type: 'ai_takeover',       label: 'IA assume',              icon: Bot,            color: 'text-emerald-500', description: 'Passa a conversa para um agente IA.' },
  { type: 'wait',              label: 'Aguardar',               icon: Clock,          color: 'text-amber-500',   description: 'Pausa alguns segundos antes do próximo bloco.' },
  { type: 'apply_tag',         label: 'Aplicar etiqueta',       icon: Tag,            color: 'text-teal-500',    description: 'Marca o lead com uma etiqueta do CRM.' },
  { type: 'enroll_cadence',    label: 'Inscrever em cadência',  icon: Repeat,         color: 'text-cyan-500',    description: 'Inicia uma cadência de follow-up para o lead.' },
  { type: 'assign_lead',       label: 'Atribuir lead',          icon: UserPlus,       color: 'text-orange-500',  description: 'Envia o lead para um setor ou vendedor.' },
  { type: 'condition_text',    label: 'Ramificar por texto',    icon: GitBranch,      color: 'text-indigo-500',  description: 'Continua caminhos diferentes conforme o texto do gatilho.' },
];

function newBlock(type: string): IGFlowBlock {
  const base: any = {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    position: { x: 0, y: 0 },
    next_block_id: null,
  };
  if (type === 'wait') base.data = { seconds: 3 };
  else if (type === 'apply_tag') base.data = { tag_id: '' };
  else if (type === 'enroll_cadence') base.data = { cadence_id: '' };
  else if (type === 'assign_lead') base.data = { sector_id: '', user_id: '' };
  else if (type === 'condition_text') base.data = { keywords: [], match: 'any' };
  else if (type === 'ig_like_comment') base.data = {};
  else base.data = { text: '' };
  return base as IGFlowBlock;
}

export function InstagramFlowBuilder({ flowId, onBack }: Props) {
  const { data: flow, isLoading, refetch } = useInstagramFlow(flowId);
  const update = useUpdateInstagramFlow();
  const { data: runs } = useInstagramFlowRuns(flowId);
  const { data: tags } = usePlatformCrmTags();
  const { cadences } = usePlatformCrmCadences();
  const { data: sectors } = usePlatformCrmSectors();
  const dryRun = useDryRunInstagramFlow();
  const [testing, setTesting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [blocks, setBlocks] = useState<IGFlowBlock[]>([]);
  const [startBlockId, setStartBlockId] = useState<string | null>(null);
  const [throttleHours, setThrottleHours] = useState(24);
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [preview, setPreview] = useState<FlowDryRunPlan[] | null>(null);

  useEffect(() => {
    if (!flow) return;
    setName(flow.name);
    setDescription(flow.description ?? '');
    setTriggerConfig(flow.trigger_config ?? {});
    setBlocks(flow.flow_blocks ?? []);
    setStartBlockId(flow.start_block_id);
    setThrottleHours(flow.throttle_per_sender_hours);
    setDirty(false);
  }, [flow?.id, flow?.updated_at]);

  const rewireChain = (list: IGFlowBlock[]): IGFlowBlock[] =>
    list.map((b, i) => ({ ...b, next_block_id: list[i + 1]?.id ?? null }));

  const addBlock = (type: string) => {
    const nb = newBlock(type);
    setBlocks(prev => rewireChain([...prev, nb]));
    if (blocks.length === 0) setStartBlockId(nb.id);
    setDirty(true);
  };
  const removeBlock = (id: string) => {
    setBlocks(prev => {
      const next = rewireChain(prev.filter(b => b.id !== id));
      if (startBlockId === id) setStartBlockId(next[0]?.id ?? null);
      return next;
    });
    setDirty(true);
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      const rewired = rewireChain(copy);
      setStartBlockId(rewired[0]?.id ?? null);
      return rewired;
    });
    setDirty(true);
  };
  const updateBlockData = (id: string, data: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, data: { ...b.data, ...data } } : b));
    setDirty(true);
  };

  const handleSave = async () => {
    await update.mutateAsync({
      id: flowId,
      name, description: description || null,
      trigger_config: triggerConfig,
      flow_blocks: blocks,
      start_block_id: startBlockId ?? blocks[0]?.id ?? null,
      throttle_per_sender_hours: throttleHours,
    } as any);
    setDirty(false);
    toast.success('Fluxo salvo');
  };

  const handlePublish = async () => {
    if (blocks.length === 0) { toast.error('Adicione ao menos um bloco antes de publicar'); return; }
    await update.mutateAsync({ id: flowId, status: 'active' } as any);
    toast.success('Automação publicada!');
  };
  const handlePause = async () => {
    await update.mutateAsync({ id: flowId, status: 'paused' } as any);
  };

  const runPreview = async () => {
    if (dirty) { await handleSave(); }
    const res = await dryRun.mutateAsync({ flow_id: flowId, trigger_text: previewText });
    setPreview(res.plan ?? []);
  };

  if (isLoading || !flow) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold truncate">{name || 'Sem nome'}</h1>
              <Badge variant={flow.status === 'active' ? 'default' : 'secondary'}>
                {flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
              </Badge>
              {dirty && <Badge variant="outline" className="text-amber-600 border-amber-500">Não salvo</Badge>}
            </div>
            <p className="text-sm text-muted-foreground truncate">{description || 'Automação do Instagram'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setAiOpen(true)} className="gap-2">
            <Wand2 className="h-4 w-4 text-purple-500" /> Refinar com IA
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={!dirty || update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
          {flow.status === 'active' ? (
            <Button variant="outline" onClick={handlePause} className="gap-2"><Pause className="h-4 w-4" /> Pausar</Button>
          ) : (
            <Button onClick={handlePublish} className="gap-2"><Rocket className="h-4 w-4" /> Publicar</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="flow" className="flex-1 flex flex-col mt-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="flow" className="gap-2"><Workflow className="h-4 w-4" /><span className="hidden sm:inline">Fluxo</span></TabsTrigger>
          <TabsTrigger value="trigger" className="gap-2"><Zap className="h-4 w-4" /><span className="hidden sm:inline">Gatilho</span></TabsTrigger>
          <TabsTrigger value="preview" className="gap-2"><PlayCircle className="h-4 w-4" /><span className="hidden sm:inline">Preview</span></TabsTrigger>
          <TabsTrigger value="runs" className="gap-2"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Execuções</span></TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><SettingsIcon className="h-4 w-4" /><span className="hidden sm:inline">Config</span></TabsTrigger>
        </TabsList>

        {/* FLUXO */}
        <TabsContent value="flow" className="flex-1 mt-4">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card>
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2 px-2">Blocos</p>
                {BLOCK_CATALOG.map(b => {
                  const Icon = b.icon;
                  return (
                    <button key={b.type} onClick={() => addBlock(b.type)}
                      className="w-full text-left rounded-lg border border-transparent hover:border-primary/40 hover:bg-accent p-2.5 flex items-start gap-2 transition-colors">
                      <Icon className={`h-4 w-4 mt-0.5 ${b.color}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{b.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                {blocks.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground space-y-3">
                    <Sparkles className="h-8 w-8 mx-auto" />
                    <p>Adicione blocos à esquerda ou <button onClick={() => setAiOpen(true)} className="text-primary underline underline-offset-2">peça para a IA gerar</button>.</p>
                  </div>
                ) : (
                  <ol className="space-y-3">
                    {blocks.map((b, i) => {
                      const meta = BLOCK_CATALOG.find(c => c.type === b.type);
                      const Icon = meta?.icon ?? MessageSquare;
                      return (
                        <li key={b.id} className="rounded-lg border bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <Icon className={`h-4 w-4 ${meta?.color}`} />
                            <span className="text-sm font-medium">{i + 1}. {meta?.label ?? b.type}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveBlock(b.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === blocks.length - 1} onClick={() => moveBlock(b.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeBlock(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </div>
                          <BlockEditor block={b} tags={tags ?? []} cadences={cadences ?? []} sectors={sectors ?? []} onChange={(d) => updateBlockData(b.id, d)} />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* GATILHO */}
        <TabsContent value="trigger" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-3xl">
              <div>
                <p className="text-sm text-muted-foreground">Tipo do gatilho</p>
                <p className="font-medium capitalize">{flow.trigger_type.replace('_', ' ')}</p>
              </div>

              {(flow.trigger_type === 'comment_keyword' || flow.trigger_type === 'dm_keyword' || flow.trigger_type === 'story_reply') && (
                <>
                  <div className="space-y-1.5">
                    <Label>Palavras-chave (separadas por vírgula)</Label>
                    <Input
                      value={(triggerConfig.keywords || []).join(', ')}
                      onChange={(e) => { setTriggerConfig({ ...triggerConfig, keywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }); setDirty(true); }}
                      placeholder="quero, info, link"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modo de correspondência</Label>
                    <Select value={triggerConfig.match ?? 'any'} onValueChange={(v) => { setTriggerConfig({ ...triggerConfig, match: v }); setDirty(true); }}>
                      <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer palavra bate</SelectItem>
                        <SelectItem value="all">Todas as palavras precisam bater</SelectItem>
                        <SelectItem value="exact">Texto exato</SelectItem>
                        <SelectItem value="regex">Expressão regular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="cs" checked={!!triggerConfig.case_sensitive} onCheckedChange={(v) => { setTriggerConfig({ ...triggerConfig, case_sensitive: v }); setDirty(true); }} />
                    <Label htmlFor="cs">Diferenciar maiúsculas/minúsculas</Label>
                  </div>
                </>
              )}

              {flow.trigger_type === 'comment_keyword' && (
                <div className="space-y-2">
                  <Label>Posts alvo (opcional)</Label>
                  <InstagramPostPicker
                    connectionId={flow.connection_id}
                    selectedIds={triggerConfig.post_ids ?? []}
                    onChange={(ids) => { setTriggerConfig({ ...triggerConfig, post_ids: ids }); setDirty(true); }}
                  />
                </div>
              )}
              {flow.trigger_type === 'manual' && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Disparo manual</p>
                  <p className="text-xs text-muted-foreground">Este fluxo só roda quando você clicar em testar aqui ou for chamado por outra automação.</p>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={testing || blocks.length === 0}
                    onClick={async () => {
                      if (dirty) await handleSave();
                      setTesting(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('platform-ig-flow-executor', {
                          body: { flow_id: flowId, trigger_source: 'manual_test', dry_run: false },
                        });
                        if (error) throw error;
                        toast.success(`Executado: ${(data as any)?.executed?.length ?? 0} bloco(s)`);
                      } catch (e: any) {
                        toast.error(e?.message ?? 'Erro ao testar');
                      } finally { setTesting(false); }
                    }}
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Testar agora
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* PREVIEW */}
        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-3xl">
              <div>
                <p className="text-sm font-medium">Simule o gatilho</p>
                <p className="text-xs text-muted-foreground">Digite o comentário/DM/reply de teste. Nenhuma mensagem é enviada de verdade.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Ex: quero saber o preço" />
                <Button onClick={runPreview} disabled={dryRun.isPending} className="gap-2 shrink-0">
                  {dryRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Executar
                </Button>
              </div>

              {preview && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Plano de execução</p>
                  {preview.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum bloco seria executado.</p>
                  ) : (
                    <ol className="space-y-2">
                      {preview.map((p, i) => {
                        const meta = BLOCK_CATALOG.find(c => c.type === p.type);
                        const Icon = meta?.icon ?? MessageSquare;
                        return (
                          <li key={p.block_id} className="rounded-lg border bg-card p-3 flex items-start gap-3">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</div>
                            <Icon className={`h-4 w-4 mt-0.5 ${meta?.color}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{p.action}</p>
                              {p.preview && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.preview}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXECUÇÕES */}
        <TabsContent value="runs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {!runs || runs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2" />
                  <p>Nenhuma execução ainda.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {runs.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'}>
                          {r.status}
                        </Badge>
                        <span className="text-muted-foreground shrink-0">{r.trigger_source}</span>
                        <span className="truncate">{r.payload?.trigger_text ?? r.source_id ?? '—'}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-2xl">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Throttle por usuário (horas)</Label>
                <Input type="number" min={0} max={720} value={throttleHours}
                  onChange={(e) => { setThrottleHours(Number(e.target.value) || 0); setDirty(true); }} className="max-w-[120px]" />
                <p className="text-xs text-muted-foreground">Evita disparar o mesmo fluxo para o mesmo usuário dentro deste intervalo. Use 0 para desativar.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AIFlowGeneratorDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        connectionId={flow.connection_id}
        existingFlowId={flowId}
        onGenerated={() => { setAiOpen(false); refetch(); toast.success('Fluxo atualizado pela IA!'); }}
      />
    </div>
  );
}

function BlockEditor({ block, tags, cadences, sectors, onChange }: { block: IGFlowBlock; tags: any[]; cadences: any[]; sectors: any[]; onChange: (d: any) => void }) {
  const d = block.data ?? {};
  if (block.type === 'wait') {
    return (
      <div className="pl-6 flex items-center gap-2">
        <Label className="text-xs">Segundos</Label>
        <Input type="number" min={1} max={30} className="w-24" value={d.seconds ?? 3} onChange={(e) => onChange({ seconds: Number(e.target.value) || 1 })} />
      </div>
    );
  }
  if (block.type === 'ig_like_comment') {
    return <p className="pl-6 text-xs text-muted-foreground">Curte automaticamente o comentário que disparou este fluxo.</p>;
  }
  if (block.type === 'ai_takeover') {
    return (
      <div className="pl-6 space-y-1.5">
        <Label className="text-xs">Prompt inicial (opcional)</Label>
        <Textarea rows={2} value={d.prompt ?? ''} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="Ex: Cliente veio do comentário X — cumprimente e ofereça o link do produto." />
      </div>
    );
  }
  if (block.type === 'apply_tag') {
    return (
      <div className="pl-6 space-y-1.5">
        <Label className="text-xs">Etiqueta</Label>
        <Select value={d.tag_id ?? ''} onValueChange={(v) => onChange({ tag_id: v, tag_name: tags.find(t => t.id === v)?.name })}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder={tags.length === 0 ? 'Nenhuma etiqueta cadastrada' : 'Selecione uma etiqueta'} /></SelectTrigger>
          <SelectContent>
            {tags.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {d.tag_id_pending && !d.tag_id && (
          <p className="text-xs text-amber-600">IA sugeriu a etiqueta "{d.tag_id_pending}" — crie no CRM ou escolha outra.</p>
        )}
      </div>
    );
  }
  if (block.type === 'enroll_cadence') {
    const active = (cadences ?? []).filter((c: any) => c.status === 'active');
    return (
      <div className="pl-6 space-y-1.5">
        <Label className="text-xs">Cadência ativa</Label>
        <Select value={d.cadence_id ?? ''} onValueChange={(v) => onChange({ cadence_id: v, cadence_name: active.find((c: any) => c.id === v)?.name })}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder={active.length === 0 ? 'Nenhuma cadência ativa' : 'Selecione uma cadência'} /></SelectTrigger>
          <SelectContent>
            {active.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {d.cadence_id_pending && !d.cadence_id && (
          <p className="text-xs text-amber-600">IA sugeriu "{d.cadence_id_pending}" — crie ou ative essa cadência.</p>
        )}
      </div>
    );
  }
  if (block.type === 'assign_lead') {
    return (
      <div className="pl-6 space-y-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Setor (opcional)</Label>
          <Select value={d.sector_id ?? ''} onValueChange={(v) => onChange({ sector_id: v, sector_name: sectors.find((s: any) => s.id === v)?.name })}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder={sectors.length === 0 ? 'Nenhum setor cadastrado' : 'Selecione um setor'} /></SelectTrigger>
            <SelectContent>
              {sectors.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[10px] text-muted-foreground">O setor distribui o lead entre seus membros conforme a estratégia configurada.</p>
        {(d.sector_id_pending || d.user_id_pending) && (
          <p className="text-xs text-amber-600">IA sugeriu "{d.sector_id_pending ?? d.user_id_pending}" — ajuste manualmente.</p>
        )}
      </div>
    );
  }
  if (block.type === 'condition_text') {
    return (
      <div className="pl-6 space-y-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Palavras-chave (separadas por vírgula)</Label>
          <Input
            value={(d.keywords ?? []).join(', ')}
            onChange={(e) => onChange({ keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="quero, sim, tenho interesse"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Modo</Label>
          <Select value={d.match ?? 'any'} onValueChange={(v) => onChange({ match: v })}>
            <SelectTrigger className="max-w-[180px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Qualquer palavra</SelectItem>
              <SelectItem value="all">Todas as palavras</SelectItem>
              <SelectItem value="exact">Texto exato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Se bater, continua no próximo bloco; se não bater, o fluxo termina aqui.</p>
      </div>
    );
  }
  return (
    <div className="pl-6 space-y-1.5">
      <Label className="text-xs">Texto</Label>
      <Textarea
        rows={2}
        value={d.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={block.type === 'ig_reply_comment' ? 'Ex: Te chamei no direct 👉' : 'Escreva a mensagem...'}
      />
      <p className="text-[10px] text-muted-foreground">Use {'{{trigger_text}}'} ou {'{{sender}}'} para inserir dados do gatilho.</p>
    </div>
  );
}
