import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Shield, User, Crown, Loader2, Search, Filter, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlatformCrmTeamMembers,
  useUpdatePlatformCrmUserRole,
  useRemovePlatformCrmTeamMember,
  type PlatformCrmTeamMember,
} from '@/components/superadmin/crm/data/usePlatformCrmTeam';
import { usePlatformCrmSquads } from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import { PlatformCrmMemberCard } from './PlatformCrmMemberCard';

type EditableRole = 'admin' | 'manager' | 'seller' | 'super_admin';

/**
 * Gestão de equipe do CRM de PLATAFORMA (super_admin) — port 1:1 do `TeamManager`
 * do CRM Vendus. Mudanças em relação ao original:
 *  - dados `platform_crm_*` / `profiles` / `user_roles` / `platform_crm_squad_members`
 *    (via os hooks próprios), sem organization_id / product_id;
 *  - filtro de PRODUTO removido (não há tabela de atribuição produto↔usuário no
 *    schema da plataforma) — restam busca + papel + squad;
 *  - atribuição de papel e remoção via RPC preservadas;
 *  - convites pendentes: mantidos como UI (stub) porque não há tabela de convites
 *    no schema `platform_crm_*`/`profiles` — ver TODO(migration) abaixo.
 */
export function PlatformCrmTeamManager() {
  const { data: members, isLoading } = usePlatformCrmTeamMembers();
  const { data: squads } = usePlatformCrmSquads();
  const updateRole = useUpdatePlatformCrmUserRole();
  const removeMember = useRemovePlatformCrmTeamMember();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [squadFilter, setSquadFilter] = useState<string>('all');

  const [editingMember, setEditingMember] = useState<PlatformCrmTeamMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<EditableRole>('seller');
  const [memberToRemove, setMemberToRemove] = useState<PlatformCrmTeamMember | null>(null);

  // Filter members
  const filteredMembers = useMemo(() => {
    if (!members) return [];

    return members.filter((member) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        member.full_name?.toLowerCase().includes(searchLower) ||
        member.email?.toLowerCase().includes(searchLower);

      // Role filter
      const memberRole = member.role || 'seller';
      const matchesRole = roleFilter === 'all' || memberRole === roleFilter;

      // Squad filter
      const memberSquadIds = member.squads.map((s) => s.id);
      const matchesSquad =
        squadFilter === 'all' ||
        (squadFilter === 'none' && member.squads.length === 0) ||
        memberSquadIds.includes(squadFilter);

      return matchesSearch && matchesRole && matchesSquad;
    });
  }, [members, search, roleFilter, squadFilter]);

  const handleEditRole = (member: PlatformCrmTeamMember) => {
    setEditingMember(member);
    setSelectedRole((member.role as EditableRole) || 'seller');
  };

  const handleSaveRole = async () => {
    if (!editingMember) return;

    try {
      await updateRole.mutateAsync({ userId: editingMember.id, role: selectedRole });
      toast.success('Papel atualizado!');
      setEditingMember(null);
    } catch {
      toast.error('Erro ao atualizar papel');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>

        {/* Filters Skeleton */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[160px]" />
          <Skeleton className="h-10 w-[180px]" />
        </div>

        {/* Members Grid Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-44" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Equipe</h2>
          <p className="text-sm text-muted-foreground">Gerencie usuários e suas permissões</p>
        </div>
        {/* TODO(migration): botão "Adicionar Usuário" — o onboarding de usuário da
            plataforma (convite/criação) ainda não tem fluxo/tabela no schema
            platform_crm_*; sem UserFormDialog equivalente. */}
      </div>

      <div className="space-y-6">
        {/* Pending Invitations (stub) */}
        {/* TODO(migration): convites pendentes — o original lia de uma tabela de
            convites (team_invitations) que NÃO existe no schema platform_crm_* /
            profiles. Mantida apenas a moldura da UI; sem dados até a migração
            criar a tabela e o hook usePlatformCrmTeamInvitations. */}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Papel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              <SelectItem value="seller">Vendedores</SelectItem>
              <SelectItem value="manager">Gestores</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="super_admin">Super Admins</SelectItem>
            </SelectContent>
          </Select>

          <Select value={squadFilter} onValueChange={setSquadFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Users className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Squad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os squads</SelectItem>
              <SelectItem value="none">Sem squad</SelectItem>
              {squads?.map((squad) => (
                <SelectItem key={squad.id} value={squad.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: squad.color || '#6366F1' }}
                    />
                    {squad.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Members Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => (
            <PlatformCrmMemberCard
              key={member.id}
              member={member}
              onEditRole={handleEditRole}
              onRemove={(m) => setMemberToRemove(m)}
            />
          ))}

          {filteredMembers.length === 0 && (
            <Card className="col-span-full bg-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">
                  {search || roleFilter !== 'all' || squadFilter !== 'all'
                    ? 'Nenhum membro encontrado'
                    : 'Nenhum membro'}
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {search || roleFilter !== 'all' || squadFilter !== 'all'
                    ? 'Tente ajustar os filtros de busca'
                    : 'Os reps de venda da plataforma aparecerão aqui quando forem vinculados a squads ou a leads.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Role Edit Dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Papel do Usuário</DialogTitle>
          </DialogHeader>

          {editingMember && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar>
                  <AvatarImage src={editingMember.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {editingMember.full_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{editingMember.full_name}</p>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {editingMember.email || 'Sem email'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Novo Papel</label>
                <Select
                  value={selectedRole}
                  onValueChange={(v: EditableRole) => setSelectedRole(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Vendedor
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-violet-500" />
                        Gestor
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-500" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="super_admin">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        Super Admin
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRole} disabled={updateRole.isPending}>
              {updateRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja apagar <strong>{memberToRemove?.full_name}</strong>{' '}
              permanentemente? Todos os dados do usuário (papel, squads, leads vinculados) serão
              removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (memberToRemove) {
                  removeMember.mutate(memberToRemove.id, {
                    onSuccess: () => {
                      toast.success('Usuário apagado com sucesso');
                      setMemberToRemove(null);
                    },
                    onError: () => {
                      toast.error('Erro ao apagar usuário');
                    },
                  });
                }
              }}
            >
              {removeMember.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
