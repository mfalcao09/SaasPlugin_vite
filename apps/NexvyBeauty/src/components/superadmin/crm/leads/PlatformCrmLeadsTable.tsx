import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  MoreHorizontal,
  Eye,
  Trash2,
  MessageSquare,
  UserCircle,
  Calendar,
  Building,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { PlatformCrmLeadWithStage } from '../data/usePlatformCrmLeads';

/**
 * Tabela do CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado do tenant.
 * Lista `platform_crm_leads` com stage embutido. Colunas: nome, empresa, contato,
 * estágio (join), temperatura, valor (deal_value), criado_em. Zero campo de salão.
 */
interface PlatformCrmLeadsTableProps {
  leads: PlatformCrmLeadWithStage[];
  onViewLead: (id: string) => void;
  onDeleteLead: (id: string) => void;
  isLoading?: boolean;
}

const temperatureIcons = {
  hot: { icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Quente' },
  warm: { icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Morno' },
  cold: { icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Frio' },
} as const;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PlatformCrmLeadsTable({
  leads,
  onViewLead,
  onDeleteLead,
  isLoading,
}: PlatformCrmLeadsTableProps) {
  if (isLoading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
              <div className="h-10 w-10 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
              <div className="h-4 bg-muted rounded w-24" />
              <div className="h-4 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">Nenhum lead encontrado</h3>
        <p className="text-sm text-muted-foreground">
          Tente ajustar os filtros ou adicione um novo lead
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="min-w-[200px]">Lead</TableHead>
            <TableHead className="min-w-[150px]">Contato</TableHead>
            <TableHead className="min-w-[140px]">Estágio</TableHead>
            <TableHead className="min-w-[110px]">Temperatura</TableHead>
            <TableHead className="min-w-[120px]">Valor</TableHead>
            <TableHead className="min-w-[120px]">Criado</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const temp = (lead.temperature ?? 'cold') as keyof typeof temperatureIcons;
            const tempCfg = temperatureIcons[temp] ?? temperatureIcons.cold;
            const TempIcon = tempCfg.icon;

            return (
              <TableRow
                key={lead.id}
                className="cursor-pointer transition-colors"
                onClick={() => onViewLead(lead.id)}
              >
                {/* Lead + empresa */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn('p-1.5 rounded-full', tempCfg.bg)}>
                      <TempIcon className={cn('h-4 w-4', tempCfg.color)} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{lead.name}</div>
                      {lead.company && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building className="h-3 w-3" />
                          <span className="truncate">{lead.company}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Contato: email/telefone */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{lead.phone}</span>
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Mail className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{lead.email}</span>
                      </a>
                    )}
                    {!lead.phone && !lead.email && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>

                {/* Estágio (join) */}
                <TableCell>
                  {lead.stage ? (
                    <Badge
                      style={{ backgroundColor: lead.stage.color || undefined }}
                      className="text-white text-xs"
                    >
                      {lead.stage.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sem estágio
                    </Badge>
                  )}
                </TableCell>

                {/* Temperatura */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <TempIcon className={cn('h-3.5 w-3.5', tempCfg.color)} />
                    <span>{tempCfg.label}</span>
                  </div>
                </TableCell>

                {/* Valor (deal_value) */}
                <TableCell>
                  <span className="font-medium text-sm">
                    {lead.deal_value ? brl(lead.deal_value) : '—'}
                  </span>
                </TableCell>

                {/* Criado em */}
                <TableCell>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDistanceToNow(new Date(lead.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </div>
                </TableCell>

                {/* Ações */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
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
