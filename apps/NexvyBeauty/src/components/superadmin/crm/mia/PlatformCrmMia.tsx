import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Sparkles, MessageCircle, Flame, ListTodo,
  CalendarDays, Users, BarChart3, BookOpen, Send,
  User as UserIcon, MessageSquare, TrendingUp, RefreshCw, Radio, Moon,
  Check, X, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePlatformCrmMiaChat,
  usePlatformMiaBriefing,
  usePlatformMiaOperationSummary,
  type PlatformMiaToolEvent,
} from '../data/usePlatformCrmMia';
import { usePlatformCrmMiaActions } from '../data/usePlatformCrmMiaActions';

/**
 * CRM de PLATAFORMA (super_admin) — Mia, copiloto executivo.
 *
 * Porte 1:1 do `AdminMia.tsx` do CRM Vendus, adaptado à plataforma:
 *   * Conversa: o original era VOZ (useMiaSession / WebRTC + wake word Picovoice);
 *     aqui é chat TEXTUAL contra o edge `platform-mia` (voz = v2). O "streaming"
 *     do original era áudio — o chat de texto é request/response.
 *   * Abas "Pendências" (mia_actions), "Comunicações" e "Memória" (mia_user_memory)
 *     → tabelas sem equivalente platform_crm_*; omitidas (v2).
 *   * Métricas de uso (mia_logs) → tabela inexistente; contador local da sessão.
 *   * Gate de acesso: o original checava isAdmin/isManager via useAuth (hook de
 *     tenant — proibido aqui); o gate super_admin é aplicado pelo edge (403).
 *   * Aba "Contexto" alimentada pelos tool_events retornados pelo edge (o
 *     original usava onContext do useMiaSession) — mesma lógica de snapshot.
 */

const QUICK_QUESTIONS: Array<{ label: string; icon: any; prompt: string }> = [
  { label: 'Conversas sem resposta', icon: MessageCircle, prompt: 'Quantas conversas estão sem resposta agora e com quem estão?' },
  { label: 'Leads quentes', icon: Flame, prompt: 'Quais são os leads quentes e quem é o responsável?' },
  { label: 'Tarefas atrasadas', icon: ListTodo, prompt: 'Quais tarefas estão atrasadas e com quem?' },
  { label: 'Agenda de hoje', icon: CalendarDays, prompt: 'O que tem na agenda de hoje?' },
  { label: 'Status da equipe', icon: Users, prompt: 'Como está cada vendedor agora?' },
  { label: 'Resumo da operação', icon: BarChart3, prompt: 'Me dê um resumo da operação agora.' },
];

interface MiaContextState {
  lead?: any;
  conversation?: any;
  seller?: any;
  pipeline?: any;
  followup?: any;
  daily?: any;
  lastTool?: string;
  lastAt?: number;
}

export function PlatformCrmMia() {
  const [miaContext, setMiaContext] = useState<MiaContextState>({});
  const [tab, setTab] = useState<'conversa' | 'contexto'>('conversa');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Ações propostas pela Mia (D5) — botões inline de confirmar/cancelar.
  const {
    pending: pendingActions,
    confirm: confirmAction,
    cancel: cancelAction,
    isConfirming,
    isCancelling,
    refetch: refetchActions,
  } = usePlatformCrmMiaActions();

  const handleToolEvent = useCallback((event: PlatformMiaToolEvent) => {
    // Se a Mia propôs uma ação (draft), recarrega os pendentes p/ mostrar os botões inline.
    if ((event?.result as any)?.awaiting_confirmation) {
      void refetchActions();
    }
    setMiaContext((prev) => {
      const next: MiaContextState = { ...prev, lastTool: event.tool, lastAt: Date.now() };
      switch (event.tool) {
        case 'get_lead_context':
          if (event.result?.encontrado) next.lead = event.result;
          break;
        case 'get_conversation_summary':
        case 'get_conversation_messages':
          if (event.result?.encontrado) next.conversation = event.result;
          break;
        case 'get_seller_context':
          if (event.result?.encontrado) next.seller = event.result;
          break;
        case 'get_pipeline_context':
          next.pipeline = event.result;
          break;
        case 'get_followup_context':
          next.followup = event.result;
          break;
        case 'get_daily_ai_summary':
          next.daily = event.result;
          break;
      }
      return next;
    });
  }, [refetchActions]);

  const { turns, status, queriesCount, sendText } = usePlatformCrmMiaChat({
    onToolEvent: handleToolEvent,
  });
  const thinking = status === 'thinking';

  const summaryQuery = usePlatformMiaOperationSummary();
  const summary = summaryQuery.data;

  const briefingQuery = usePlatformMiaBriefing();
  const briefing = briefingQuery.data;
  const loadingBriefing = briefingQuery.isLoading || briefingQuery.isRefetching;

  useEffect(() => {
    // Auto-scroll para a última mensagem (mesmo comportamento visual do original).
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, thinking]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    void sendText(text);
  }, [input, thinking, sendText]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const stateBadge = thinking
    ? { label: 'Analisando sua operação…', icon: Radio, cls: 'bg-primary text-primary-foreground animate-pulse' }
    : turns.length > 0
      ? { label: 'Pronta', icon: Radio, cls: 'bg-primary/10 text-primary' }
      : { label: 'Dormindo', icon: Moon, cls: 'bg-muted text-muted-foreground' };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Mia
          </h1>
          <p className="text-sm text-muted-foreground">
            Copiloto executivo do CRM da plataforma — consulta a operação inteira e responde na hora.
          </p>
        </div>
        <Badge className={cn('text-xs gap-1 px-2 py-1', stateBadge.cls)}>
          <stateBadge.icon className="h-3 w-3" />
          {stateBadge.label}
        </Badge>
      </header>

      {/* Briefing diário (1:1 com o original) */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Briefing de hoje
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Resumo executivo gerado pela Mia.{' '}
              {briefing?.gerado_em
                ? `Atualizado às ${new Date(briefing.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => briefingQuery.refetch()} disabled={loadingBriefing}>
            {loadingBriefing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {briefingQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o briefing agora. Tente atualizar.
            </p>
          ) : !briefing ? (
            <p className="text-sm text-muted-foreground">Carregando briefing…</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <MetricMini label="Sem resposta" value={briefing.operacao?.conversas_sem_resposta} icon={MessageCircle} highlight={(briefing.operacao?.conversas_sem_resposta ?? 0) > 0} />
              <MetricMini label="Leads quentes" value={briefing.leads_quentes?.length ?? 0} icon={Flame} />
              <MetricMini label="Em risco" value={briefing.oportunidades_em_risco?.length ?? 0} icon={TrendingUp} highlight={(briefing.oportunidades_em_risco?.length ?? 0) > 0} />
              <MetricMini label="Follow-ups atrasados" value={briefing.followups?.followups_atrasados ?? 0} icon={ListTodo} highlight={(briefing.followups?.followups_atrasados ?? 0) > 0} />
              {(briefing.recomendacoes?.length ?? 0) > 0 && (
                <div className="col-span-2 md:col-span-4 mt-2 space-y-1">
                  {briefing.recomendacoes!.map((r: string, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary">•</span> {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversa' | 'contexto')}>
        <TabsList>
          <TabsTrigger value="conversa">Conversar</TabsTrigger>
          <TabsTrigger value="contexto" className="gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Contexto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversa" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-1 h-5 bg-primary rounded-full flex-shrink-0" aria-hidden="true" />
                  <MessageSquare className="h-5 w-5 text-primary" /> Conversar com a Mia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div ref={scrollRef} className="h-[420px] overflow-y-auto rounded-lg border bg-muted/30 p-4 space-y-3">
                  {turns.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center pt-20">
                      Escreva pra Mia abaixo,<br />ou use uma pergunta rápida ao lado.
                    </div>
                  )}
                  {turns.map((t, i) => (
                    <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
                        t.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border',
                      )}>
                        {t.role === 'assistant' && (
                          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Mia</div>
                        )}
                        {t.text}
                      </div>
                    </div>
                  ))}
                  {thinking && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-2xl px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analisando sua operação…
                      </div>
                    </div>
                  )}
                  {/* Ações propostas pela Mia aguardando confirmação (D5) — bolha inline */}
                  {pendingActions.map((a) => (
                    <div key={a.id} className="flex justify-start">
                      <div className="max-w-[85%] w-full rounded-2xl border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          <Clock className="h-3 w-3" /> Aguardando sua confirmação
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{a.preview}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => confirmAction(a.id)} disabled={isConfirming || isCancelling}>
                            <Check className="h-3 w-3 mr-1" /> Confirmar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => cancelAction(a.id)} disabled={isConfirming || isCancelling}>
                            <X className="h-3 w-3 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Pergunte à Mia — ex: quantas conversas estão sem resposta?"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={thinking}
                  />
                  <Button onClick={handleSend} disabled={thinking || !input.trim()}>
                    {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Perguntas rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <Button
                      key={q.label}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => void sendText(q.prompt)}
                      disabled={thinking}
                    >
                      <q.icon className="h-4 w-4 mr-2" />
                      {q.label}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo operacional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Conversas abertas" value={summary?.conversas_abertas} />
                  <Row label="Sem resposta" value={summary?.conversas_sem_resposta} highlight={(summary?.conversas_sem_resposta ?? 0) > 0} />
                  <Row label="Leads quentes" value={summary?.leads_quentes} />
                  <Row label="Leads sem responsável" value={summary?.leads_sem_responsavel} highlight={(summary?.leads_sem_responsavel ?? 0) > 0} />
                  <Row label="Tarefas atrasadas" value={summary?.tarefas_atrasadas} highlight={(summary?.tarefas_atrasadas ?? 0) > 0} />
                  <Row label="Reuniões hoje" value={summary?.reunioes_hoje} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contexto" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ContextCard
              title="Lead em análise"
              icon={UserIcon}
              empty={`Pergunte à Mia: "me fale do lead X".`}
              data={miaContext.lead}
              render={(d) => (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-base">{d.lead?.nome}</div>
                  <div className="text-muted-foreground text-xs">
                    {[d.lead?.email, d.lead?.phone, d.lead?.empresa].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <Row label="Etapa" value={d.lead?.etapa ?? '—'} />
                  <Row label="Responsável" value={d.lead?.responsavel ?? '—'} />
                  <Row label="Temperatura" value={d.lead?.temperatura ?? '—'} highlight={d.lead?.temperatura === 'hot'} />
                  <Row label="Último contato" value={d.lead?.ultimo_contato ? new Date(d.lead.ultimo_contato).toLocaleDateString('pt-BR') : '—'} />
                  {(d.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {d.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
              )}
            />
            <ContextCard
              title="Conversa em análise"
              icon={MessageSquare}
              empty={`Peça um resumo: "resume a conversa com Y".`}
              data={miaContext.conversation}
              render={(d) => (
                <div className="space-y-2 text-sm">
                  {d.resumo && <p className="leading-relaxed">{d.resumo}</p>}
                  {d.sentimento && <Row label="Sentimento" value={d.sentimento} highlight={d.sentimento === 'negativo'} />}
                  {(d.objecoes?.length ?? 0) > 0 && <ListBlock title="Objeções" items={d.objecoes} />}
                  {(d.interesses?.length ?? 0) > 0 && <ListBlock title="Interesses" items={d.interesses} />}
                  {(d.proximos_passos?.length ?? 0) > 0 && <ListBlock title="Próximos passos" items={d.proximos_passos} />}
                </div>
              )}
            />
            <ContextCard
              title="Vendedor em análise"
              icon={Users}
              empty={`Pergunte: "como está o Luiz?".`}
              data={miaContext.seller}
              render={(d) => (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-base">{d.vendedor?.nome}</div>
                  <Row label="Leads ativos" value={d.leads_ativos} />
                  <Row label="Conversas abertas" value={d.conversas_abertas} />
                  <Row label="Sem resposta" value={d.conversas_sem_resposta} highlight={(d.conversas_sem_resposta ?? 0) > 0} />
                  <Row label="Tarefas atrasadas" value={d.tarefas_atrasadas} highlight={(d.tarefas_atrasadas ?? 0) > 0} />
                  <Row label="Reuniões hoje" value={d.reunioes_hoje} />
                  <Row label="Nível de gargalo" value={d.nivel_gargalo} highlight={d.nivel_gargalo !== 'baixo'} />
                </div>
              )}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Última análise</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {miaContext.lastTool ? (
                  <>
                    <Row label="Tool" value={miaContext.lastTool} />
                    <Row label="Quando" value={miaContext.lastAt ? new Date(miaContext.lastAt).toLocaleTimeString('pt-BR') : '—'} />
                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => setMiaContext({})}>
                      Limpar contexto
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">Nenhuma análise nesta sessão ainda.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="py-4 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
          <span>Consultas nesta sessão: <strong className="text-foreground">{queriesCount}</strong></span>
          <span className="ml-auto opacity-70">Mia · Plataforma v1 (consulta e análise) · ações de escrita chegam na v2</span>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number | string | undefined; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', highlight && 'text-orange-600 dark:text-orange-400')}>
        {value ?? '—'}
      </span>
    </div>
  );
}

function MetricMini({ label, value, icon: Icon, highlight }: { label: string; value: number | undefined; icon: any; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3 flex flex-col gap-1', highlight && 'border-orange-300 dark:border-orange-900/60')}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className={cn('text-xl font-bold tabular-nums', highlight && 'text-orange-600 dark:text-orange-400')}>
        {value ?? 0}
      </div>
    </div>
  );
}

function ContextCard({
  title, icon: Icon, empty, data, render,
}: {
  title: string; icon: any; empty: string; data: any; render: (d: any) => JSX.Element;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data ? render(data) : <p className="text-xs text-muted-foreground">{empty}</p>}
      </CardContent>
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <ul className="space-y-0.5">
        {items.slice(0, 5).map((it, i) => (
          <li key={i} className="text-xs flex items-start gap-1.5"><span className="text-primary">•</span>{it}</li>
        ))}
      </ul>
    </div>
  );
}
