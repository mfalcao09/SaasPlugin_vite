import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, MoreVertical, Pencil, Trash2, Tag as TagIcon, Zap } from 'lucide-react';
import {
  usePlatformCrmTags,
  useCreatePlatformCrmTag,
  useUpdatePlatformCrmTag,
  useDeletePlatformCrmTag,
  type PlatformCrmTag,
  type PlatformCrmTagInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmTags';
import { PlatformCrmTagAutomationsPanel } from './PlatformCrmTagAutomationsPanel';

const PLATFORM_CRM_KEY = 'platform-crm';
const DEFAULT_COLOR = '#6366f1';

/** Paleta de cores predefinidas (swatches) — atalho rápido no form de etiqueta. */
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b',
];

interface TagForm {
  name: string;
  color: string;
  description: string;
  is_lifecycle_status: boolean;
}

const emptyForm: TagForm = {
  name: '',
  color: DEFAULT_COLOR,
  description: '',
  is_lifecycle_status: false,
};

/**
 * Contador de uso por etiqueta — conta linhas de `platform_crm_lead_tag_assignments`
 * agrupadas por tag_id. Somente tabelas platform_crm_*, sem escopo de tenant.
 */
function usePlatformCrmTagUsage() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'tag-usage'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .select('tag_id');

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ tag_id: string }>) {
        counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

/**
 * Seção "Etiquetas" do CRM de PLATAFORMA (super_admin). CRUD de etiquetas do
 * pipeline único, desacopladas do tenant — só tabelas platform_crm_*.
 */
export function PlatformCrmTagsManager() {
  const { data: tags = [], isLoading } = usePlatformCrmTags();
  const { data: usage = {} } = usePlatformCrmTagUsage();
  const createTag = useCreatePlatformCrmTag();
  const updateTag = useUpdatePlatformCrmTag();
  const deleteTag = useDeletePlatformCrmTag();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TagForm>(emptyForm);

  const filteredTags = useMemo(
    () => tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
    [tags, search],
  );

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (tag: PlatformCrmTag) => {
    setEditingId(tag.id);
    setForm({
      name: tag.name,
      color: tag.color ?? DEFAULT_COLOR,
      description: tag.description ?? '',
      is_lifecycle_status: tag.is_lifecycle_status,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    const payload: PlatformCrmTagInsert = {
      name: form.name.trim(),
      color: form.color,
      description: form.description.trim() || null,
      is_lifecycle_status: form.is_lifecycle_status,
    };

    if (editingId) {
      updateTag.mutate({ id: editingId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createTag.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Etiquetas</h2>
        <p className="text-muted-foreground">
          Classifique os contatos do funil de vendas da plataforma manualmente ou por automações de evento.
        </p>
      </div>

      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalog" className="gap-2">
            <TagIcon className="h-4 w-4" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" /> Automações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar etiqueta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Criar Etiqueta
            </Button>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filteredTags.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TagIcon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">Nenhuma etiqueta criada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredTags.map((tag) => (
                <Card key={tag.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span
                        className="inline-block h-4 w-4 rounded-full border"
                        style={{ backgroundColor: tag.color ?? DEFAULT_COLOR }}
                        aria-hidden
                      />
                      <div>
                        <p className="font-medium">{tag.name}</p>
                        {tag.description && (
                          <p className="text-sm text-muted-foreground">{tag.description}</p>
                        )}
                      </div>
                      {tag.is_lifecycle_status && (
                        <Badge variant="secondary">Status do ciclo</Badge>
                      )}
                      {tag.is_automatic && <Badge variant="outline">Automática</Badge>}
                      <Badge variant="outline">
                        {usage[tag.id] ?? 0} {usage[tag.id] === 1 ? 'uso' : 'usos'}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEdit(tag)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteTag.mutate(tag.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="automations">
          <PlatformCrmTagAutomationsPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Etiqueta' : 'Nova Etiqueta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Lead quente"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, color: c }))}
                    className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor:
                        form.color.toLowerCase() === c ? 'hsl(var(--foreground))' : 'transparent',
                    }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Status do ciclo de vida</Label>
                <p className="text-sm text-muted-foreground">
                  Marca esta etiqueta como um estágio do ciclo de vida do lead
                </p>
              </div>
              <Switch
                checked={form.is_lifecycle_status}
                onCheckedChange={(v) =>
                  setForm((prev) => ({ ...prev, is_lifecycle_status: v }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Quando aplicar esta etiqueta?"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || createTag.isPending || updateTag.isPending}
            >
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlatformCrmTagsManager;
