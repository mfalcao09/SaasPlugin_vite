import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Contact,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

import {
  usePlatformCrmTasks,
  useCreatePlatformCrmTask,
  useUpdatePlatformCrmTask,
  useTogglePlatformCrmTask,
  useDeletePlatformCrmTask,
  type PlatformCrmTaskWithRefs,
} from '../data/usePlatformCrmTasks';
import { usePlatformCrmTeamMembers } from '../data/usePlatformCrmTeam';
import { usePlatformCrmLeads } from '../data/usePlatformCrmLeads';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformCrmLeadDetail } from '../leads/PlatformCrmLeadDetail';
import { PlatformCrmTaskFormDialog, type TaskFormValues } from './PlatformCrmTaskFormDialog';

/**
 * GESTÃO DE TAREFAS do CRM de PLATAFORMA (super_admin) — módulo Vendas.
 * PORTE da anatomia do `seller/TaskCenter.tsx` (CRM Vendus V5): contadores no
 * topo, abas de status, lista de cards com toggle concluir/reabrir, badges de
 * prioridade/atraso e dialog de criação — ADAPTADO à visão de gestão da
 * plataforma: todas as tarefas do time (não só as do usuário), filtros por
 * tipo/responsável/lead + busca, edição, exclusão com confirmação e link para
 * o lead (abre PlatformCrmLeadDetail, mesmo padrão do LeadsManager).
 * DESACOPLAMENTO 🔒: só `platform_crm_*`; zero organization_id. `product_id`
 * existe no schema e respeita o produto ativo global (A1.3, filtro aditivo).
 * Casca Lux: header pílula navy-gradient + ação primária brand-gradient +
 * KPIs surface-card (anatomia do exemplar PlatformCrmLeadsKPICards).
 */

type StatusTab = 'all' | 'today' | 'pending' | 'overdue' | 'completed';

/** Atrasada = status overdue OU (pendente/em andamento com vencimento no passado). */
function isTaskOverdue(task: PlatformCrmTaskWithRefs): boolean {
  if (task.status === 'overdue') return true;
  if (task.status !== 'pending' && task.status !== 'in_progress') return false;
  return Boolean(task.due_date && isPast(new Date(task.due_date)));
}

const getPriorityColor = (priority: string | null) => {
  switch (priority) {
    case 'urgent':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'high':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'medium':
      return 'bg-primary/10 text-primary border-primary/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getPriorityLabel = (priority: string | null) => {
  switch (priority) {
    case 'urgent':
      return 'Urgente';
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Média';
    default:
      return 'Baixa';
  }
};

const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  follow_up: 'Follow-up',
  followup: 'Follow-up',
  radar: 'Radar',
  cadence: 'Cadência',
  automation: 'Automação',
};

const getTypeLabel = (type: string | null) => {
  if (!type) return 'Manual';
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
};

const getTimeLabel = (dueDate: string) => {
  const date = new Date(dueDate);
  if (isToday(date)) return `hoje ${format(date, 'HH:mm')}`;
  return formatDistanceToNow(date, { locale: ptBR, addSuffix: true });
};

export function PlatformCrmTasksManager() {
  const { data: tasks = [], isLoading } = usePlatformCrmTasks();
  const { data: members = [] } = usePlatformCrmTeamMembers();
  const { data: allLeads = [] } = usePlatformCrmLeads();
  const createTask = useCreatePlatformCrmTask();
  const updateTask = useUpdatePlatformCrmTask();
  const toggleTask = useTogglePlatformCrmTask();
  const deleteTask = useDeletePlatformCrmTask();

  // A1.3 — filtro GLOBAL de produto (client-side, aditivo — mesma semântica do
  // LeadsManager: com "Todos" (null) a lista é idêntica ao comportamento atual).
  const { activeProductId } = useActivePlatformProduct();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(true);

  // ── Dialogs ──────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlatformCrmTaskWithRefs | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<PlatformCrmTaskWithRefs | null>(null);
  const [leadDetailId, setLeadDetailId] = useState<string | null>(null);

  // Escopo por produto ativo — base dos contadores E da lista.
  const productTasks = useMemo(
    () => (activeProductId ? tasks.filter((t) => t.product_id === activeProductId) : tasks),
    [tasks, activeProductId],
  );

  // Contadores do topo (sobre o escopo do produto, ANTES dos demais filtros).
  const counters = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let today = 0;
    let completed = 0;
    for (const t of productTasks) {
      const late = isTaskOverdue(t);
      if (late) overdue += 1;
      if ((t.status === 'pending' || t.status === 'in_progress') && !late) pending += 1;
      if (t.status === 'completed') completed += 1;
      if (t.status !== 'completed' && t.due_date && isToday(new Date(t.due_date))) today += 1;
    }
    return { pending, overdue, today, completed };
  }, [productTasks]);

  // Opções de tipo/lead derivadas das tarefas existentes (sem inventar catálogo).
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    productTasks.forEach((t) => set.add(t.type ?? 'manual'));
    return [...set].sort();
  }, [productTasks]);

  const leadOptions = useMemo(() => {
    const map = new Map<string, string>();
    productTasks.forEach((t) => {
      if (t.lead?.id) map.set(t.lead.id, t.lead.name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [productTasks]);

  // ── Lista filtrada + ordenada por vencimento ────────────────────────────
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = productTasks.filter((t) => {
      switch (statusTab) {
        case 'today':
          if (t.status === 'completed' || !t.due_date || !isToday(new Date(t.due_date)))
            return false;
          break;
        case 'pending':
          if (t.status !== 'pending' && t.status !== 'in_progress') return false;
          break;
        case 'overdue':
          if (!isTaskOverdue(t)) return false;
          break;
        case 'completed':
          if (t.status !== 'completed') return false;
          break;
      }
      if (typeFilter !== 'all' && (t.type ?? 'manual') !== typeFilter) return false;
      if (assigneeFilter !== 'all' && t.user_id !== assigneeFilter) return false;
      if (leadFilter !== 'all' && t.lead_id !== leadFilter) return false;
      if (q) {
        const haystack = `${t.title} ${t.description ?? ''} ${t.lead?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    // Ordenação por vencimento; tarefas sem due_date sempre ao final.
    return [...filtered].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      const diff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return sortAsc ? diff : -diff;
    });
  }, [productTasks, statusTab, typeFilter, assigneeFilter, leadFilter, search, sortAsc]);

  const hasActiveFilters =
    statusTab !== 'all' ||
    typeFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    leadFilter !== 'all' ||
    Boolean(search.trim());

  const clearFilters = () => {
    setStatusTab('all');
    setTypeFilter('all');
    setAssigneeFilter('all');
    setLeadFilter('all');
    setSearch('');
  };

  // ── Ações ────────────────────────────────────────────────────────────────
  const handleToggleComplete = async (task: PlatformCrmTaskWithRefs) => {
    const completing = task.status !== 'completed';
    try {
      await toggleTask.mutateAsync({
        taskId: task.id,
        completed: completing,
        leadId: task.lead_id,
      });
      toast.success(completing ? 'Tarefa concluída! 🎉' : 'Tarefa reaberta!');
    } catch {
      toast.error('Erro ao atualizar tarefa');
    }
  };

  const handleSubmitForm = async (values: TaskFormValues) => {
    try {
      if (editingTask) {
        await updateTask.mutateAsync({ id: editingTask.id, ...values });
        toast.success('Tarefa atualizada!');
      } else {
        await createTask.mutateAsync({
          ...values,
          status: 'pending',
          type: 'manual',
          product_id: activeProductId ?? null,
          created_by: currentUserId,
        });
        toast.success('Tarefa criada com sucesso!');
      }
      setFormOpen(false);
      setEditingTask(null);
    } catch (e) {
      toast.error(
        (e as { message?: string })?.message ??
          (editingTask ? 'Erro ao atualizar tarefa' : 'Erro ao criar tarefa'),
      );
    }
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteTask.mutateAsync(taskToDelete.id);
      toast.success('Tarefa excluída');
    } catch {
      toast.error('Erro ao excluir tarefa');
    } finally {
      setTaskToDelete(null);
    }
  };

  const openCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: PlatformCrmTaskWithRefs) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const getStatusIcon = (task: PlatformCrmTaskWithRefs) => {
    if (task.status === 'completed') return <CheckCircle2 size={18} className="text-success" />;
    if (isTaskOverdue(task)) return <AlertTriangle size={18} className="text-destructive" />;
    if (task.status === 'in_progress') return <Clock size={18} className="text-primary" />;
    return <Circle size={18} className="text-muted-foreground" />;
  };

  // ── KPIs do topo (anatomia Lux do exemplar PlatformCrmLeadsKPICards) ─────
  const kpis = [
    {
      key: 'pending',
      label: 'Pendentes',
      value: counters.pending,
      icon: ListTodo,
      pill: 'bg-muted border hairline text-muted-foreground',
    },
    {
      key: 'overdue',
      label: 'Atrasadas',
      value: counters.overdue,
      icon: AlertTriangle,
      pill:
        counters.overdue > 0
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted border hairline text-muted-foreground',
    },
    {
      key: 'today',
      label: 'Para hoje',
      value: counters.today,
      icon: Calendar,
      pill: 'bg-primary/10 text-primary',
    },
    {
      key: 'completed',
      label: 'Concluídas',
      value: counters.completed,
      icon: CheckCircle2,
      pill: 'bg-success/10 text-success',
    },
  ] as const;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header de página — escala §1.4. Casca Lux: pílula navy-gradient +
         ação primária brand-gradient (mesmo padrão do LeadsManager). */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl navy-gradient shrink-0 shadow-sm">
            <ListTodo className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              Gestão de Tarefas
            </h1>
            <p className="text-sm text-muted-foreground">
              Tarefas do time comercial — follow-ups, cadências e ações avulsas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="h-10 px-4 rounded-lg brand-gradient brand-glow text-white text-[13px] font-semibold inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5 shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </button>
      </div>

      {/* Contadores no topo — pendentes/atrasadas/hoje/concluídas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.key}
              className="surface-card surface-card-hover p-5 flex items-start gap-3.5"
            >
              <div
                className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  kpi.pill,
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-muted-foreground truncate">
                  {kpi.label}
                </p>
                {isLoading ? (
                  <div className="mt-1 h-[30px] w-16 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none">
                    {kpi.value.toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Abas de status (porte do Tabs Hoje/Todas/Atrasadas do TaskCenter V5) */}
      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="today">Hoje</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="overdue" className={counters.overdue > 0 ? 'text-destructive' : ''}>
            Atrasadas {counters.overdue > 0 && `(${counters.overdue})`}
          </TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Busca + filtros (tipo · responsável · lead) + ordenação por vencimento */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descrição ou lead..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {getTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={leadFilter} onValueChange={setLeadFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Lead" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os leads</SelectItem>
              {leadOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-10 border hairline hover:border-[color:var(--hairline-gold)]"
            onClick={() => setSortAsc((v) => !v)}
            title="Ordenar por vencimento"
          >
            <ArrowDownUp className="h-4 w-4 mr-1.5" />
            {sortAsc ? 'Vencimento ↑' : 'Vencimento ↓'}
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Lista de tarefas (anatomia do card do TaskCenter V5) */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task, index) => {
            const late = isTaskOverdue(task);
            const completed = task.status === 'completed';
            return (
              <div
                key={task.id}
                className={cn(
                  'p-4 rounded-xl border bg-card transition-all duration-200',
                  'hover:border-primary/30 hover:shadow-md',
                  completed && 'opacity-60',
                  late && 'border-destructive/30 bg-destructive/5',
                  'animate-slide-up',
                )}
                style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}
              >
                <div className="flex items-start gap-4">
                  {/* Toggle concluir/reabrir com 1 clique */}
                  <button
                    onClick={() => handleToggleComplete(task)}
                    className="mt-1 transition-transform hover:scale-110"
                    disabled={toggleTask.isPending}
                    title={completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
                  >
                    {getStatusIcon(task)}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4
                        className={cn(
                          'font-medium text-foreground',
                          completed && 'line-through text-muted-foreground',
                        )}
                      >
                        {task.title}
                      </h4>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getPriorityColor(task.priority))}
                      >
                        {getPriorityLabel(task.priority)}
                      </Badge>
                      {(task.type ?? 'manual') !== 'manual' && (
                        <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                          {getTypeLabel(task.type)}
                        </Badge>
                      )}
                      {late && (
                        <Badge variant="destructive" className="text-xs">
                          Atrasada
                        </Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {task.profiles?.full_name && (
                        <div className="flex items-center gap-1">
                          <User size={12} />
                          <span>{task.profiles.full_name}</span>
                        </div>
                      )}
                      {task.lead && (
                        <button
                          type="button"
                          onClick={() => setLeadDetailId(task.lead!.id)}
                          className="flex items-center gap-1 text-primary hover:underline"
                          title="Abrir lead"
                        >
                          <Contact size={12} />
                          <span>
                            {task.lead.name}
                            {task.lead.company ? ` — ${task.lead.company}` : ''}
                          </span>
                        </button>
                      )}
                      {task.product && (
                        <div className="flex items-center gap-1">
                          <span className="text-primary">•</span>
                          <span>{task.product.name}</span>
                        </div>
                      )}
                      {task.due_date && (
                        <div className={cn('flex items-center gap-1', late && 'text-destructive')}>
                          <Calendar size={12} />
                          <span>{getTimeLabel(task.due_date)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!completed && (
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => handleToggleComplete(task)}
                        disabled={toggleTask.isPending}
                      >
                        Concluir
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(task)}
                      title="Editar tarefa"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setTaskToDelete(task)}
                      title="Excluir tarefa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {hasActiveFilters ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa por aqui'}
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                {hasActiveFilters
                  ? 'Ajuste os filtros ou a busca para encontrar o que procura.'
                  : 'Crie a primeira tarefa do time ou aguarde as automações gerarem follow-ups.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Criar / editar tarefa */}
      <PlatformCrmTaskFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
        onSubmit={handleSubmitForm}
        isLoading={createTask.isPending || updateTask.isPending}
        members={members.map((m) => ({ id: m.id, label: m.full_name }))}
        leads={allLeads.map((l) => ({
          id: l.id,
          label: l.company ? `${l.name} — ${l.company}` : l.name,
        }))}
        defaultUserId={currentUserId}
      />

      {/* Confirmação de exclusão (mesmo padrão do LeadsManager) */}
      <AlertDialog
        open={Boolean(taskToDelete)}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa
              {taskToDelete ? ` "${taskToDelete.title}"` : ''}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalhe do lead (mesmo padrão do LeadsManager) */}
      <Dialog open={Boolean(leadDetailId)} onOpenChange={(open) => !open && setLeadDetailId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
          <VisuallyHidden>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </VisuallyHidden>
          {leadDetailId && (
            <PlatformCrmLeadDetail leadId={leadDetailId} onBack={() => setLeadDetailId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
