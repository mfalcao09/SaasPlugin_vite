import { HeaderProductSwitcher } from '@/components/layout/HeaderProductSwitcher';
import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface HeaderProps {
  title: string;
  subtitle?: string;
  onSelectLead?: (leadId: string) => void;
  onSelectProduct?: (productId: string) => void;
  assignedProducts?: DBProduct[];
  selectedProduct?: DBProduct | null;
  onSelectProductObject?: (product: DBProduct) => void;
}

// Topbar do CRM: mesma barra global (OrganizationSelector + TopBarActions) das
// demais áreas, MAIS o seletor de produto, que é específico do CRM. As ações
// globais vêm de TopBarActions (fonte única compartilhada com a AppTopBar).
export function Header({
  title,
  subtitle,
  assignedProducts = [],
  selectedProduct = null,
  onSelectProductObject,
}: HeaderProps) {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <WhatsAppDisconnectedBanner />
      <div className="flex items-center justify-between h-16 px-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Impersonação de empresa (super admin) — porte do Intentus */}
          <OrganizationSelector />

          {/* Product Switcher — específico do CRM */}
          {assignedProducts.length > 0 && onSelectProductObject && (
            <HeaderProductSwitcher
              products={assignedProducts}
              selectedProduct={selectedProduct}
              onSelectProduct={onSelectProductObject}
            />
          )}

          {/* Ações globais (ajuda, novidades, tema, status, notificações, perfil) */}
          <TopBarActions />
        </div>
      </div>
    </header>
  );
}
