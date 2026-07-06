import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Shield, UserCog, User, Crown, Mail, MoreVertical, Trash2 } from 'lucide-react';
import type { PlatformCrmTeamMember } from '@/components/superadmin/crm/data/usePlatformCrmTeam';

/**
 * Cartão de membro do CRM de PLATAFORMA (super_admin) — port 1:1 do `MemberCard`
 * do CRM Vendus. Mudanças: dados `platform_crm_*`/`profiles`/`user_roles`
 * (member.role é string simples, não member.roles[]); sem produtos por membro
 * (não há tabela de atribuição produto↔usuário no schema da plataforma) e sem
 * permissões por membro. Mantém avatar/nome/email/papel + squad.
 */

const roleConfig = {
  super_admin: {
    label: 'Super Admin',
    icon: Crown,
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  admin: { label: 'Admin', icon: Shield, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  manager: {
    label: 'Gestor',
    icon: UserCog,
    color: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  },
  seller: { label: 'Vendedor', icon: User, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
} as const;

interface PlatformCrmMemberCardProps {
  member: PlatformCrmTeamMember;
  onEditRole: (member: PlatformCrmTeamMember) => void;
  onRemove: (member: PlatformCrmTeamMember) => void;
}

export function PlatformCrmMemberCard({ member, onEditRole, onRemove }: PlatformCrmMemberCardProps) {
  const config = roleConfig[member.role as keyof typeof roleConfig] || roleConfig.seller;
  const Icon = config.icon;
  const squad = member.squads[0];

  return (
    <Card className="bg-card hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarImage src={member.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {member.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-foreground truncate">{member.full_name}</h3>
                {!member.is_active && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                    Inativo
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{member.email || 'Sem email'}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Role Badge */}
                <Badge variant="outline" className={config.color}>
                  <Icon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>

                {/* Squad Badge */}
                {squad && (
                  <Badge
                    variant="outline"
                    className="gap-1"
                    style={{
                      backgroundColor: `${squad.color}15`,
                      borderColor: `${squad.color}40`,
                    }}
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: squad.color || '#6366F1' }}
                    />
                    <span style={{ color: squad.color || undefined }}>{squad.name}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditRole(member)}>
                <UserCog className="h-4 w-4 mr-2" />
                Alterar Papel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRemove(member)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Apagar Usuário
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
