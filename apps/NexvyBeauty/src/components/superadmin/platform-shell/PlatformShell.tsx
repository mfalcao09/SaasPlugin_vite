import { FirstAccessSuperAdminModal } from '@/components/superadmin/FirstAccessSuperAdminModal';
import {
  PlatformModuleProvider,
  usePlatformModule,
} from './usePlatformModule';
import { PlatformSidebar } from './PlatformSidebar';
import { PLATFORM_MODULES } from './registry';
import { usePlatformPresenceHeartbeat } from '@/components/superadmin/crm/data/usePlatformPresenceHeartbeat';
import { PlatformProductProvider } from '@/contexts/PlatformProductContext';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';

// ─── Conteúdo (consome o Context) ───────────────────────────
function ShellContent() {
  const { activeNavItem } = usePlatformModule();

  // Mantém a presença do atendente super_admin viva (motor de distribuição de leads).
  usePlatformPresenceHeartbeat();

  return (
    <div className="flex min-h-screen bg-background">
      <FirstAccessSuperAdminModal />
      <PlatformSidebar />

      <main className="min-w-0 flex-1 overflow-y-auto pt-[calc(7rem+env(safe-area-inset-top))] lg:pt-[68px]">
        <WhatsAppDisconnectedBanner />
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
      {/* Seletor GLOBAL de produto (A1.3) — filtra Vendas + ERP. Envolve a
          árvore inteira (sidebar + conteúdo) para que switcher e telas
          compartilhem o mesmo activeProductId. */}
      <PlatformProductProvider>
        <ShellContent />
      </PlatformProductProvider>
    </PlatformModuleProvider>
  );
}
