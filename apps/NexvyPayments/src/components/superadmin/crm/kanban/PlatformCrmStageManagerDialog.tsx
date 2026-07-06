import { useState, useEffect, useRef } from 'react';
import { Settings2, Plus, Loader2, Save, GripVertical, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PlatformCrmStageCard } from './PlatformCrmStageCard';
import {
  PlatformCrmStageEditForm,
  type PlatformCrmStageEditFormRef,
  type PlatformCrmStageFormData,
} from './PlatformCrmStageEditForm';
import {
  useCreatePlatformCrmStage,
  useUpdatePlatformCrmStage,
  useDeletePlatformCrmStage,
  useReorderPlatformCrmStages,
  type PlatformCrmStage,
} from '../data/usePlatformCrmStages';

interface PlatformCrmStageManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PlatformCrmStage[];
  /** Contagem de leads por etapa (id -> total), calculada no board. */
  leadCountByStage?: Record<string, number>;
}

export function PlatformCrmStageManagerDialog({
  open,
  onOpenChange,
  stages,
  leadCountByStage = {},
}: PlatformCrmStageManagerDialogProps) {
  const formRef = useRef<PlatformCrmStageEditFormRef>(null);
  const [editingStage, setEditingStage] = useState<PlatformCrmStage | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [localStages, setLocalStages] = useState<PlatformCrmStage[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hasOrderChanges, setHasOrderChanges] = useState(false);

  const createStage = useCreatePlatformCrmStage();
  const updateStage = useUpdatePlatformCrmStage();
  const deleteStage = useDeletePlatformCrmStage();
  const reorderStages = useReorderPlatformCrmStages();

  // Sincroniza etapas locais ao abrir ou quando a lista muda.
  useEffect(() => {
    if (open) {
      const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
      setLocalStages(sorted);
      setHasOrderChanges(false);
    }
  }, [open, stages]);

  useEffect(() => {
    if (!open) {
      setEditingStage(null);
      setIsAddingNew(false);
      setDraggedIndex(null);
      setDragOverIndex(null);
      setHasOrderChanges(false);
    }
  }, [open]);

  const handleDragStart = (index: number) => setDraggedIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newStages = [...localStages];
      const [draggedStage] = newStages.splice(draggedIndex, 1);
      newStages.splice(dragOverIndex, 0, draggedStage);

      const updatedStages = newStages.map((stage, index) => ({
        ...stage,
        order_index: index + 1,
      }));

      setLocalStages(updatedStages);
      setHasOrderChanges(true);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSaveOrder = async () => {
    try {
      await reorderStages.mutateAsync(
        localStages.map((stage, index) => ({ id: stage.id, order_index: index + 1 })),
      );
      setHasOrderChanges(false);
      toast.success('Ordem das etapas salva!');
    } catch (error) {
      console.error('Error saving order:', error);
      // toast de erro já emitido pelo hook
    }
  };

  const handleSaveStage = async (data: PlatformCrmStageFormData) => {
    try {
      if (data.id) {
        await updateStage.mutateAsync({
          id: data.id,
          name: data.name,
          description: data.description,
          color: data.color,
          is_won: data.is_won,
          is_lost: data.is_lost,
        });
      } else {
        await createStage.mutateAsync({
          name: data.name,
          description: data.description,
          color: data.color || '#6b7280',
          order_index: data.order_index ?? localStages.length + 1,
          is_won: data.is_won,
          is_lost: data.is_lost,
        });
      }

      setEditingStage(null);
      setIsAddingNew(false);
    } catch (error) {
      console.error('Error saving stage:', error);
      // toast de erro já emitido pelo hook
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    try {
      await deleteStage.mutateAsync(stageId);
      setLocalStages((prev) => prev.filter((s) => s.id !== stageId));
    } catch (error) {
      console.error('Error deleting stage:', error);
    }
  };

  const handleSaveFromRef = async () => {
    if (!formRef.current) return;
    if (!formRef.current.isValid()) {
      toast.error('Preencha o nome da etapa');
      return;
    }
    await handleSaveStage(formRef.current.getData());
  };

  const nextOrderIndex = localStages.length + 1;
  const isSaving = createStage.isPending || updateStage.isPending;
  const isSavingOrder = reorderStages.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Settings2 className="h-5 w-5 text-primary" />
            <span className="truncate">Gerenciar Etapas</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Configure as etapas do pipeline da plataforma
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="space-y-2 py-2">
            {localStages.map((stage, index) => (
              <div
                key={stage.id}
                draggable={!editingStage && !isAddingNew}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onDragLeave={() => setDragOverIndex(null)}
                className={cn(
                  'transition-all duration-200',
                  draggedIndex === index && 'opacity-50 scale-[0.98]',
                  dragOverIndex === index &&
                    draggedIndex !== null &&
                    draggedIndex !== index &&
                    'border-t-2 border-primary pt-2',
                )}
              >
                {editingStage?.id === stage.id ? (
                  <PlatformCrmStageEditForm
                    ref={formRef}
                    stage={stage}
                    onCancel={() => setEditingStage(null)}
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        'flex items-center justify-center w-8 h-8 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors mt-3',
                        (editingStage || isAddingNew) && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <PlatformCrmStageCard
                        stage={stage}
                        leadCount={leadCountByStage[stage.id] || 0}
                        onEdit={setEditingStage}
                        onDelete={handleDeleteStage}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isAddingNew && (
              <div className="ml-10">
                <PlatformCrmStageEditForm
                  ref={formRef}
                  stage={null}
                  isNew
                  onCancel={() => setIsAddingNew(false)}
                  nextOrderIndex={nextOrderIndex}
                />
              </div>
            )}

            {localStages.length === 0 && !isAddingNew && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma etapa configurada.</p>
                <p className="text-sm">Clique em "Nova Etapa" para começar.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t shrink-0">
          {editingStage || isAddingNew ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingStage(null);
                  setIsAddingNew(false);
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleSaveFromRef} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {isAddingNew ? 'Criar Etapa' : 'Salvar Etapa'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>

              <div className="flex items-center gap-2">
                {hasOrderChanges && (
                  <Button
                    variant="default"
                    onClick={handleSaveOrder}
                    disabled={isSavingOrder}
                    className="animate-fade-in"
                  >
                    {isSavingOrder ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Ordem
                  </Button>
                )}

                <Button
                  variant={hasOrderChanges ? 'outline' : 'default'}
                  onClick={() => {
                    setEditingStage(null);
                    setIsAddingNew(true);
                  }}
                  disabled={isAddingNew || !!editingStage}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Etapa
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
