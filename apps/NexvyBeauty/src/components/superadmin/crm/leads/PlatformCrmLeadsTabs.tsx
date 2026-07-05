import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, User, UserX, UsersRound, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlatformCrmLeadsTabId } from '../data/usePlatformCrmLeadsManager';

/**
 * Abas da GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin) — desacopladas do tenant.
 * Todos · Minha Carteira (assigned_to = usuário atual) · Meu Squad (squad do usuário)
 * · Sem Atendimento (assigned_to null) · Por Squad (gerencial) · Por Produto (dimensão
 * D3 restaurada). Porte 1:1 de `.vendus-src-reference/.../LeadsTabs.tsx:17-24`.
 */
interface PlatformCrmLeadsTabsProps {
  activeTab: string;
  onTabChange: (tab: PlatformCrmLeadsTabId) => void;
  stats?: {
    total: number;
    unassigned: number;
  } | null;
}

const tabs: { id: PlatformCrmLeadsTabId; label: string; icon: typeof Users }[] = [
  { id: 'all', label: 'Todos', icon: Users },
  { id: 'my-leads', label: 'Minha Carteira', icon: User },
  { id: 'my-squad', label: 'Meu Squad', icon: UsersRound },
  { id: 'unassigned', label: 'Sem Atendimento', icon: UserX },
  { id: 'by-squad', label: 'Por Squad', icon: UsersRound },
  { id: 'by-product', label: 'Por Produto', icon: Package },
];

export function PlatformCrmLeadsTabs({ activeTab, onTabChange, stats }: PlatformCrmLeadsTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as PlatformCrmLeadsTabId)}
      className="w-full"
    >
      <TabsList className="w-full h-auto flex-wrap justify-start bg-muted/40 rounded-lg p-1 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // Contador SEMPRE visível na aba "Sem Atendimento" (§3.4): 0 em muted, >0 em danger.
          const unassignedCount = tab.id === 'unassigned' ? stats?.unassigned ?? 0 : null;

          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              {unassignedCount !== null ? (
                <span
                  className={cn(
                    'h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[10px] font-semibold tabular-nums',
                    unassignedCount > 0
                      ? 'bg-red-500 text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {unassignedCount}
                </span>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
