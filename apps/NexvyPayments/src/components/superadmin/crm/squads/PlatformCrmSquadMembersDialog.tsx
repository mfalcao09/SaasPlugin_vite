import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Crown, User, Trash2, Loader2 } from 'lucide-react';
import {
  usePlatformCrmSquadMembersWithProfiles,
  useAddPlatformCrmSquadMember,
  useRemovePlatformCrmSquadMember,
  useUpdatePlatformCrmSquadMemberRole,
  type PlatformCrmSquad,
} from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import { usePlatformCrmSellers } from '@/components/superadmin/crm/data/usePlatformCrmSellers';

interface Props {
  squad: PlatformCrmSquad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gerencia os membros de um squad do CRM de PLATAFORMA (super_admin). Port 1:1
 * do `SquadMembersDialog` do CRM Vendus: escolha do usuário a partir da LISTA
 * (avatar/nome/email — via `usePlatformCrmSellers`) em vez de UUID cru, e toggle
 * de função Líder/Membro. Só `platform_crm_squad_members` + `profiles`. Sem
 * escopo de tenant.
 */
export function PlatformCrmSquadMembersDialog({ squad, open, onOpenChange }: Props) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const { data: members = [], isLoading } = usePlatformCrmSquadMembersWithProfiles(
    squad?.id,
  );
  const { data: sellers = [] } = usePlatformCrmSellers();
  const addMember = useAddPlatformCrmSquadMember();
  const removeMember = useRemovePlatformCrmSquadMember();
  const updateRole = useUpdatePlatformCrmSquadMemberRole();

  const availableMembers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    return sellers.filter((s) => !memberIds.has(s.id));
  }, [members, sellers]);

  if (!squad) return null;

  const handleAddMember = () => {
    if (selectedUserId && squad.id) {
      addMember.mutate(
        { squadId: squad.id, userId: selectedUserId },
        { onSuccess: () => setSelectedUserId('') },
      );
    }
  };

  const handleRemoveMember = (memberId: string) => {
    if (squad.id) removeMember.mutate({ memberId, squadId: squad.id });
  };

  const handleToggleLeader = (memberId: string, currentRole: string | null) => {
    if (squad.id) {
      updateRole.mutate({
        memberId,
        squadId: squad.id,
        role: currentRole === 'leader' ? 'member' : 'leader',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {squad.icon_url ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={squad.icon_url} />
                <AvatarFallback style={{ backgroundColor: squad.color || undefined }}>
                  {squad.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground"
                style={{ backgroundColor: squad.color || 'hsl(var(--primary))' }}
              >
                {squad.name.charAt(0)}
              </div>
            )}
            Membros do {squad.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Adicionar membro (escolha da lista) */}
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar usuário..." />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.length === 0 ? (
                  <div className="py-2 px-3 text-sm text-muted-foreground">
                    Todos os usuários já estão no time
                  </div>
                ) : (
                  availableMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {member.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{member.full_name}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleAddMember} disabled={!selectedUserId || addMember.isPending}>
              {addMember.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Lista de membros */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum membro no time
              </p>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {member.profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {member.profile?.full_name || 'Usuário'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.profile?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleLeader(member.id, member.role)}
                    >
                      {member.role === 'leader' ? (
                        <Crown className="h-4 w-4 text-amber-500" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-500" /> Líder
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> Membro
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PlatformCrmSquadMembersDialog;
