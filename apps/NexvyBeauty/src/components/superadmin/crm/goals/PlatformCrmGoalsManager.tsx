import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Target, Calendar, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlatformCrmGoals,
  useCreatePlatformCrmGoal,
} from '../data/usePlatformCrmGoals';
import { usePlatformCrmSellers, usePlatformCrmSellersMap } from '../data/usePlatformCrmSellers';

/**
 * METAS de vendas do CRM de PLATAFORMA (super_admin) — desacopladas do tenant.
 * Usa EXCLUSIVAMENTE `platform_crm_sales_goals` via `usePlatformCrmGoals` +
 * componentes @/components/ui. Sem organization/product, sem cockpit do salão.
 *
 * Composição: lista de metas por período (com progresso) + criação de meta.
 * O alvo (user_id) é escolhido num seletor de vendedores DA PLATAFORMA
 * (`usePlatformCrmSellers`, resolvido contra `profiles`) e o nome é exibido na tabela.
 *
 * TODO(produto): o original tinha um campo "Produto (opcional)" na meta
 * (useProducts + product_id). O funil da plataforma não tem product_id em
 * `platform_crm_sales_goals`, então o campo produto fica pendente de decisão.
 */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatPeriodDate(date: string): string {
  // YYYY-MM-DD direto (evita shift de timezone do new Date()).
  const [y, m, d] = date.slice(0, 10).split('-');
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

interface GoalFormData {
  user_id: string;
  period_start: string;
  period_end: string;
  target_value: number;
  target_deals: number;
}

const EMPTY_GOAL_FORM: GoalFormData = {
  user_id: '',
  period_start: '',
  period_end: '',
  target_value: 0,
  target_deals: 0,
};

export function PlatformCrmGoalsManager() {
  const { data: goals = [], isLoading } = usePlatformCrmGoals();
  const { data: sellers = [] } = usePlatformCrmSellers();
  const { map: sellersMap } = usePlatformCrmSellersMap();
  const createGoal = useCreatePlatformCrmGoal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<GoalFormData>(EMPTY_GOAL_FORM);

  const resetForm = () => setForm(EMPTY_GOAL_FORM);

  const handleSubmit = async () => {
    if (!form.user_id || !form.period_start || !form.period_end) {
      toast.error('Selecione o vendedor e o período.');
      return;
    }
    await createGoal.mutateAsync({
      user_id: form.user_id,
      period_start: form.period_start,
      period_end: form.period_end,
      target_value: form.target_value,
      target_deals: form.target_deals,
      is_active: true,
    });
    setDialogOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" />
            Metas
          </h1>
          <p className="text-muted-foreground mt-1">
            Metas de vendas por período do funil único da plataforma.
          </p>
        </div>

        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nova Meta
        </Button>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Target className="h-14 w-14 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhuma meta definida
              </h3>
              <p className="text-muted-foreground max-w-md mb-6">
                Crie metas para acompanhar o desempenho por período.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Criar Primeira Meta
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Meta Valor</TableHead>
                  <TableHead>Meta Negócios</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((goal) => {
                  const targetValue = goal.target_value ?? 0;
                  const achievedValue = goal.achieved_value ?? 0;
                  const valueProgress =
                    targetValue > 0 ? (achievedValue / targetValue) * 100 : 0;

                  return (
                    <TableRow key={goal.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {sellersMap[goal.user_id]?.full_name ?? (
                              <span className="font-mono text-xs">
                                {goal.user_id.slice(0, 8)}…
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatPeriodDate(goal.period_start)} –{' '}
                          {formatPeriodDate(goal.period_end)}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(targetValue)}</TableCell>
                      <TableCell>
                        {goal.achieved_deals ?? 0}/{goal.target_deals ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(100, valueProgress)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {valueProgress.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {valueProgress >= 100 ? (
                          <Badge className="bg-green-500 hover:bg-green-500/90">Atingida</Badge>
                        ) : goal.is_active ? (
                          <Badge variant="secondary">Em andamento</Badge>
                        ) : (
                          <Badge variant="outline">Encerrada</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar meta */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Criar Meta de Vendas</DialogTitle>
            <DialogDescription>
              Defina o alvo por período para um vendedor do funil da plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Vendedor *</Label>
              <Select
                value={form.user_id}
                onValueChange={(value) => setForm({ ...form, user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* TODO(produto): o original tinha "Produto (opcional)" aqui (useProducts +
                product_id). Sem coluna product_id em platform_crm_sales_goals, o campo
                produto fica pendente de decisão. */}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início do Período *</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim do Período *</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Meta de Valor (R$)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.target_value || ''}
                  onChange={(e) =>
                    setForm({ ...form, target_value: Number(e.target.value) })
                  }
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Meta de Negócios</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.target_deals || ''}
                  onChange={(e) =>
                    setForm({ ...form, target_deals: Number(e.target.value) })
                  }
                  min={0}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createGoal.isPending}>
              {createGoal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlatformCrmGoalsManager;
