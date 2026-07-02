import { useMemo, useState } from 'react';
import {
  MessageSquare, Clock, Bot, AlertTriangle, Target, Activity,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from './reports/KpiCard';
import { StatusBars } from './reports/StatusBars';
import { TeamRanking } from './reports/TeamRanking';
import { ChannelGrid } from './reports/ChannelGrid';
import { SmartAlerts } from './reports/SmartAlerts';
import { RisksTable } from './reports/RisksTable';
import { ReportsFilters } from './reports/ReportsFilters';
import {
  usePlatformCrmAttendanceReports,
  buildPlatformInsights,
  formatDuration,
  type PlatformReportsFilters,
} from '../data/usePlatformCrmAttendanceReports';

/**
 * RELATÓRIOS de Atendimento do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `admin/webchat/reports/AttendanceReports.tsx` (container da
 * seção Relatórios do WebChatReportsTab) do CRM Vendus: KPIs com delta vs
 * período anterior + filtros + status/ranking + canais + alertas inteligentes
 * + leads em risco.
 *
 * Adaptações (desacoplamento do tenant):
 *   - Dados: `useAttendanceReports` + `buildInsights` (tenant) →
 *     `usePlatformCrmAttendanceReports` + `buildPlatformInsights`
 *     (platform_crm_conversations / platform_crm_deals / profiles).
 *   - `productId` removido do estado de filtros — `product_id` não existe
 *     no schema platform_crm_* (a plataforma vende 1 SaaS).
 *   - `onOpenConversation` injetado pelo pai (fiação do menu) substitui o
 *     sessionStorage + searchParams do tenant na tabela de riscos.
 */

interface Props {
  onOpenConversation?: (id: string) => void;
}

export function PlatformCrmInboxReports({ onOpenConversation }: Props = {}) {
  const [filters, setFilters] = useState<PlatformReportsFilters>({
    period: '30d',
    channel: 'all',
    userId: null,
    agentId: null,
  });

  const data = usePlatformCrmAttendanceReports(filters);
  const insights = useMemo(() => buildPlatformInsights(data), [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Visão geral da operação de atendimento e conversão.</p>
        </div>
        <ReportsFilters filters={filters} onChange={setFilters} />
      </div>

      {data.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Conversas Ativas"
            value={data.activeConversations.current.toLocaleString('pt-BR')}
            delta={data.activeConversations.pct}
            hint="vs período anterior"
            icon={Activity}
            tone="neutral"
          />
          <KpiCard
            label="Aguardando Atendimento"
            value={data.waiting.current.toLocaleString('pt-BR')}
            hint="Necessitam ação humana"
            icon={Clock}
            tone="amber"
          />
          <KpiCard
            label="Tempo Médio de Resposta"
            value={formatDuration(data.avgResponseMs.current)}
            delta={data.avgResponseMs.pct}
            invertDelta
            icon={MessageSquare}
            tone="neutral"
          />
          <KpiCard
            label="Resolvido pela IA"
            value={`${data.aiResolutionPct.current}%`}
            hint="Sem intervenção humana"
            icon={Bot}
            tone="primary"
          />
          <KpiCard
            label="Leads em Risco"
            value={data.risks.current.toLocaleString('pt-BR')}
            hint="Sem resposta há +30min"
            icon={AlertTriangle}
            tone="destructive"
          />
          <KpiCard
            label="Conversões"
            value={data.conversions.current.toLocaleString('pt-BR')}
            delta={data.conversions.pct}
            hint="Geradas via atendimento"
            icon={Target}
            tone="success"
          />
        </div>
      )}

      {/* Linha 2: Status + Ranking */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusBars data={data.statusBreakdown} />
        <TeamRanking rows={data.team} />
      </div>

      {/* Linha 3: Canais */}
      <ChannelGrid channels={data.channels} />

      {/* Linha 4: Alertas */}
      <SmartAlerts insights={insights} />

      {/* Linha 5: Leads em Risco */}
      <RisksTable rows={data.riskList} onOpenConversation={onOpenConversation} />
    </div>
  );
}
