import { FirstAccessSuperAdminModal } from '@/components/superadmin/FirstAccessSuperAdminModal';
import { AppTopBar } from '@/components/layout/AppTopBar';
import {
  PlatformModuleProvider,
  usePlatformModule,
  defaultModuleForHost,
} from './usePlatformModule';
import { PlatformSidebar } from './PlatformSidebar';
import { PLATFORM_MODULES } from './registry';
import { usePlatformPresenceHeartbeat } from '@/components/superadmin/crm/data/usePlatformPresenceHeartbeat';

// ─── Conteúdo (consome o Context) ───────────────────────────
function ShellContent() {
  const { activeModuleDefinition, activeNavItem } = usePlatformModule();

  // Mantém a presença do atendente super_admin viva (motor de distribuição de leads).
  usePlatformPresenceHeartbeat();

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
 * Módulo default é DERIVADO DO HOST (F5/D3): gestao.nexvy.tech (CRM do grupo
 * multiproduto) → `vendas`; gestao.nexvybeauty.com.br (produto Beauty) → `erp`.
 * O ModuleSwitcher continua livre e a escolha explícita do usuário (localStorage,
 * por-origem) prevalece sobre o default do host. Tema atual (rosa/claro).
 */
export default function PlatformShell() {
  return (
    <PlatformModuleProvider
      modules={PLATFORM_MODULES}
      defaultModule={defaultModuleForHost()}
    >
      <ShellContent />
    </PlatformModuleProvider>
  );
}
