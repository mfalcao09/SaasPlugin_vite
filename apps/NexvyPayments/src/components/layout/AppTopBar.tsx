import { type ReactNode } from 'react';
import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';

interface AppTopBarProps {
  title: string;
  subtitle?: string;
  /** slot à esquerda do título — ex: o SidebarTrigger do UnifiedShell (Onda 1) */
  leading?: ReactNode;
}

// Topbar canônica REUTILIZÁVEL (variante limpa, sem o seletor de produto do
// CRM). Deve aparecer em TODOS os módulos pós-login: marca/título à esquerda +
// "Acessar Empresa…" (OrganizationSelector) + ações globais (TopBarActions).
// O CRM usa a Header própria (que adiciona o seletor de produto).
export function AppTopBar({ title, subtitle, leading }: AppTopBarProps) {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <WhatsAppDisconnectedBanner />
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-2 min-w-0">
          {leading}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Impersonação de empresa (super admin) — porte do Intentus */}
          <OrganizationSelector />
          <TopBarActions />
        </div>
      </div>
    </header>
  );
}
