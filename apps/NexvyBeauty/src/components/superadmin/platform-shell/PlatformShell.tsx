import { FirstAccessSuperAdminModal } from '@/components/superadmin/FirstAccessSuperAdminModal';
import { AppTopBar } from '@/components/layout/AppTopBar';
import {
  PlatformModuleProvider,
  usePlatformModule,
} from './usePlatformModule';
import { PlatformSidebar } from './PlatformSidebar';
import { PLATFORM_MODULES } from './registry';

// ─── Conteúdo (consome o Context) ───────────────────────────
function ShellContent() {
  const { activeModuleDefinition, activeNavItem } = usePlatformModule();

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
          {activeNavItem ? activeNavItem.render() : null}
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
