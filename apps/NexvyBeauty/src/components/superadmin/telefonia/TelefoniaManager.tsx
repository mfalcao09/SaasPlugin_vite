import { useMemo, useState } from 'react';
import {
  Phone,
  Search,
  Plus,
  RefreshCw,
  Eye,
  MessageSquareText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  useSalvyNumbers,
  useSalvyAreaCodes,
  useCreateSalvyNumber,
  formatSalvyPhone,
  type SalvyNumber,
  type SalvyNumberStatus,
} from '@/hooks/useTelefonia';

// Custo mensal por linha (Salvy não expõe pricing via API — valor do contrato).
export const SALVY_MONTHLY_COST_LABEL = 'R$ 29,90/mês';

const STATUS_LABEL: Record<SalvyNumberStatus, string> = {
  active: 'Ativa',
  pending: 'Pendente',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
};

export function SalvyStatusBadge({ status }: { status: SalvyNumberStatus }) {
  const classes: Record<SalvyNumberStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    blocked: 'bg-red-500/15 text-red-600 border-red-500/30',
    canceled: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={classes[status] ?? classes.canceled}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

interface TelefoniaManagerProps {
  onViewNumber: (id: string) => void;
}

export function TelefoniaManager({ onViewNumber }: TelefoniaManagerProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRequesting, setIsRequesting] = useState(false);
  const [newLine, setNewLine] = useState({ areaCode: '', name: '', costCenter: '' });

  const { data: numbers, isLoading, isFetching, refetch, error } = useSalvyNumbers();
  const { data: areaCodes, isLoading: loadingDdd } = useSalvyAreaCodes(isRequesting);
  const createNumber = useCreateSalvyNumber();

  const filtered = useMemo(() => {
    return (numbers ?? []).filter((n: SalvyNumber) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (n.name ?? '').toLowerCase().includes(q) ||
        n.phoneNumber.includes(q.replace(/\D/g, '') || q) ||
        (n.costCenter ?? '').toLowerCase().includes(q)
      );
    });
  }, [numbers, search, statusFilter]);

  const activeCount = (numbers ?? []).filter((n) => n.status === 'active').length;

  const handleCreate = async () => {
    const ddd = Number(newLine.areaCode);
    if (!ddd) {
      toast.error('Escolha o DDD da nova linha.');
      return;
    }
    try {
      const created = await createNumber.mutateAsync({
        areaCode: ddd,
        name: newLine.name.trim() || undefined,
        costCenter: newLine.costCenter.trim() || undefined,
      });
      toast.success(
        `Linha ${formatSalvyPhone(created.phoneNumber)} provisionada (${SALVY_MONTHLY_COST_LABEL}).`,
      );
      setIsRequesting(false);
      setNewLine({ areaCode: '', name: '', costCenter: '' });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao provisionar a linha.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6" />
            Linhas
          </h2>
          <p className="text-sm text-muted-foreground">
            Números virtuais Salvy da plataforma · {activeCount} ativa(s) ·{' '}
            {SALVY_MONTHLY_COST_LABEL} por linha ativa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setIsRequesting(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Pedir linha
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, número ou centro de custo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="blocked">Bloqueadas</SelectItem>
            <SelectItem value="canceled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <p className="font-medium">Não consegui falar com a Salvy.</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Erro desconhecido.'}
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {numbers?.length
              ? 'Nenhuma linha bate com os filtros.'
              : 'Nenhuma linha provisionada ainda. Use "Pedir linha" para criar a primeira.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => onViewNumber(n.id)}
            >
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{n.name || 'Sem nome'}</p>
                    <p className="text-sm font-mono text-muted-foreground">
                      {formatSalvyPhone(n.phoneNumber)}
                    </p>
                  </div>
                  <SalvyStatusBadge status={n.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Criada em{' '}
                    {format(new Date(n.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                  {n.costCenter && (
                    <Badge variant="secondary" className="font-normal">
                      {n.costCenter}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewNumber(n.id);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Detalhes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewNumber(n.id);
                    }}
                  >
                    <MessageSquareText className="h-4 w-4 mr-2" />
                    SMS/OTP
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: pedir linha (💰 billable) */}
      <Dialog open={isRequesting} onOpenChange={(open) => !open && setIsRequesting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir nova linha</DialogTitle>
            <DialogDescription>
              Provisiona um número virtual real na Salvy.{' '}
              <span className="font-semibold text-foreground">
                Gera cobrança de {SALVY_MONTHLY_COST_LABEL}
              </span>{' '}
              enquanto a linha estiver ativa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>DDD *</Label>
              <Select
                value={newLine.areaCode}
                onValueChange={(v) => setNewLine((s) => ({ ...s, areaCode: v }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingDdd ? 'Carregando estoque…' : 'Escolha o DDD'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(areaCodes ?? []).map((ac) => (
                    <SelectItem
                      key={ac.areaCode}
                      value={String(ac.areaCode)}
                      disabled={!ac.available}
                    >
                      DDD {ac.areaCode}
                      {ac.available ? '' : ' — sem estoque'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome (opcional)</Label>
              <Input
                placeholder="Ex: Salão Bella - Tenant 42"
                value={newLine.name}
                onChange={(e) => setNewLine((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Centro de custo (opcional)</Label>
              <Input
                placeholder="Ex: beauty"
                value={newLine.costCenter}
                onChange={(e) => setNewLine((s) => ({ ...s, costCenter: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRequesting(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createNumber.isPending || !newLine.areaCode}
            >
              {createNumber.isPending
                ? 'Provisionando…'
                : `Confirmar (${SALVY_MONTHLY_COST_LABEL})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
