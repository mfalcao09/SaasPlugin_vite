import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Flame,
  Thermometer,
  Snowflake,
  Phone,
  Mail,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Eye,
  ArrowRightLeft,
  Trash2,
  MessageSquare,
  Globe,
  UserCircle,
  Building2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
// Identidade nome→telefone (U3): IMPORTAR sempre do exemplar calibrado — PROIBIDO reimplementar.
import {
  resolveVisitorIdentity,
  visitorInitials,
} from '@/components/superadmin/crm/inbox/platformCrmIdentity';
import type { PlatformCrmLead, PlatformCrmLeadSort } from '../data/usePlatformCrmLeadsManager';

/**
 * Tabela da GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin) — família F5 (Tabela de
 * gestão) do TEMPLATE-UI-GESTAO. FORMA calibrada: identidade §3.3 (nome→telefone via
 * platformCrmIdentity), colunas identidade/contato/origem/estágio/valor/carteira/data,
 * `th` §1.5 (text-[11px] uppercase), temperatura como badge semântico §1.3 no avatar,
 * ações por linha em DropdownMenu (MoreVertical). NÃO altera contratos de dados nem
 * lógica de negócio — só forma. Zero campo de salão/organization.
 */
interface PlatformCrmLeadsTableProps {
  leads: PlatformCrmLead[];
  selectedLeads: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onViewLead: (id: string) => void;
  onTransferLead: (id: string) => void;
  onDeleteLead: (id: string) => void;
  sort: PlatformCrmLeadSort;
  onSort: (column: string) => void;
  isLoading?: boolean;
  /** Ação do empty state — abre o dialog de criação (affordance §3.1). Opcional. */
  onCreateLead?: () => void;
  /** true quando há busca/filtros ativos: muda a copy do vazio para "ajuste os filtros". */
  hasActiveFilters?: boolean;
}

// Temperatura — literais SÓ da tabela §1.3 (semântica de domínio, não marca).
const temperatureMeta = {
  hot: { icon: Flame, label: 'Quente', badge: 'bg-red-500/10 text-red-600 border-red-500/30' },
  warm: {
    icon: Thermometer,
    label: 'Morno',
    badge: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  },
  cold: {
    icon: Snowflake,
    label: 'Frio',
    badge: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  },
} as const;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function SortableHeader({
  column,
  label,
  currentSort,
  onSort,
}: {
  column: string;
  label: string;
  currentSort: PlatformCrmLeadSort;
  onSort: (column: string) => void;
}) {
  const isActive = currentSort.column === column;
  const Arrow = !isActive ? ChevronsUpDown : currentSort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors',
        isActive && 'text-foreground',
      )}
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      <Arrow className={cn('h-3 w-3', isActive ? 'text-primary' : 'opacity-50')} />
    </button>
  );
}

export function PlatformCrmLeadsTable({
  leads,
  selectedLeads,
  onToggleSelect,
  onToggleSelectAll,
  onViewLead,
  onTransferLead,
  onDeleteLead,
  sort,
  onSort,
  isLoading,
  onCreateLead,
  hasActiveFilters,
}: PlatformCrmLeadsTableProps) {
  const allSelected = leads.length > 0 && selectedLeads.length === leads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < leads.length;

  // Skeleton anatômico §3.1 — reproduz avatar + 2 linhas por registro (não spinner central).
  if (isLoading) {
    return (
      <div className="rounded-lg border overflow-hidden">
        <div className="animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-3 py-3 border-b border-border/30 last:border-b-0"
            >
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted rounded w-1/4" />
                <div className="h-2.5 bg-muted rounded w-1/3" />
              </div>
              <div className="hidden md:block h-3.5 bg-muted rounded w-28" />
              <div className="hidden lg:block h-5 bg-muted rounded-full w-16" />
              <div className="h-3.5 bg-muted rounded w-20" />
              <div className="h-8 w-8 bg-muted rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Estado vazio §3.1 — ícone + título + dica contextual à busca/filtro + CTA acionável.
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <UserCircle className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">
          {hasActiveFilters ? 'Nenhum lead para estes filtros' : 'Nenhum lead ainda'}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {hasActiveFilters
            ? 'Ajuste a busca ou os filtros ativos para ampliar o resultado.'
            : 'Crie o primeiro lead ou importe uma base para começar a operar o pipeline.'}
        </p>
        {onCreateLead && !hasActiveFilters && (
          <Button size="sm" onClick={onCreateLead}>
            Novo lead
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
            <TableHead className="w-10">
              <Checkbox
                aria-label="Selecionar todos os leads"
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate =
                      someSelected;
                  }
                }}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead className="min-w-[200px] text-[11px] text-muted-foreground">
              <SortableHeader column="name" label="Lead" currentSort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className="hidden md:table-cell min-w-[150px] text-[11px] uppercase tracking-wide text-muted-foreground">
              Contato
            </TableHead>
            <TableHead className="hidden lg:table-cell min-w-[120px] text-[11px] text-muted-foreground">
              <SortableHeader
                column="lead_origin"
                label="Origem"
                currentSort={sort}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="min-w-[110px] text-[11px] uppercase tracking-wide text-muted-foreground">
              Estágio
            </TableHead>
            <TableHead className="hidden xl:table-cell min-w-[100px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
              Valor
            </TableHead>
            <TableHead className="hidden lg:table-cell min-w-[110px] text-[11px] uppercase tracking-wide text-muted-foreground">
              Carteira
            </TableHead>
            <TableHead className="hidden sm:table-cell min-w-[90px] text-[11px] text-muted-foreground">
              <SortableHeader
                column="created_at"
                label="Criado"
                currentSort={sort}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const isSelected = selectedLeads.includes(lead.id);
            const temp = (lead.temperature || 'cold') as keyof typeof temperatureMeta;
            const tMeta = temperatureMeta[temp] ?? temperatureMeta.cold;
            const TempIcon = tMeta.icon;

            // Identidade §3.3 — nome útil vira primary; nome inútil ("~"/1-2 chars) → telefone.
            const identity = resolveVisitorIdentity(lead.name, lead.phone);
            const initials = visitorInitials(lead.name, lead.phone);
            const dealValue = typeof lead.deal_value === 'number' ? lead.deal_value : 0;

            return (
              <TableRow
                key={lead.id}
                className={cn(
                  'group cursor-pointer border-b border-border/30 transition-colors',
                  isSelected && 'bg-primary/5',
                )}
                onClick={() => onViewLead(lead.id)}
              >
                <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Selecionar ${identity.primary}`}
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(lead.id)}
                  />
                </TableCell>

                {/* Lead — avatar + identidade (primary/secondary §3.3) + micro-metadados */}
                <TableCell className="py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted text-[11px] font-medium text-muted-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {/* Temperatura no canto do avatar — badge semântico §1.3 */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center',
                              tMeta.badge,
                            )}
                          >
                            <TempIcon className="h-2.5 w-2.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{tMeta.label}</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="min-w-0">
                      <div
                        className="text-[14px] font-semibold leading-tight truncate text-foreground"
                        title={identity.primary}
                      >
                        {identity.primary}
                      </div>
                      {identity.secondary ? (
                        <div
                          className="text-[11px] text-muted-foreground truncate"
                          title={identity.secondary}
                        >
                          {identity.secondary}
                        </div>
                      ) : (
                        (lead.company || lead.position) && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                            {lead.position && <span className="truncate">{lead.position}</span>}
                            {lead.position && lead.company && <span>·</span>}
                            {lead.company && (
                              <span className="flex items-center gap-0.5 truncate">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {lead.company}
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Contato */}
                <TableCell
                  className="hidden md:table-cell py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-0.5">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate tabular-nums">{lead.phone}</span>
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[150px]" title={lead.email}>
                          {lead.email}
                        </span>
                      </a>
                    )}
                    {!lead.phone && !lead.email && (
                      <span className="text-[13px] text-muted-foreground/60">—</span>
                    )}
                  </div>
                </TableCell>

                {/* Origem (+ utm_campaign) */}
                <TableCell className="hidden lg:table-cell py-2.5">
                  <div className="space-y-1">
                    {lead.lead_origin ? (
                      <div className="flex items-center gap-1.5 text-[13px]">
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="capitalize truncate">{lead.lead_origin}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted-foreground/60">—</span>
                    )}
                    {lead.utm_campaign && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal max-w-[140px] truncate"
                        title={lead.utm_campaign}
                      >
                        {lead.utm_campaign}
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Estágio — dot com a cor do banco (único literal permitido, é dado) */}
                <TableCell className="py-2.5">
                  {lead.stage ? (
                    <Badge variant="outline" className="gap-1.5 font-normal text-xs max-w-[130px]">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: lead.stage.color || undefined }}
                      />
                      <span className="truncate">{lead.stage.name}</span>
                    </Badge>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60">—</span>
                  )}
                </TableCell>

                {/* Valor (deal_value) */}
                <TableCell className="hidden xl:table-cell py-2.5 text-right">
                  {dealValue > 0 ? (
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(dealValue)}
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60">—</span>
                  )}
                </TableCell>

                {/* Carteira */}
                <TableCell className="hidden lg:table-cell py-2.5">
                  {lead.assigned_to ? (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Atribuído
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[11px] font-normal text-muted-foreground"
                    >
                      Sem carteira
                    </Badge>
                  )}
                </TableCell>

                {/* Criado */}
                <TableCell className="hidden sm:table-cell py-2.5">
                  <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDistanceToNow(new Date(lead.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </TableCell>

                {/* Ações — DropdownMenu no MoreVertical (nunca fileira de ícones soltos) */}
                <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Ações para ${identity.primary}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Ações</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewLead(lead.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalhes
                      </DropdownMenuItem>
                      {lead.phone && (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            WhatsApp
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onTransferLead(lead.id)}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transferir
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteLead(lead.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
