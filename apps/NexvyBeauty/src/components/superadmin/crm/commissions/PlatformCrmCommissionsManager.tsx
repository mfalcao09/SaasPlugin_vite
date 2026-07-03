import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Pencil,
  Trash2,
  Percent,
  DollarSign,
  Loader2,
  BadgeCheck,
  CircleDollarSign,
  Users,
  User,
  Clock,
  CheckCircle,
  Check,
  CreditCard,
} from 'lucide-react';
import {
  usePlatformCrmCommissions,
  useApprovePlatformCrmCommission,
  usePayPlatformCrmCommission,
  useBulkUpdatePlatformCrmCommissions,
  usePlatformCrmCommissionRules,
  useCreatePlatformCrmCommissionRule,
  useUpdatePlatformCrmCommissionRule,
  useDeletePlatformCrmCommissionRule,
  type PlatformCrmCommissionRule,
  type PlatformCrmCommissionRuleType,
  type PlatformCrmCommissionStatus,
  type PlatformCrmCommissionWithDeal,
} from '../data/usePlatformCrmCommissions';
import { usePlatformCrmSellers, usePlatformCrmSellersMap } from '../data/usePlatformCrmSellers';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';

/**
 * COMISSÕES do CRM de PLATAFORMA (super_admin) — desacopladas do tenant.
 * Usa EXCLUSIVAMENTE os hooks `platform_crm_commissions` / `platform_crm_commission_rules`
 * + componentes @/components/ui. Sem organization/product, sem cockpit do salão.
 *
 * Aba Regras: CRUD de commission_rules (rule_type, base_value, applies_to, is_default,
 *   user_id → vendedor específico). "Vendedor" = rep de venda DA PLATAFORMA (usePlatformCrmSellers).
 *   Agrupamento por produto NÃO existe (o funil da plataforma não tem product_id) — TODO(produto).
 * Aba Comissões: sumário (pendente/aprovada/paga) + lista + aprovar/pagar + bulk approve.
 */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value);
}

interface RuleFormData {
  rule_type: PlatformCrmCommissionRuleType;
  base_value: number;
  applies_to: string;
  min_value: number;
  max_value: number | null;
  is_default: boolean;
  user_id: string;
  product_id: string | null;
  is_active: boolean;
}

const EMPTY_RULE_FORM: RuleFormData = {
  rule_type: 'percentage',
  base_value: 10,
  applies_to: 'deal',
  min_value: 0,
  max_value: null,
  is_default: true,
  user_id: '',
  product_id: null,
  is_active: true,
};

export function PlatformCrmCommissionsManager() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <CircleDollarSign className="h-7 w-7 text-primary" />
          Comissões
        </h1>
        <p className="text-muted-foreground mt-1">
          Regras e pagamentos de comissão do funil único da plataforma.
        </p>
      </div>

      <Tabs defaultValue="regras">
        <TabsList>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
        </TabsList>
        <TabsContent value="regras" className="mt-4">
          <RulesTab />
        </TabsContent>
        <TabsContent value="comissoes" className="mt-4">
          <CommissionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== ABA REGRAS ============================== */

function RulesTab() {
  const { data: rules = [], isLoading } = usePlatformCrmCommissionRules();
  const { data: sellers = [] } = usePlatformCrmSellers();
  const { data: products = [] } = usePlatformCrmProducts();
  const { map: sellersMap } = usePlatformCrmSellersMap();
  const createRule = useCreatePlatformCrmCommissionRule();
  const updateRule = useUpdatePlatformCrmCommissionRule();
  const deleteRule = useDeletePlatformCrmCommissionRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(EMPTY_RULE_FORM);

  const resetForm = () => {
    setForm(EMPTY_RULE_FORM);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (rule: PlatformCrmCommissionRule) => {
    setForm({
      rule_type: (rule.rule_type as PlatformCrmCommissionRuleType) ?? 'percentage',
      base_value: rule.base_value,
      applies_to: rule.applies_to ?? 'deal',
      min_value: rule.min_value ?? 0,
      max_value: rule.max_value,
      is_default: rule.is_default ?? true,
      user_id: rule.user_id ?? '',
      product_id: rule.product_id ?? null,
      is_active: rule.is_active ?? true,
    });
    setEditingId(rule.id);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const payload = {
      rule_type: form.rule_type,
      base_value: form.base_value,
      applies_to: form.applies_to,
      min_value: form.min_value,
      max_value: form.max_value,
      // Regra padrão → sem vendedor; senão, o vendedor escolhido.
      is_default: form.is_default,
      user_id: form.is_default ? null : form.user_id || null,
      product_id: form.product_id,
      is_active: form.is_active,
    };
    if (editingId) {
      await updateRule.mutateAsync({ id: editingId, ...payload });
    } else {
      await createRule.mutateAsync(payload);
    }
    setDialogOpen(false);
    resetForm();
  };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;
    await deleteRule.mutateAsync(ruleToDelete);
    setRuleToDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure como as comissões são calculadas.
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Regra
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Percent className="h-14 w-14 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhuma regra configurada
              </h3>
              <p className="text-muted-foreground max-w-md">
                Crie a primeira regra de comissão.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Aplicação</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Limites</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {rule.rule_type === 'percentage' ? (
                          <Percent className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        )}
                        {rule.rule_type === 'percentage' ? 'Percentual' : 'Fixo'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.product_id
                        ? products.find((p) => p.id === rule.product_id)?.name ?? 'Produto'
                        : 'Todos'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {rule.is_default ? (
                          <>
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>Todos</span>
                          </>
                        ) : (
                          <>
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {rule.user_id
                                ? sellersMap[rule.user_id]?.full_name ?? 'Vendedor'
                                : 'Vendedor'}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rule.rule_type === 'percentage'
                          ? `${rule.base_value}%`
                          : formatCurrency(rule.base_value)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.applies_to ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.min_value ? `Min: ${formatCurrency(rule.min_value)}` : ''}
                      {rule.min_value && rule.max_value ? ' | ' : ''}
                      {rule.max_value ? `Max: ${formatCurrency(rule.max_value)}` : ''}
                      {!rule.min_value && !rule.max_value ? 'Sem limites' : ''}
                    </TableCell>
                    <TableCell>
                      {rule.is_active ? (
                        <Badge className="bg-green-500 hover:bg-green-500/90">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRuleToDelete(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar/editar regra */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Regra' : 'Nova Regra de Comissão'}</DialogTitle>
            <DialogDescription>
              Defina como a comissão é calculada para os negócios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* D4: segmentação por produto (product_id restaurado no D3; a função
                platform_crm_calculate_commission prefere a regra do produto). */}
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select
                value={form.product_id ?? '__all__'}
                onValueChange={(v) =>
                  setForm({ ...form, product_id: v === '__all__' ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os produtos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os produtos</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Regra padrão (todos os vendedores) vs. vendedor específico */}
            <div className="flex items-center space-x-2">
              <Switch
                id="rule_is_default"
                checked={form.is_default}
                onCheckedChange={(checked) =>
                  setForm({ ...form, is_default: checked, user_id: checked ? '' : form.user_id })
                }
              />
              <Label htmlFor="rule_is_default">Regra padrão (todos os vendedores)</Label>
            </div>

            {!form.is_default && (
              <div className="space-y-2">
                <Label>Vendedor Específico</Label>
                <Select
                  value={form.user_id}
                  onValueChange={(value) => setForm({ ...form, user_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vendedor" />
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
            )}

            <div className="space-y-2">
              <Label>Tipo de Comissão</Label>
              <Select
                value={form.rule_type}
                onValueChange={(v) =>
                  setForm({ ...form, rule_type: v as PlatformCrmCommissionRuleType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{form.rule_type === 'percentage' ? 'Percentual (%)' : 'Valor Fixo (R$)'}</Label>
              <Input
                type="number"
                value={form.base_value}
                onChange={(e) => setForm({ ...form, base_value: Number(e.target.value) })}
                min={0}
                step={form.rule_type === 'percentage' ? 0.5 : 100}
              />
            </div>

            <div className="space-y-2">
              <Label>Aplica a</Label>
              <Input
                value={form.applies_to}
                onChange={(e) => setForm({ ...form, applies_to: e.target.value })}
                placeholder="deal"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Mínimo (R$)</Label>
                <Input
                  type="number"
                  value={form.min_value}
                  onChange={(e) => setForm({ ...form, min_value: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor Máximo (R$)</Label>
                <Input
                  type="number"
                  value={form.max_value ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_value: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  min={0}
                  placeholder="Sem limite"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="rule_is_active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="rule_is_active">Regra ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createRule.isPending || updateRule.isPending}
            >
              {(createRule.isPending || updateRule.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingId ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={ruleToDelete !== null}
        onOpenChange={(o) => !o && setRuleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra de comissão? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ ABA COMISSÕES ============================ */

const COMMISSION_STATUS_ALL = 'all';

function CommissionStatusBadge({ status }: { status: string | null }) {
  if (status === 'paid') return <Badge className="bg-green-500 hover:bg-green-500/90">Paga</Badge>;
  if (status === 'approved') return <Badge variant="secondary">Aprovada</Badge>;
  if (status === 'pending') return <Badge variant="outline">Pendente</Badge>;
  return <Badge variant="secondary">{status ?? '—'}</Badge>;
}

/** Card de sumário (pendente/aprovada/paga) — espelha os "Cards de Resumo" do original. */
function SummaryCard({
  title,
  value,
  hint,
  icon,
  valueClassName,
}: {
  title: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium">{title}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold ${valueClassName ?? ''}`}>
          {formatCurrency(value)}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CommissionsTab() {
  const [statusFilter, setStatusFilter] = useState<
    PlatformCrmCommissionStatus | typeof COMMISSION_STATUS_ALL
  >(COMMISSION_STATUS_ALL);
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);

  // Lista filtrada (renderizada) + lista completa para o sumário por status.
  const { data: commissions = [], isLoading } = usePlatformCrmCommissions(
    statusFilter === COMMISSION_STATUS_ALL ? undefined : statusFilter,
  );
  const { data: products = [] } = usePlatformCrmProducts();
  const { data: allCommissions = [] } = usePlatformCrmCommissions();

  const approve = useApprovePlatformCrmCommission();
  const pay = usePayPlatformCrmCommission();
  const bulkUpdate = useBulkUpdatePlatformCrmCommissions();

  // Sumário por status (pendente/aprovada/paga) sobre o total.
  const summary = useMemo(() => {
    const acc = { pending: 0, approved: 0, paid: 0, total: 0 };
    for (const c of allCommissions) {
      const amount = Number(c.amount ?? 0);
      if (c.status === 'pending') acc.pending += amount;
      else if (c.status === 'approved') acc.approved += amount;
      else if (c.status === 'paid') acc.paid += amount;
      acc.total += amount;
    }
    return acc;
  }, [allCommissions]);

  const pendingIds = useMemo(
    () => commissions.filter((c) => c.status === 'pending').map((c) => c.id),
    [commissions],
  );
  const approvedIds = useMemo(
    () => commissions.filter((c) => c.status === 'approved').map((c) => c.id),
    [commissions],
  );
  const allPendingSelected =
    pendingIds.length > 0 && selectedCommissions.length === pendingIds.length;
  const allApprovedSelected =
    approvedIds.length > 0 && selectedCommissions.length === approvedIds.length;

  const toggleCommission = (id: string) => {
    setSelectedCommissions((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleBulkApprove = async () => {
    if (selectedCommissions.length === 0) return;
    await bulkUpdate.mutateAsync({ ids: selectedCommissions, status: 'approved' });
    setSelectedCommissions([]);
  };

  // Espelha handleBulkApprove, mas marca as selecionadas como pagas (fiel ao
  // handleBulkPay do FinancialDashboard original). Usado no contexto "Aprovadas".
  const handleBulkPay = async () => {
    if (selectedCommissions.length === 0) return;
    await bulkUpdate.mutateAsync({ ids: selectedCommissions, status: 'paid' });
    setSelectedCommissions([]);
  };

  return (
    <div className="space-y-4">
      {/* Cards de Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Comissões Pendentes"
          value={summary.pending}
          hint="Aguardando aprovação"
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
          valueClassName="text-yellow-600"
        />
        <SummaryCard
          title="Comissões Aprovadas"
          value={summary.approved}
          hint="A pagar"
          icon={<CheckCircle className="h-4 w-4 text-blue-500" />}
          valueClassName="text-blue-600"
        />
        <SummaryCard
          title="Comissões Pagas"
          value={summary.paid}
          hint="Total pago"
          icon={<CircleDollarSign className="h-4 w-4 text-green-500" />}
          valueClassName="text-green-600"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Comissões geradas pelos negócios fechados.
        </p>
        <div className="flex items-center gap-2">
          {selectedCommissions.length > 0 && statusFilter === 'approved' && (
            <Button onClick={handleBulkPay} disabled={bulkUpdate.isPending}>
              {bulkUpdate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Marcar como Pagas ({selectedCommissions.length})
            </Button>
          )}
          {selectedCommissions.length > 0 && statusFilter !== 'approved' && (
            <Button onClick={handleBulkApprove} disabled={bulkUpdate.isPending}>
              {bulkUpdate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Aprovar Selecionadas ({selectedCommissions.length})
            </Button>
          )}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as PlatformCrmCommissionStatus | typeof COMMISSION_STATUS_ALL);
              setSelectedCommissions([]);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COMMISSION_STATUS_ALL}>Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovada</SelectItem>
              <SelectItem value="paid">Paga</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : commissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CircleDollarSign className="h-14 w-14 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhuma comissão encontrada
              </h3>
              <p className="text-muted-foreground max-w-md">
                As comissões dos negócios fechados aparecem aqui.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        statusFilter === 'approved' ? allApprovedSelected : allPendingSelected
                      }
                      disabled={
                        statusFilter === 'approved'
                          ? approvedIds.length === 0
                          : pendingIds.length === 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked)
                          setSelectedCommissions(
                            statusFilter === 'approved' ? approvedIds : pendingIds,
                          );
                        else setSelectedCommissions([]);
                      }}
                    />
                  </TableHead>
                  <TableHead>Negócio</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((commission: PlatformCrmCommissionWithDeal) => (
                  <TableRow key={commission.id}>
                    <TableCell>
                      {(statusFilter === 'approved'
                        ? commission.status === 'approved'
                        : commission.status === 'pending') ? (
                        <Checkbox
                          checked={selectedCommissions.includes(commission.id)}
                          onCheckedChange={() => toggleCommission(commission.id)}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{commission.deal?.lead?.name ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">
                          {commission.deal?.plan_name ?? '—'}
                          {commission.deal
                            ? ` · ${formatCurrency(commission.deal.deal_value ?? 0)}`
                            : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {commission.product_id
                        ? products.find((p) => p.id === commission.product_id)?.name ?? 'Produto'
                        : '—'}
                    </TableCell>
                    <TableCell>{formatCurrency(commission.amount ?? 0)}</TableCell>
                    <TableCell>
                      <CommissionStatusBadge status={commission.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {commission.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => approve.mutate(commission.id)}
                            disabled={approve.isPending}
                          >
                            <BadgeCheck className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                        )}
                        {(commission.status === 'approved' ||
                          commission.status === 'pending') && (
                          <Button
                            size="sm"
                            onClick={() => pay.mutate(commission.id)}
                            disabled={pay.isPending}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        {commission.status === 'paid' && (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PlatformCrmCommissionsManager;
