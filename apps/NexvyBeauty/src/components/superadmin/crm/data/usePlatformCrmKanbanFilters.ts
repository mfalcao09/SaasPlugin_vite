import { useState, useMemo } from 'react';
import type {
  PlatformCrmLeadSortBy,
  PlatformCrmLeadSortDirection,
} from './usePlatformCrmLeads';

/**
 * Estado dos filtros do board do CRM de PLATAFORMA (super_admin). Espelha 1:1 o
 * `useKanbanFilters` do CRM original. No contexto plataforma, `sellerId` é o rep de
 * venda (assigned_to) da plataforma — NÃO usuário de tenant.
 */

export interface PlatformCrmKanbanFilters {
  search: string;
  sellerId: string;
  minValue: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  sortBy: PlatformCrmLeadSortBy;
  sortDirection: PlatformCrmLeadSortDirection;
}

const defaultFilters: PlatformCrmKanbanFilters = {
  search: '',
  sellerId: '',
  minValue: null,
  dateFrom: null,
  dateTo: null,
  sortBy: 'created_at',
  sortDirection: 'desc',
};

export function usePlatformCrmKanbanFilters() {
  const [filters, setFilters] = useState<PlatformCrmKanbanFilters>(defaultFilters);

  const updateFilter = <K extends keyof PlatformCrmKanbanFilters>(
    key: K,
    value: PlatformCrmKanbanFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(defaultFilters);

  const hasActiveFilters = useMemo(
    () =>
      filters.search !== '' ||
      filters.sellerId !== '' ||
      filters.minValue !== null ||
      filters.dateFrom !== null ||
      filters.dateTo !== null,
    [filters],
  );

  return { filters, updateFilter, clearFilters, hasActiveFilters };
}
