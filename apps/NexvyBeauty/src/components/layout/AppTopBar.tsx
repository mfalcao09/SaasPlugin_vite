import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';

interface AppTopBarProps {
  title: string;
  subtitle?: string;
}

// Topbar canônica REUTILIZÁVEL (variante limpa, sem o seletor de produto do
// CRM). Deve aparecer em TODOS os módulos pós-login: marca/título à esquerda +
// "Acessar Empresa…" (OrganizationSelector) + ações globais (TopBarActions).
// O CRM usa a Header própria (que adiciona o seletor de produto).
export function AppTopBar({ title, subtitle }: AppTopBarProps) {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <WhatsAppDisconnectedBanner />
      <div className="flex items-center justify-between h-16 px-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
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
