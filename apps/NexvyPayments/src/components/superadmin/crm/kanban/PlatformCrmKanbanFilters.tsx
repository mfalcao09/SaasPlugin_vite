import { Filter, X, ArrowUpDown, Calendar, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { PlatformCrmKanbanFilters as PlatformCrmKanbanFiltersType } from '../data/usePlatformCrmKanbanFilters';
import type { PlatformCrmSeller } from '../data/usePlatformCrmSellers';

// Anatomia de chip do REF Lovable: h-10 px-3.5 rounded-lg border hairline.
// Aplicada a cada controle (Popover/Select trigger) via classe compartilhada.
const CHIP =
  'h-10 px-3.5 rounded-lg border hairline bg-card text-[13px] font-medium ' +
  'inline-flex items-center gap-2 whitespace-nowrap transition-colors ' +
  'hover:border-[color:var(--hairline-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface PlatformCrmKanbanFiltersProps {
  filters: PlatformCrmKanbanFiltersType;
  onFilterChange: <K extends keyof PlatformCrmKanbanFiltersType>(
    key: K,
    value: PlatformCrmKanbanFiltersType[K],
  ) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  /**
   * Vendedores = reps de venda da PLATAFORMA (squad_members / assigned_to),
   * resolvidos via `usePlatformCrmSellers`. NÃO usuários de tenant.
   */
  sellers: PlatformCrmSeller[];
}

export function PlatformCrmKanbanFilters({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  sellers,
}: PlatformCrmKanbanFiltersProps) {
  const sortByLabel: Record<PlatformCrmKanbanFiltersType['sortBy'], string> = {
    created_at: 'Data Criação',
    deal_value: 'Valor',
    last_contact_at: 'Último Contato',
  };
  const sellerLabel =
    sellers.find((s) => s.id === filters.sellerId)?.full_name ?? 'Todos';

  return (
    // UMA surface-card p-3 (REF): busca inline (Filter) + chips "Label: Valor" + ação primária à direita.
    <div className="surface-card p-3 flex flex-wrap items-center gap-2.5">
      {/* Busca inline com ícone Filter (REF) */}
      <div className="relative flex-1 min-w-[200px]">
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead, empresa, email..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          className="pl-9 h-10 border hairline bg-card"
        />
      </div>

      {/* Chip "Data início: valor" */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={CHIP}>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Início:</span>
            <span>{filters.dateFrom ? format(filters.dateFrom, 'dd/MM/yyyy') : 'Qualquer'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={filters.dateFrom || undefined}
            onSelect={(date) => onFilterChange('dateFrom', date || null)}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Chip "Data fim: valor" */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={CHIP}>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Fim:</span>
            <span>{filters.dateTo ? format(filters.dateTo, 'dd/MM/yyyy') : 'Qualquer'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={filters.dateTo || undefined}
            onSelect={(date) => onFilterChange('dateTo', date || null)}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Chip "Valor mín: R$ …" (input inline no estilo chip) */}
      <div className={cn(CHIP, 'pr-2')}>
        <span className="text-muted-foreground">Valor mín:</span>
        <span className="text-muted-foreground">R$</span>
        <input
          type="number"
          placeholder="0"
          aria-label="Valor mínimo do lead em reais"
          value={filters.minValue ?? ''}
          onChange={(e) =>
            onFilterChange('minValue', e.target.value ? Number(e.target.value) : null)
          }
          className="w-16 bg-transparent border-0 p-0 text-[13px] font-medium tabular-nums focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Chip "Ordenar: valor" (Select estilizado como chip) */}
      <Select
        value={filters.sortBy}
        onValueChange={(v) =>
          onFilterChange('sortBy', v as PlatformCrmKanbanFiltersType['sortBy'])
        }
      >
        {/* [&>svg:last-child]:hidden esconde SÓ o chevron nativo do Radix (último
            filho do trigger), preservando o ChevronDown custom → consistente c/ os chips de data. */}
        <SelectTrigger className={cn(CHIP, 'w-auto [&>svg:last-child]:hidden')}>
          <span className="text-muted-foreground">Ordenar:</span>
          <SelectValue>{sortByLabel[filters.sortBy]}</SelectValue>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_at">Data Criação</SelectItem>
          <SelectItem value="deal_value">Valor</SelectItem>
          <SelectItem value="last_contact_at">Último Contato</SelectItem>
        </SelectContent>
      </Select>

      {/* Chip "Vendedor: valor" (Select estilizado como chip) */}
      <Select
        value={filters.sellerId || 'all'}
        onValueChange={(v) => onFilterChange('sellerId', v === 'all' ? '' : v)}
      >
        <SelectTrigger className={cn(CHIP, 'w-auto max-w-[220px] [&>svg:last-child]:hidden')}>
          <span className="text-muted-foreground">Vendedor:</span>
          <SelectValue className="truncate">{sellerLabel}</SelectValue>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos vendedores</SelectItem>
          {sellers.map((seller) => (
            <SelectItem key={seller.id} value={seller.id}>
              {seller.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Limpar (fantasma) — só quando há filtros ativos */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-10 text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}

      {/* Ação primária à direita (REF): brand-gradient + brand-glow + hover -translate-y-0.5.
         Ação real existente = alternar direção da ordenação (asc/desc). */}
      <button
        type="button"
        onClick={() =>
          onFilterChange('sortDirection', filters.sortDirection === 'asc' ? 'desc' : 'asc')
        }
        title={filters.sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
        className="ml-auto h-10 px-4 rounded-lg brand-gradient brand-glow text-white text-[13px] font-semibold inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <ArrowUpDown
          className={cn(
            'h-4 w-4 transition-transform',
            filters.sortDirection === 'asc' && 'rotate-180',
          )}
        />
        {filters.sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
      </button>
    </div>
  );
}
