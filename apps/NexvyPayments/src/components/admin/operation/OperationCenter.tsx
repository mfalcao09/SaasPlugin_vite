import { useSearchParams } from 'react-router-dom';
import {
  useOperationKpis,
  useOperationPriorities,
  useTodayAgenda,
  useRecentLeads,
} from '@/hooks/useOperationCenter';
import { OperationKpiCards } from './OperationKpiCards';
import { PrioritiesCard } from './PrioritiesCard';
import { TodayAgendaCard } from './TodayAgendaCard';
import { RecentLeadsTable } from './RecentLeadsTable';
import { AiInsightsCard } from './AiInsightsCard';

// `onNavigate` opcional: quando fornecido (ex.: reuso no cockpit/Painel), a navegação
// é delegada ao chamador (mapeia seção → rota do cockpit). Sem ele, mantém o
// comportamento original do admin (troca a ?tab= na URL).
export function OperationCenter({ onNavigate }: { onNavigate?: (section: string) => void } = {}) {
  const [, setSearchParams] = useSearchParams();
  const { data: kpis } = useOperationKpis();
  const { data: priorities } = useOperationPriorities();
  const { data: agenda } = useTodayAgenda();
  const { data: recentLeads } = useRecentLeads();

  const handleNavigate = (section: string) => {
    if (onNavigate) { onNavigate(section); return; }
    setSearchParams({ tab: section }, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central de Operação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Leads, atendimentos e ações importantes em tempo real.
        </p>
      </div>

      <OperationKpiCards kpis={kpis} onNavigate={handleNavigate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PrioritiesCard data={priorities} onNavigate={handleNavigate} />
        <TodayAgendaCard items={agenda} onNavigate={handleNavigate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentLeadsTable leads={recentLeads} onNavigate={handleNavigate} />
        </div>
        <AiInsightsCard kpis={kpis} priorities={priorities} />
      </div>
    </div>
  );
}
