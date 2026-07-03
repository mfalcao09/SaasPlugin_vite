import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { Plus, Upload, Download, Target, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { leadsToCsv, downloadCsv, type ExportableLead } from '@/lib/leadsExport';

import { usePlatformCrmLeadsManager } from '../data/usePlatformCrmLeadsManager';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import { usePlatformCrmSquads } from '../data/usePlatformCrmSquads';
import { usePlatformCrmSellers } from '../data/usePlatformCrmSellers';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';

import { PlatformCrmLeadsKPICards } from './PlatformCrmLeadsKPICards';
import { PlatformCrmLeadsTabs } from './PlatformCrmLeadsTabs';
import { PlatformCrmLeadsFilters } from './PlatformCrmLeadsFilters';
import { PlatformCrmLeadsTable } from './PlatformCrmLeadsTable';
import { PlatformCrmBulkActionsBar } from './PlatformCrmBulkActionsBar';
import { PlatformCrmBulkTransferDialog } from './PlatformCrmBulkTransferDialog';
import { PlatformCrmImportLeadsDialog } from './PlatformCrmImportLeadsDialog';
import {
  CreatePlatformCrmLeadDialog,
  type CreatePlatformCrmLeadValues,
} from './CreatePlatformCrmLeadDialog';
import { PlatformCrmLeadDetail } from './PlatformCrmLeadDetail';

/**
 * GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin) — pipeline ÚNICO, desacoplado do
 * tenant. Porte 1:1 do LeadsManager: KPIs + abas (Todos/Minha Carteira/Meu Squad/Sem
 * Atendimento) + filtros avançados + tabela (seleção/ordenação/paginação) + ações em
 * massa (transferir/exportar/etiquetar/excluir) + import/export CSV + criação + detalhe.
 * Usa EXCLUSIVAMENTE hooks `platform_crm_*` + componentes @/components/ui. Zero
 * organization/product/squad de tenant nem cockpit do salão.
 */
export function PlatformCrmLeadsManager() {
  const {
    leads,
    total,
    totalPages,
    stats,
    isLoading,
    page,
    setPage,
    filters,
    updateFilter,
    clearFilters,
    sort,
    updateSort,
    selectedLeads,
    toggleSelectLead,
    toggleSelectAll,
    clearSelection,
    activeTab,
    setActiveTab,
    createLead,
    bulkTransfer,
    bulkDelete,
  } = usePlatformCrmLeadsManager();

  const { data: stages = [] } = usePlatformCrmStages();
  const { data: squads = [] } = usePlatformCrmSquads();
  const { data: sellers = [] } = usePlatformCrmSellers();
  // Catálogo do CRM da plataforma (dimensão D3) — alimenta o filtro "Produto".
  const { data: products = [] } = usePlatformCrmProducts();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [leadsToDelete, setLeadsToDelete] = useState<string[]>([]);

  const handleViewLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setLeadDetailOpen(true);
  };

  const handleTransferLead = (leadId: string) => {
    toggleSelectLead(leadId);
    setTransferDialogOpen(true);
  };

  const handleDeleteLead = (leadId: string) => {
    setLeadsToDelete([leadId]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    setLeadsToDelete(selectedLeads);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    await bulkDelete.mutateAsync(leadsToDelete);
    setDeleteDialogOpen(false);
    setLeadsToDelete([]);
  };

  const handleCreateLead = async (values: CreatePlatformCrmLeadValues) => {
    await createLead.mutateAsync(values);
    setCreateDialogOpen(false);
  };

  const handleBulkTransfer = async (data: {
    assignedTo: string | null;
    squadId: string | null;
    reason?: string;
  }) => {
    await bulkTransfer.mutateAsync({
      leadIds: selectedLeads,
      assignedTo: data.assignedTo === 'unassigned' ? null : data.assignedTo,
      squadId: data.squadId === 'unassigned' ? null : data.squadId,
      reason: data.reason,
    });
    setTransferDialogOpen(false);
  };

  // Export CSV client-side (pipeline único — sem organization_id; RLS super_admin isola).
  const handleExport = async (onlySelected = false) => {
    setExporting(true);
    try {
      const targetIds = onlySelected ? selectedLeads : null;
      const BATCH = 1000;
      const all: unknown[] = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from('platform_crm_leads')
          .select(
            '*, pipeline_stages:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey(name)',
          )
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH - 1);
        if (targetIds && targetIds.length > 0) q = q.in('id', targetIds);
        const { data, error } = await q;
        if (error) throw error;
        const chunk = data ?? [];
        all.push(...chunk);
        if (chunk.length < BATCH) break;
        offset += BATCH;
      }
      const exportLeads = all as unknown as ExportableLead[];

      // Mapa de vendedores (assigned_to) para nome legível.
      const teamMap: Record<string, string> = {};
      sellers.forEach((s) => {
        teamMap[s.id] = s.full_name;
      });
      const squadMap: Record<string, string> = {};
      squads.forEach((s) => {
        squadMap[s.id] = s.name;
      });

      // Etiquetas por lead.
      const tagsByLead: Record<string, string[]> = {};
      const ids = exportLeads.map((l) => l.id);
      if (ids.length > 0) {
        const { data: tagData } = await supabase
          .from('platform_crm_lead_tag_assignments')
          .select('lead_id, platform_crm_lead_tags(name)')
          .in('lead_id', ids);
        (tagData ?? []).forEach(
          (t: { lead_id: string; platform_crm_lead_tags?: { name?: string } | null }) => {
            const name = t.platform_crm_lead_tags?.name;
            if (!name) return;
            (tagsByLead[t.lead_id] ||= []).push(name);
          },
        );
      }

      const csv = leadsToCsv(exportLeads, { teamMap, squadMap, productMap: {}, tagsByLead });
      downloadCsv(`platform-crm-leads-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`, csv);
      toast.success(`${exportLeads.length} leads exportados`);
    } catch (e) {
      toast.error('Erro ao exportar: ' + ((e as { message?: string })?.message ?? ''));
    } finally {
      setExporting(false);
    }
  };

  // Paginação — mesma lógica do LeadsManager original.
  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
        </PaginationItem>,
      );
      if (start > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
    }

    for (let i = start; i <= end; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink onClick={() => setPage(i)} isActive={page === i}>
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setPage(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>,
      );
    }

    return items;
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport(false)}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Importar
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <PlatformCrmLeadsKPICards
        stats={
          stats
            ? {
                total: stats.total,
                hot: stats.hot,
                warm: stats.warm,
                cold: stats.cold,
                pipelineValue: 0,
              }
            : undefined
        }
        isLoading={isLoading}
      />

      {/* Abas */}
      <PlatformCrmLeadsTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats ? { total: stats.total, unassigned: stats.unassigned } : null}
      />

      {/* Filtros */}
      <PlatformCrmLeadsFilters
        filters={filters}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        squads={squads.map((s) => ({ id: s.id, name: s.name }))}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        stages={stages}
      />

      {/* Tabela */}
      <PlatformCrmLeadsTable
        leads={leads}
        selectedLeads={selectedLeads}
        onToggleSelect={toggleSelectLead}
        onToggleSelectAll={toggleSelectAll}
        onViewLead={handleViewLead}
        onTransferLead={handleTransferLead}
        onDeleteLead={handleDeleteLead}
        sort={sort}
        onSort={updateSort}
        isLoading={isLoading}
      />

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} de {total} leads
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {renderPaginationItems()}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  className={
                    page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Barra de ações em massa */}
      <PlatformCrmBulkActionsBar
        selectedCount={selectedLeads.length}
        selectedLeadIds={selectedLeads}
        onTransfer={() => setTransferDialogOpen(true)}
        onExport={() => handleExport(true)}
        onDelete={handleBulkDelete}
        onClearSelection={clearSelection}
      />

      {/* Criar lead */}
      <CreatePlatformCrmLeadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateLead}
        isLoading={createLead.isPending}
        stages={stages}
        sellers={sellers.map((s) => ({ id: s.id, full_name: s.full_name }))}
        squads={squads.map((s) => ({ id: s.id, name: s.name }))}
      />

      {/* Transferência em massa */}
      <PlatformCrmBulkTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        selectedCount={selectedLeads.length}
        onTransfer={handleBulkTransfer}
        isLoading={bulkTransfer.isPending}
        sellers={sellers.map((s) => ({ id: s.id, full_name: s.full_name }))}
        squads={squads.map((s) => ({ id: s.id, name: s.name }))}
      />

      {/* Importar CSV */}
      <PlatformCrmImportLeadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        squads={squads.map((s) => ({ id: s.id, name: s.name }))}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir leads</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {leadsToDelete.length} lead
              {leadsToDelete.length > 1 ? 's' : ''}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalhe do lead */}
      <Dialog open={leadDetailOpen} onOpenChange={setLeadDetailOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
          <VisuallyHidden>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </VisuallyHidden>
          {selectedLeadId && (
            <PlatformCrmLeadDetail leadId={selectedLeadId} onBack={() => setLeadDetailOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
