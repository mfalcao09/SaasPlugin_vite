import { FirstAccessSuperAdminModal } from '@/components/superadmin/FirstAccessSuperAdminModal';
import { AppTopBar } from '@/components/layout/AppTopBar';
import {
  PlatformModuleProvider,
  usePlatformModule,
} from './usePlatformModule';
import { PlatformSidebar } from './PlatformSidebar';
import { PLATFORM_MODULES } from './registry';
import { usePlatformPresenceHeartbeat } from '@/components/superadmin/crm/data/usePlatformPresenceHeartbeat';
import {
  ActiveProductProvider,
  ActiveProductSwitcher,
} from '@/components/superadmin/crm/products/ProductContext';

// ─── Conteúdo (consome o Context) ───────────────────────────
function ShellContent() {
  const { activeModuleDefinition, activeNavItem } = usePlatformModule();

  // Mantém a presença do atendente super_admin viva (motor de distribuição de leads).
  usePlatformPresenceHeartbeat();

  // Módulo Vendas → produto ativo GLOBAL (Model A / D3 F2). O provider envolve
  // TODAS as telas do Vendas para que o switcher no topo re-filtre todas de uma
  // vez. Módulo ERP fica intocado (fronteira D3: não mexer no ERP).
  const isVendas = activeModuleDefinition.id === 'vendas';

  const content = activeNavItem ? activeNavItem.render() : null;

  return (
    <div className="flex min-h-screen bg-background">
      <FirstAccessSuperAdminModal />
      <PlatformSidebar />

      <main className="min-w-0 flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] lg:pt-0">
        <div className="hidden lg:block">
          <AppTopBar
            title={activeNavItem?.label ?? activeModuleDefinition.label}
            subtitle={activeModuleDefinition.label}
          />
        </div>
        <div className="p-4 sm:p-6">
          {isVendas ? (
            <ActiveProductProvider>
              {/* Switcher do produto ativo GLOBAL — topo do CRM (D3 F2). Com 1
                  produto vira label travada; oculto com 0 produtos. */}
              <div className="mb-4 flex items-center justify-end empty:hidden">
                <ActiveProductSwitcher />
              </div>
              {content}
            </ActiveProductProvider>
          ) : (
            content
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * PlatformShell — raiz da SHELL MODULAR do super-admin.
 *
 * Renderiza header (ModuleSwitcher embutido na sidebar) + sidebar dirigida
 * pelo módulo ativo + conteúdo. Pronta para ser montada na rota do gestao.*.
 *
 * Módulo default = `erp` (o super-admin de sempre). ModuleSwitcher alterna
 * para `vendas` (CRM da plataforma). Tema atual (rosa/claro) — sem tema escuro.
 */
export default function PlatformShell() {
  return (
    <PlatformModuleProvider modules={PLATFORM_MODULES} defaultModule="erp">
      <ShellContent />
    </PlatformModuleProvider>
  );
}
