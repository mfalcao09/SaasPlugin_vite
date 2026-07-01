import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import type { PlatformCrmStage } from '../data/usePlatformCrmStages';

/**
 * Filtros do CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado do tenant.
 * Só o que a camada de dados (`usePlatformCrmLeads`) suporta: busca livre + estágio.
 * Zero squad/produto/tenant.
 */
export interface PlatformCrmLeadsFilterState {
  search: string;
  stageId: string | null;
}

interface PlatformCrmLeadsFiltersProps {
  filters: PlatformCrmLeadsFilterState;
  onFilterChange: <K extends keyof PlatformCrmLeadsFilterState>(
    key: K,
    value: PlatformCrmLeadsFilterState[K],
  ) => void;
  onClearFilters: () => void;
  stages: PlatformCrmStage[];
}

const ALL = '__all__';

export function PlatformCrmLeadsFilters({
  filters,
  onFilterChange,
  onClearFilters,
  stages,
}: PlatformCrmLeadsFiltersProps) {
  const activeStage = stages.find((s) => s.id === filters.stageId);
  const hasActiveFilters = Boolean(filters.stageId);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa ou email..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filters.stageId ?? ALL}
          onValueChange={(v) => onFilterChange('stageId', v === ALL ? null : v)}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Todos os estágios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os estágios</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {activeStage && (
            <Badge variant="secondary" className="gap-1">
              Estágio: {activeStage.name}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFilterChange('stageId', null)}
              />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        </div>
      )}
    </div>
  );
}
