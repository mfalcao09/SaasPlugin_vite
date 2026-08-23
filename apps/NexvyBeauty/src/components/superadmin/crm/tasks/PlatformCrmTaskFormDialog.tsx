import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Loader2, Plus, Package } from 'lucide-react';
import { format } from 'date-fns';
import type { PlatformCrmTaskWithRefs } from '../data/usePlatformCrmTasks';
import { validateCreateLeadProduct } from '../leads/createPlatformCrmLeadProduct';

/**
 * Dialog de criação/edição de tarefa da Gestão de Tarefas (módulo Vendas).
 * PORTE do dialog "Criar Nova Tarefa" do `seller/TaskCenter.tsx` (CRM Vendus V5),
 * adaptado ao contexto de plataforma: responsável = time da plataforma
 * (obrigatório, como no CreateRadarTaskDialog), lead opcional (tarefa avulsa OK).
 * DESACOPLAMENTO: zero organization_id; dados fluem para `platform_crm_tasks`.
 */

export interface TaskFormValues {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** ISO string (ou null quando o campo é limpo na edição). */
  due_date: string | null;
  lead_id: string | null;
  user_id: string;
  /** Só no create (regra B). Edição não altera product_id. */
  product_id: string | null;
}

interface Option {
  id: string;
  label: string;
}

interface PlatformCrmTaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tarefa em edição; null/undefined = criação. */
  task?: PlatformCrmTaskWithRefs | null;
  onSubmit: (values: TaskFormValues) => Promise<void>;
  isLoading?: boolean;
  members: Option[];
  leads: Option[];
  /** Default do responsável na criação (usuário atual). */
  defaultUserId?: string | null;
  products: { id: string; name: string }[];
  lockedProductId: string | null;
}

const toLocalInput = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '';

export function PlatformCrmTaskFormDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
  isLoading,
  members,
  leads,
  defaultUserId,
  products,
  lockedProductId,
}: PlatformCrmTaskFormDialogProps) {
  const isEdit = Boolean(task);
  const catalogHasProducts = products.length > 0;
  const lockedProductName =
    lockedProductId != null
      ? (products.find((p) => p.id === lockedProductId)?.name ?? 'Produto ativo')
      : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskFormValues['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  const [leadId, setLeadId] = useState<string>('none');
  const [userId, setUserId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-hidrata o formulário a cada abertura (criação zera; edição preenche).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setPriority((task.priority as TaskFormValues['priority']) ?? 'medium');
      setDueDate(toLocalInput(task.due_date));
      setLeadId(task.lead_id ?? 'none');
      setUserId(task.user_id);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setLeadId('none');
      setUserId(defaultUserId ?? '');
      setSelectedProductId(lockedProductId ?? '');
    }
  }, [open, task, defaultUserId, lockedProductId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Título é obrigatório');
      return;
    }
    if (!userId) {
      setError('Selecione um responsável');
      return;
    }
    let productId: string | null = task?.product_id ?? null;
    if (!isEdit) {
      const productCheck = validateCreateLeadProduct({
        lockedProductId,
        selectedProductId,
        catalogHasProducts,
      });
      if (!productCheck.ok) {
        setError(productCheck.error);
        return;
      }
      productId = productCheck.productId;
    }
    setError(null);
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      lead_id: leadId === 'none' ? null : leadId,
      user_id: userId,
      product_id: productId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Tarefa' : 'Criar Nova Tarefa'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Ajuste os dados da tarefa da equipe.'
              : 'Tarefa avulsa ou vinculada a um lead do pipeline.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Título *</Label>
            <Input
              id="task-title"
              placeholder="Ex: Ligar para lead, Enviar proposta..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Descrição</Label>
            <Textarea
              id="task-description"
              placeholder="Detalhes adicionais da tarefa..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskFormValues['priority'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due-date">Data e Hora</Label>
              <Input
                id="task-due-date"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Responsável *</Label>
            <Select value={userId || undefined} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar responsável..." />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && catalogHasProducts && lockedProductId ? (
            <div
              className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm"
              title="Produto do switcher da sidebar"
            >
              <Package className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Produto</span>
              <span className="font-medium truncate">{lockedProductName}</span>
            </div>
          ) : null}
          {!isEdit && catalogHasProducts && !lockedProductId ? (
            <div className="space-y-2">
              <Label>Produto *</Label>
              <Select
                value={selectedProductId || undefined}
                onValueChange={setSelectedProductId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Vincular a um Lead (opcional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar lead..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (tarefa avulsa)</SelectItem>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              !isEdit && <Plus className="h-4 w-4 mr-2" />
            )}
            {isEdit ? 'Salvar alterações' : 'Criar Tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
