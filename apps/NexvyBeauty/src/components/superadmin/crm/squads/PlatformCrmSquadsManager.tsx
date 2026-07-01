import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Search, MoreVertical, Pencil, Trash2, Users } from 'lucide-react';
import {
  usePlatformCrmSquads,
  useCreatePlatformCrmSquad,
  useUpdatePlatformCrmSquad,
  useDeletePlatformCrmSquad,
  type PlatformCrmSquad,
  type PlatformCrmSquadInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import { PlatformCrmSquadMembersDialog } from '@/components/superadmin/crm/squads/PlatformCrmSquadMembersDialog';

const DEFAULT_COLOR = '#0ea5e9';

interface SquadForm {
  name: string;
  description: string;
  color: string;
  leader_id: string;
  is_active: boolean;
}

const emptyForm: SquadForm = {
  name: '',
  description: '',
  color: DEFAULT_COLOR,
  leader_id: '',
  is_active: true,
};

/**
 * Seção "Times/Equipes" do CRM de PLATAFORMA (super_admin). CRUD de squads de
 * vendas + gerenciamento de membros — só tabelas platform_crm_sales_squads e
 * platform_crm_squad_members. Sem escopo de tenant.
 */
export function PlatformCrmSquadsManager() {
  const { data: squads = [], isLoading } = usePlatformCrmSquads();
  const createSquad = useCreatePlatformCrmSquad();
  const updateSquad = useUpdatePlatformCrmSquad();
  const deleteSquad = useDeletePlatformCrmSquad();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SquadForm>(emptyForm);

  const [membersSquad, setMembersSquad] = useState<PlatformCrmSquad | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  const filteredSquads = useMemo(
    () => squads.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [squads, search],
  );

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (squad: PlatformCrmSquad) => {
    setEditingId(squad.id);
    setForm({
      name: squad.name,
      description: squad.description ?? '',
      color: squad.color ?? DEFAULT_COLOR,
      leader_id: squad.leader_id ?? '',
      is_active: squad.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleOpenMembers = (squad: PlatformCrmSquad) => {
    setMembersSquad(squad);
    setMembersOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    const payload: PlatformCrmSquadInsert = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      leader_id: form.leader_id.trim() || null,
      is_active: form.is_active,
    };

    if (editingId) {
      updateSquad.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createSquad.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Times / Equipes</h2>
          <p className="text-muted-foreground">
            Organize os vendedores da plataforma em times de vendas
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Criar Time
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

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filteredSquads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhum time criado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredSquads.map((squad) => (
            <Card key={squad.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <span
                    className="inline-block h-4 w-4 rounded-full border shrink-0"
                    style={{ backgroundColor: squad.color ?? DEFAULT_COLOR }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{squad.name}</p>
                    {squad.leader_id && (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        Líder: {squad.leader_id}
                      </p>
                    )}
                  </div>
                  {squad.is_active === false ? (
                    <Badge variant="outline">Inativo</Badge>
                  ) : (
                    <Badge variant="secondary">Ativo</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleOpenMembers(squad)}
                  >
                    <Users className="h-4 w-4" /> Membros
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEdit(squad)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteSquad.mutate(squad.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Time' : 'Novo Time'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Time Alpha"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
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
            <div className="space-y-2">
              <Label>Líder (user_id — opcional)</Label>
              <Input
                placeholder="UUID do líder"
                value={form.leader_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, leader_id: e.target.value }))
                }
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Times inativos não recebem distribuição de leads
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_active: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Objetivo ou território deste time"
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
              disabled={!form.name.trim() || createSquad.isPending || updateSquad.isPending}
            >
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlatformCrmSquadMembersDialog
        squad={membersSquad}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </div>
  );
}

export default PlatformCrmSquadsManager;
