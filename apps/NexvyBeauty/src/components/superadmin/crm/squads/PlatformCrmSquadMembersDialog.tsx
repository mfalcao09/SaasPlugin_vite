import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, Users } from 'lucide-react';
import {
  usePlatformCrmSquadMembers,
  useAddPlatformCrmSquadMember,
  useRemovePlatformCrmSquadMember,
  type PlatformCrmSquad,
} from '@/components/superadmin/crm/data/usePlatformCrmSquads';

interface Props {
  squad: PlatformCrmSquad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gerencia os membros de um squad do CRM de PLATAFORMA (super_admin) — add/remove
 * via `platform_crm_squad_members`. Membros são identificados por user_id (UUID),
 * sem depender de nenhuma tabela do tenant.
 */
export function PlatformCrmSquadMembersDialog({ squad, open, onOpenChange }: Props) {
  const { data: members = [], isLoading } = usePlatformCrmSquadMembers(squad?.id);
  const addMember = useAddPlatformCrmSquadMember();
  const removeMember = useRemovePlatformCrmSquadMember();

  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');

  const handleAdd = () => {
    if (!squad || !userId.trim()) return;
    addMember.mutate(
      { squadId: squad.id, userId: userId.trim(), role: role.trim() || 'member' },
      {
        onSuccess: () => {
          setUserId('');
          setRole('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Membros — {squad?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Adicionar membro</Label>
            <div className="flex gap-2">
              <Input
                placeholder="user_id (UUID)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="font-mono text-sm"
              />
              <Input
                placeholder="Função (ex: closer)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="max-w-[140px]"
              />
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!userId.trim() || addMember.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : members.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum membro neste time</p>
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs truncate">{member.user_id}</span>
                    {member.role && <Badge variant="outline">{member.role}</Badge>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() =>
                      squad &&
                      removeMember.mutate({ memberId: member.id, squadId: squad.id })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PlatformCrmSquadMembersDialog;
