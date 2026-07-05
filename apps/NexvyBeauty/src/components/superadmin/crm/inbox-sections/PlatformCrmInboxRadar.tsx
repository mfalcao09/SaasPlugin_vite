import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  type PlatformScanFilters,
  type PlatformActionsConfig,
} from '../data/usePlatformCrmRadar';
import { ScrollArea } from '@/components/ui/scroll-area';

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
      {/* Header de página (receita F3): título text-lg + subtítulo + badge IA
          na cor semântica §1.3 (emerald = IA). Sem gradient hero (era ruído). */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Radar IA</h2>
            <p className="text-sm text-muted-foreground">
              Analisa conversas em aberto e identifica oportunidades quentes que precisam de atenção
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
        >
          <Sparkles className="h-3 w-3" />
          Powered by AI
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="run" className="gap-2">
            <Play className="h-4 w-4" /> Rodar Análise
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Agendamentos
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4">
          <div className="grid lg:grid-cols-[380px_1fr] gap-4">
            <ScrollArea className="lg:h-[calc(100vh-280px)]">
              <div className="space-y-4 pr-2">
                <RadarFilters value={filters} onChange={setFilters} />
                <RadarActionsConfig value={actions} onChange={setActions} />

                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <Button
                      onClick={handleRun}
                      className="w-full gap-2"
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
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <div>
              {displayScanId ? (
                <RadarDashboard
                  scanId={displayScanId}
                  onOpenConversation={onOpenConversation}
                  isHistorical={isHistorical}
                  onBackToLatest={() => setActiveScanId(null)}
                />
              ) : (
                /* Empty-state dia-0 HONESTO (§3.1 + guia do braço): diz que ainda
                   não há análise E o que fazer para ter dados. Padrão do
                   PlatformCrmEmptyInboxState (círculo h-20 + cards bg-muted/50). */
                <Card>
                  <CardContent className="py-12 flex items-center justify-center">
                    <div className="text-center max-w-md space-y-6">
                      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                        <Sparkles className="h-10 w-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Nenhuma análise ainda</h3>
                        <p className="text-sm text-muted-foreground">
                          O Radar IA lê suas conversas em aberto e classifica cada lead por
                          temperatura. Rode a primeira análise para ver os resultados aqui.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 text-left">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <SlidersHorizontal className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">1. Ajuste os filtros</p>
                            <p className="text-xs text-muted-foreground">
                              Ao lado: período de inatividade, temperatura, canal, etiquetas e
                              atendentes que o radar deve considerar.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
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
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
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
                  </CardContent>
                </Card>
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
