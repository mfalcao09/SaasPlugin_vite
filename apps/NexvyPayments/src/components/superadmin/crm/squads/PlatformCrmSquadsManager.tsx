import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Loader2, UsersRound, Pencil, Trash2, Search } from 'lucide-react';
import {
  usePlatformCrmSquads,
  useCreatePlatformCrmSquad,
  useUpdatePlatformCrmSquad,
  useDeletePlatformCrmSquad,
  type PlatformCrmSquad,
  type PlatformCrmSquadInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import { PlatformCrmSquadMembersDialog } from '@/components/superadmin/crm/squads/PlatformCrmSquadMembersDialog';
import { PlatformCrmSquadPerformanceCard } from '@/components/superadmin/crm/squads/PlatformCrmSquadPerformanceCard';
import { PlatformCrmSquadIconUpload } from '@/components/superadmin/crm/squads/PlatformCrmSquadIconUpload';
import { PlatformCrmSquadDistributionConfig } from '@/components/superadmin/crm/squads/PlatformCrmSquadDistributionConfig';

const SQUAD_COLORS = [
  { name: 'Roxo', value: '#6366F1' },
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Amarelo', value: '#F59E0B' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Ciano', value: '#06B6D4' },
  { name: 'Laranja', value: '#F97316' },
];

const DEFAULT_COLOR = '#6366F1';

interface SquadForm {
  name: string;
  description: string;
  color: string;
  icon_url: string | undefined;
}

const emptyForm: SquadForm = {
  name: '',
  description: '',
  color: DEFAULT_COLOR,
  icon_url: undefined,
};

/**
 * Seção "Times/Equipes" do CRM de PLATAFORMA (super_admin). Port 1:1 do
 * `SquadManager` do CRM Vendus: grid de cards de performance (vendas/deals/
 * conversão/meta/top vendedor) + config de auto-dispatch por squad, com CRUD e
 * gerenciamento de membros. Só `platform_crm_*` + `profiles`. Sem tenant.
 *
 * TODO(migration): "produto associado" ao squad — a coluna product_id não existe
 * em `platform_crm_sales_squads` (o original tinha o select de produto aqui).
 */
export function PlatformCrmSquadsManager() {
  const { data: squads = [], isLoading } = usePlatformCrmSquads();
  const createSquad = useCreatePlatformCrmSquad();
  const updateSquad = useUpdatePlatformCrmSquad();
  const deleteSquad = useDeletePlatformCrmSquad();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSquad, setEditingSquad] = useState<PlatformCrmSquad | null>(null);
  const [form, setForm] = useState<SquadForm>(emptyForm);

  const [membersSquad, setMembersSquad] = useState<PlatformCrmSquad | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  const filteredSquads = useMemo(
    () => squads.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [squads, search],
  );

  const handleOpenCreate = () => {
    setEditingSquad(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (squad: PlatformCrmSquad) => {
    setEditingSquad(squad);
    setForm({
      name: squad.name,
      description: squad.description ?? '',
      color: squad.color ?? DEFAULT_COLOR,
      icon_url: squad.icon_url ?? undefined,
    });
    setDialogOpen(true);
  };

  const handleOpenMembers = (squad: PlatformCrmSquad) => {
    setMembersSquad(squad);
    setMembersOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;

    const payload: PlatformCrmSquadInsert = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      icon_url: form.icon_url ?? null,
    };

    if (editingSquad) {
      updateSquad.mutate(
        { id: editingSquad.id, ...payload },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createSquad.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este time?')) {
      deleteSquad.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-primary" />
            Times / Equipes
          </h2>
          <p className="text-muted-foreground">
            Organize os vendedores da plataforma em times de vendas
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Time
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar time..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredSquads.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <UsersRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Nenhum time criado</h3>
            <p className="text-muted-foreground mb-4">
              Crie times para organizar os vendedores da plataforma
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Time
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSquads.map((squad) => (
            <div key={squad.id} className="space-y-3">
              <div className="relative group">
                <PlatformCrmSquadPerformanceCard
                  squad={squad}
                  onManageMembers={() => handleOpenMembers(squad)}
                />
                {/* Editar/Excluir on hover */}
                <div className="absolute top-4 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleOpenEdit(squad)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(squad.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Auto-Dispatch */}
              <PlatformCrmSquadDistributionConfig squadId={squad.id} />
            </div>
          ))}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSquad ? 'Editar Time' : 'Novo Time'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Time</Label>
              <Input
                id="name"
                placeholder="Ex: Time Alpha"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o time..."
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            <PlatformCrmSquadIconUpload
              currentIcon={form.icon_url}
              onIconChange={(url) => setForm((prev) => ({ ...prev, icon_url: url || undefined }))}
              squadName={form.name}
              color={form.color}
            />

            <div className="space-y-2">
              <Label>Cor do Time</Label>
              <div className="flex flex-wrap gap-2">
                {SQUAD_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full transition-all ${
                      form.color === color.value
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setForm((prev) => ({ ...prev, color: color.value }))}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* TODO(migration): "Produto Associado" — product_id inexistente em
                platform_crm_sales_squads. O select de produto do original fica de
                fora até existir a coluna/tabela de vínculo. */}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || createSquad.isPending || updateSquad.isPending}
            >
              {createSquad.isPending || updateSquad.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editingSquad ? (
                'Salvar'
              ) : (
                'Criar Time'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Membros */}
      <PlatformCrmSquadMembersDialog
        squad={membersSquad}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </div>
  );
}

export default PlatformCrmSquadsManager;
