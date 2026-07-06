import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Zap, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePlatformCrmTags, type PlatformCrmTag } from '@/components/superadmin/crm/data/usePlatformCrmTags';
import {
  usePlatformCrmTagAutomations,
  useUpsertPlatformCrmTagAutomation,
  useTogglePlatformCrmTagAutomation,
  useDeletePlatformCrmTagAutomation,
  PLATFORM_CRM_TAG_EVENT_LABELS,
  type PlatformCrmTagAutomation,
} from '@/components/superadmin/crm/data/usePlatformCrmTagAutomations';
import { PlatformCrmTagPackageGeneratorDialog } from './PlatformCrmTagPackageGeneratorDialog';

const DEFAULT_EVENT = 'compra_aprovada';

/**
 * Painel de automações por evento do CRM de PLATAFORMA. Aplica etiquetas
 * automaticamente conforme o status do checkout. Só tabelas platform_crm_*.
 *
 * TODO(produto): o original agrupa regras por produto (coluna product_id). O schema
 * `platform_crm_tag_automations` atual NÃO tem product_id — quando Produtos decidir
 * a dimensão por produto, restaurar o agrupamento + Select de produto no dialog.
 */
export function PlatformCrmTagAutomationsPanel() {
  const { data: automations = [] } = usePlatformCrmTagAutomations();
  const { data: tags = [] } = usePlatformCrmTags();
  const toggleMut = useTogglePlatformCrmTagAutomation();
  const deleteMut = useDeletePlatformCrmTagAutomation();

  const [editing, setEditing] = useState<PlatformCrmTagAutomation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);

  const tagById = (id: string) => tags.find((t) => t.id === id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> Automações por evento
          </CardTitle>
          <CardDescription>
            Aplique etiquetas automaticamente conforme o status do checkout. Etiquetas marcadas como
            "status do ciclo" são removidas quando a compra é confirmada — etiquetas permanentes preservam o histórico do cliente.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => setPackageDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar pacote
          </Button>
          <Button variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Manual
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {automations.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma automação configurada.</p>
            <p className="text-xs mt-1">
              Clique em <strong>"Gerar pacote"</strong> para criar várias regras de uma vez,
              <br />ou <strong>"Manual"</strong> para configurar uma regra específica.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {automations.map((a) => {
              const addTag = tagById(a.tag_id_to_add);
              const removeTag = a.tag_id_to_remove ? tagById(a.tag_id_to_remove) : null;
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Switch
                    checked={a.is_active}
                    onCheckedChange={(v) => toggleMut.mutate({ id: a.id, is_active: v })}
                  />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">Quando</span>
                      <Badge variant="secondary">
                        {PLATFORM_CRM_TAG_EVENT_LABELS[a.event_type] ?? a.event_type}
                      </Badge>
                      <span className="text-muted-foreground">→ aplicar</span>
                      {addTag && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                          style={{ backgroundColor: `${addTag.color}20`, color: addTag.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: addTag.color }} />
                          {addTag.name}
                        </span>
                      )}
                      {addTag?.is_lifecycle_status && (
                        <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-600">
                          status do ciclo
                        </Badge>
                      )}
                      {removeTag && (
                        <>
                          <span className="text-muted-foreground">+ remover</span>
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs line-through opacity-70"
                            style={{ backgroundColor: `${removeTag.color}20`, color: removeTag.color }}
                          >
                            {removeTag.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setDialogOpen(true); }}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => deleteMut.mutate(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AutomationDialog open={dialogOpen} onOpenChange={setDialogOpen} automation={editing} tags={tags} />
      <PlatformCrmTagPackageGeneratorDialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen} />
    </Card>
  );
}

function AutomationDialog({
  open,
  onOpenChange,
  automation,
  tags,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  automation: PlatformCrmTagAutomation | null;
  tags: PlatformCrmTag[];
}) {
  const upsert = useUpsertPlatformCrmTagAutomation();

  const [eventType, setEventType] = useState<string>(automation?.event_type ?? DEFAULT_EVENT);
  const [tagToAdd, setTagToAdd] = useState<string>(automation?.tag_id_to_add ?? '');
  const [tagToRemove, setTagToRemove] = useState<string>(automation?.tag_id_to_remove ?? '');

  // Ressincroniza o form ao (re)abrir para editar/criar.
  const [lastAutomationId, setLastAutomationId] = useState<string | null | undefined>(undefined);
  if (open && automation?.id !== lastAutomationId) {
    setLastAutomationId(automation?.id ?? null);
    setEventType(automation?.event_type ?? DEFAULT_EVENT);
    setTagToAdd(automation?.tag_id_to_add ?? '');
    setTagToRemove(automation?.tag_id_to_remove ?? '');
  }

  const handleSave = () => {
    if (!tagToAdd) return;
    upsert.mutate(
      {
        id: automation?.id,
        event_type: eventType,
        tag_id_to_add: tagToAdd,
        tag_id_to_remove: tagToRemove || null,
        is_active: automation?.is_active ?? true,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{automation ? 'Editar automação' : 'Nova automação'}</DialogTitle>
          <DialogDescription>Configure quando uma etiqueta deve ser aplicada automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quando este evento acontecer</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_CRM_TAG_EVENT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/*
            TODO(produto): o original tinha um Select "Para o produto" aqui (product_id).
            O schema platform_crm_tag_automations não tem product_id — restaurar quando
            Produtos decidir a dimensão por produto.
          */}

          <div className="space-y-2">
            <Label>Aplicar a etiqueta</Label>
            <Select value={tagToAdd} onValueChange={setTagToAdd}>
              <SelectTrigger><SelectValue placeholder="Selecione uma etiqueta" /></SelectTrigger>
              <SelectContent>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color ?? '#6366f1' }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>E remover (opcional)</Label>
            <Select value={tagToRemove || 'none'} onValueChange={(v) => setTagToRemove(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não remover nada</SelectItem>
                {tags.filter((t) => t.id !== tagToAdd).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!tagToAdd || upsert.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
