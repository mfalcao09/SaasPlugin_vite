import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Target, Loader2 } from 'lucide-react';
import {
  usePlatformCrmLeads,
  useCreatePlatformCrmLead,
  useDeletePlatformCrmLead,
} from '../data/usePlatformCrmLeads';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import {
  PlatformCrmLeadsKPICards,
  type PlatformCrmLeadsStats,
} from './PlatformCrmLeadsKPICards';
import {
  PlatformCrmLeadsFilters,
  type PlatformCrmLeadsFilterState,
} from './PlatformCrmLeadsFilters';
import { PlatformCrmLeadsTable } from './PlatformCrmLeadsTable';
import {
  CreatePlatformCrmLeadDialog,
  type CreatePlatformCrmLeadValues,
} from './CreatePlatformCrmLeadDialog';

/**
 * GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin) — pipeline ÚNICO, desacoplado
 * do tenant. Usa EXCLUSIVAMENTE os hooks `platform_crm_*` + componentes @/components/ui.
 * Nenhum acoplamento com organization/product/squad do tenant nem cockpit do salão.
 *
 * Composição: KPIs (total, por temperatura, valor em pipeline) + filtros (busca +
 * estágio) + tabela + criação de lead.
 */
export function PlatformCrmLeadsManager() {
  const [filters, setFilters] = useState<PlatformCrmLeadsFilterState>({
    search: '',
    stageId: null,
  });

  const { data: leads = [], isLoading } = usePlatformCrmLeads({
    search: filters.search,
    stageId: filters.stageId ?? undefined,
  });
  const { data: stages = [] } = usePlatformCrmStages();

  const createLead = useCreatePlatformCrmLead();
  const deleteLead = useDeletePlatformCrmLead();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  // Stats derivados client-side (o hook não faz agregação server-side).
  const stats: PlatformCrmLeadsStats = useMemo(() => {
    return leads.reduce<PlatformCrmLeadsStats>(
      (acc, lead) => {
        acc.total += 1;
        if (lead.temperature === 'hot') acc.hot += 1;
        else if (lead.temperature === 'warm') acc.warm += 1;
        else if (lead.temperature === 'cold') acc.cold += 1;
        acc.pipelineValue += lead.deal_value ?? 0;
        return acc;
      },
      { total: 0, hot: 0, warm: 0, cold: 0, pipelineValue: 0 },
    );
  }, [leads]);

  const updateFilter = <K extends keyof PlatformCrmLeadsFilterState>(
    key: K,
    value: PlatformCrmLeadsFilterState[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters({ search: '', stageId: null });

  const handleCreateLead = async (values: CreatePlatformCrmLeadValues) => {
    await createLead.mutateAsync(values);
    setCreateDialogOpen(false);
  };

  const handleViewLead = (_leadId: string) => {
    // Detalhe/edição de lead ainda não portado para o CRM de plataforma.
    // Placeholder intencional: no-op até a tela de detalhe existir.
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    await deleteLead.mutateAsync(leadToDelete);
    setLeadToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" />
            Gestão de Leads
          </h1>
          <p className="text-muted-foreground mt-1">
            Pipeline único da plataforma. Gerencie todos os leads do CRM.
          </p>
        </div>

        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Lead
        </Button>
      </div>

      {/* KPIs */}
      <PlatformCrmLeadsKPICards stats={stats} isLoading={isLoading} />

      {/* Filtros */}
      <PlatformCrmLeadsFilters
        filters={filters}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        stages={stages}
      />

      {/* Tabela */}
      <PlatformCrmLeadsTable
        leads={leads}
        onViewLead={handleViewLead}
        onDeleteLead={(id) => setLeadToDelete(id)}
        isLoading={isLoading}
      />

      {/* Criar lead */}
      <CreatePlatformCrmLeadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateLead}
        isLoading={createLead.isPending}
        stages={stages}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={leadToDelete !== null}
        onOpenChange={(o) => !o && setLeadToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLead.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
