import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, History, CalendarClock, Play, Loader2, SlidersHorizontal, Rocket } from 'lucide-react';
import { RadarFilters } from './RadarFilters';
import { RadarActionsConfig } from './RadarActionsConfig';
import { RadarDashboard } from './RadarDashboard';
import { RadarHistory } from './RadarHistory';
import { RadarSchedules } from './RadarSchedules';
import {
  useRunPlatformCrmOpportunityScan,
  usePlatformCrmOpportunityScans,
  usePlatformCrmOpportunitySchedules,
  type PlatformScanFilters,
  type PlatformActionsConfig,
} from '../data/usePlatformCrmRadar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * RADAR IA do CRM de PLATAFORMA (super_admin) — seção `radar` do InboxManager.
 * PORTE 1:1 de `admin/radar/RadarPanel.tsx` do CRM Vendus: header "Radar IA" +
 * 3 abas (Rodar Análise / Agendamentos / Histórico) + coluna de filtros/ações +
 * dashboard de resultados.
 *
 * ⚠️ TODO(edge): o MOTOR (edge LLM `opportunity-scan-run` + tabelas de scan do
 * platform) não existe — "Rodar Radar agora" responde toast "em breve" e as
 * listas renderizam os empty-states. A ESTRUTURA da tela está 1:1 e pronta
 * para receber o motor.
 */

const DEFAULT_FILTERS: PlatformScanFilters = {
  inactivity_days_min: 0,
  inactivity_days_max: 14,
  min_client_messages: 1,
  include_ai_active: false,
  statuses: ['waiting_human', 'human_active', 'bot_active'],
  product_ids: [],
  assigned_user_ids: [],
  tag_ids: [],
  sector_ids: [],
  channels: [],
  squad_ids: [],
  temperatures: [],
  exclude_product_ids: [],
  exclude_assigned_user_ids: [],
  exclude_tag_ids: [],
  exclude_sector_ids: [],
  exclude_channels: [],
  exclude_lead_ids: [],
};

const DEFAULT_ACTIONS: PlatformActionsConfig = {
  hot: { create_task: { enabled: true, due_in_hours: 4 }, notify_owner: true },
  warm: { create_task: { enabled: false, due_in_hours: 24 } },
  cold: {},
  lost: {},
};

export function PlatformCrmInboxRadar({
  onOpenConversation,
}: { onOpenConversation?: (id: string) => void } = {}) {
  const [filters, setFilters] = useState<PlatformScanFilters>(DEFAULT_FILTERS);
  const [actions, setActions] = useState<PlatformActionsConfig>(DEFAULT_ACTIONS);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [tab, setTab] = useState('run');

  const runScan = useRunPlatformCrmOpportunityScan();
  const { data: scans } = usePlatformCrmOpportunityScans();
  const { data: schedules } = usePlatformCrmOpportunitySchedules();

  // Contadores SEMPRE visíveis nas abas (§3.4): 0 em muted; agendamentos>0 em
  // success (automação ligada), scans>0 em muted-forte (histórico, neutro).
  const schedulesCount = schedules?.length ?? 0;
  const scansCount = scans?.length ?? 0;

  const lastRunning = useMemo(
    () => scans?.find((s) => s.status === 'running' || s.status === 'pending'),
    [scans],
  );
  const latestId = lastRunning?.id || scans?.[0]?.id || null;
  const displayScanId = activeScanId || latestId;
  const isHistorical = !!activeScanId && activeScanId !== latestId;

  function handleSelectHistory(id: string) {
    setActiveScanId(id);
    setTab('run');
  }

  async function handleRun() {
    // TODO(edge): quando o motor existir, o retorno trará scan_id real.
    const res = await runScan.mutateAsync({ filters, actions_config: actions });
    if (res?.scan_id) setActiveScanId(res.scan_id);
  }

  return (
    <div className="space-y-4">
      {/* Header de página (receita F3 lux): título text-lg + subtítulo + pílula IA
          "Powered by AI" na assinatura dourada (.hairline-gold, texto --gold). */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          {/* Pílula-ícone de destaque = brand-gradient + brand-glow (exemplar KPI accent). */}
          <div className="brand-gradient brand-glow h-9 w-9 rounded-lg text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Radar IA</h2>
            <p className="text-sm text-muted-foreground">
              Analisa conversas em aberto e identifica oportunidades quentes que precisam de atenção
            </p>
          </div>
        </div>
        {/* "Powered by AI" = pílula hairline dourada + texto/ícone --gold (§ instrução). */}
        <span
          className="inline-flex items-center gap-1 rounded-full border hairline-gold px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: 'var(--gold)' }}
        >
          <Sparkles className="h-3 w-3" />
          Powered by AI
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        {/* Trilho de abas no bg-muted/40 (§3.4). Contador SEMPRE visível: 0 = muted;
            agendamentos>0 = emerald (automação ligada); scans>0 = neutro forte. */}
        <TabsList className="bg-muted/40">
          <TabsTrigger value="run" className="gap-2">
            <Play className="h-4 w-4" /> Rodar Análise
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Agendamentos
            <span
              className={cn(
                'h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[10px] font-semibold tabular-nums',
                schedulesCount > 0
                  ? 'bg-emerald-500 text-white'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {schedulesCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Histórico
            <span
              className={cn(
                'h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[10px] font-semibold tabular-nums',
                scansCount > 0
                  ? 'bg-muted text-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {scansCount}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4">
          <div className="grid lg:grid-cols-[380px_1fr] gap-4">
            {/* Coluna esquerda: filtros/ações roláveis + CTA FIXO abaixo do box
                (pedido Marcelo 07-12: botão sempre visível, fora do scroll). */}
            <div className="flex flex-col gap-4">
              <ScrollArea className="lg:h-[calc(100vh-372px)]">
                <div className="space-y-4 pr-2">
                  <RadarFilters value={filters} onChange={setFilters} />
                  <RadarActionsConfig value={actions} onChange={setActions} />
                </div>
              </ScrollArea>

              {/* CTA "Rodar Radar agora" em surface-card lux; botão = assinatura
                  dourada brand-gradient + brand-glow (ação primária do exemplar). */}
              <div className="surface-card p-4">
                <Button
                  onClick={handleRun}
                  className="w-full gap-2 brand-gradient brand-glow text-white border-0 transition-transform duration-200 hover:-translate-y-0.5 disabled:hover:translate-y-0"
                  disabled={runScan.isPending || !!lastRunning}
                >
                  {runScan.isPending || lastRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {lastRunning ? 'Análise em andamento...' : 'Iniciando...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Rodar Radar agora
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div>
              {displayScanId ? (
                <RadarDashboard
                  scanId={displayScanId}
                  onOpenConversation={onOpenConversation}
                  isHistorical={isHistorical}
                  onBackToLatest={() => setActiveScanId(null)}
                />
              ) : (
                /* Empty-state dia-0 HONESTO (§3.1 lux): círculo brand-gradient suave
                   + 3 dicas bg-muted/50 com hairline. Diz o que ainda não há E o que
                   fazer. Mesma anatomia do exemplar (surface-card). */
                <div className="surface-card py-12 flex items-center justify-center">
                  <div className="text-center max-w-md space-y-6 px-4">
                    <div className="brand-gradient brand-glow h-20 w-20 rounded-full flex items-center justify-center mx-auto">
                      <Sparkles className="h-10 w-10 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Nenhuma análise ainda</h3>
                      <p className="text-sm text-muted-foreground">
                        O Radar IA lê suas conversas em aberto e classifica cada lead por
                        temperatura. Rode a primeira análise para ver os resultados aqui.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-left">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border hairline">
                        <SlidersHorizontal className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">1. Ajuste os filtros</p>
                          <p className="text-xs text-muted-foreground">
                            Ao lado: período de inatividade, temperatura, canal, etiquetas e
                            atendentes que o radar deve considerar.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border hairline">
                        <Rocket className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">2. Rode o Radar</p>
                          <p className="text-xs text-muted-foreground">
                            Clique em <span className="font-medium">Rodar Radar agora</span>. O
                            motor de análise está em construção — enquanto isso, a tela avisa
                            quando estiver disponível.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border hairline">
                        <CalendarClock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">3. Automatize (opcional)</p>
                          <p className="text-xs text-muted-foreground">
                            Na aba <span className="font-medium">Agendamentos</span>, deixe o
                            radar rodar sozinho em horários fixos.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedules">
          <RadarSchedules defaultFilters={filters} defaultActions={actions} />
        </TabsContent>

        <TabsContent value="history">
          <RadarHistory onSelect={handleSelectHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
