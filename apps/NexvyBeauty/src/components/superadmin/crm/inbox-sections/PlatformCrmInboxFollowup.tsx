import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  usePlatformCrmFollowupStats,
  usePlatformCrmFollowupActiveLeads,
  usePlatformCrmFollowupRealtime,
  type PlatformFollowupFilters,
  type PlatformFollowupStatusKey,
} from '../data/usePlatformCrmFollowup';
import { usePlatformCrmAgentConfigs } from '../data/usePlatformCrmAgentConfigs';
import { FollowupKpiCards } from './FollowupKpiCards';
import { FollowupRecoveryByAttempt } from './FollowupRecoveryByAttempt';
import { FollowupSentTrend } from './FollowupSentTrend';
import { FollowupActiveStatusDonut } from './FollowupActiveStatusDonut';
import { FollowupActiveLeadsTable } from './FollowupActiveLeadsTable';
import { FollowupUpcomingWidget } from './FollowupUpcomingWidget';

/**
 * FOLLOW-UPS do CRM de PLATAFORMA (super_admin) — seção `followup` do
 * InboxManager. PORTE 1:1 de `admin/followup/FollowupPanel.tsx` do CRM Vendus:
 * header + filtros (período/agente) + KPIs + 3 gráficos + tabela de réguas
 * ativas + widget de próximos disparos.
 *
 * Adaptações de dados (UI intacta):
 *   - `useFollowupPanel` (fila `ai_outreach_queue` do tenant) →
 *     `usePlatformCrmFollowup` (réguas = cadências platform_crm, métricas
 *     client-side);
 *   - lista de agentes: `profiles`+`product_agents` (org do tenant) →
 *     `platform_crm_agent_configs` via `usePlatformCrmAgentConfigs`;
 *   - `onOpenConversation` mantido na assinatura por paridade com as seções
 *     irmãs (Panel/Radar) — esta tela não tem drill-down de conversa.
 */

type RangeKey = 'today' | '7d' | '30d';

function getRange(key: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (key === 'today') from.setHours(0, 0, 0, 0);
  else if (key === '7d') from.setDate(from.getDate() - 7);
  else from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function PlatformCrmInboxFollowup({
  onOpenConversation,
}: { onOpenConversation?: (id: string) => void } = {}) {
  void onOpenConversation; // paridade de assinatura; sem drill-down de conversa nesta seção
  const [range, setRange] = useState<RangeKey>('7d');
  const [agentId, setAgentId] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PlatformFollowupStatusKey | 'all'>('all');

  const { from, to } = useMemo(() => getRange(range), [range]);
  const filters: PlatformFollowupFilters = {
    from, to,
    agentId: agentId === 'all' ? null : agentId,
    status: statusFilter,
  };

  usePlatformCrmFollowupRealtime();

  const stats = usePlatformCrmFollowupStats(filters);
  const leads = usePlatformCrmFollowupActiveLeads(filters);
  const agentsQ = usePlatformCrmAgentConfigs();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o desempenho dos follow-ups automáticos em tempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os agentes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {(agentsQ.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <FollowupKpiCards stats={stats.data} loading={stats.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FollowupRecoveryByAttempt data={stats.data?.recovery_by_attempt ?? []} />
        <FollowupSentTrend data={stats.data?.sent_trend_7d ?? []} />
        <FollowupActiveStatusDonut data={stats.data?.active_status_breakdown} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FollowupActiveLeadsTable
            rows={leads.data ?? []}
            loading={leads.isLoading}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </div>
        <FollowupUpcomingWidget
          data={stats.data?.upcoming_buckets}
          onBucketClick={() => setStatusFilter('waiting_next')}
        />
      </div>
    </div>
  );
}
