import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { PlatformCrmEvolutionInstancesPanel } from './PlatformCrmEvolutionInstancesPanel';
import { PlatformCrmMetaWhatsAppConnectionsPanel } from './PlatformCrmMetaWhatsAppConnectionsPanel';
import { PlatformCrmInstagramConnectionsPanel } from './PlatformCrmInstagramConnectionsPanel';
import { PlatformCrmNewConnectionDialog, type PlatformCrmConnectionProvider } from './PlatformCrmNewConnectionDialog';

/**
 * "Suas Conexões" do CRM de PLATAFORMA (super_admin) — porte 1:1 do
 * `UnifiedConnectionsPanel.tsx` do CRM Vendus.
 *
 * Diferenças do original (desacoplamento + operação):
 *   • SEM gate de limite por plano — o operador é ILIMITADO. Nada de
 *     `useOrganizationEffectivePlan` / `max_connections` / badge de uso / upgrade.
 *   • O picker mostra os 3 providers sempre habilitados (a tela é real).
 *   • Tudo consome `platform_crm_*` via os hooks/painéis desacoplados.
 */
export function PlatformCrmConnectionsPanel() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openEvolutionCreate, setOpenEvolutionCreate] = useState(false);
  const [openMetaWizard, setOpenMetaWizard] = useState(false);
  const [openIgWizard, setOpenIgWizard] = useState(false);

  const handleSelect = (provider: PlatformCrmConnectionProvider) => {
    if (provider === 'evolution') setOpenEvolutionCreate(true);
    else if (provider === 'meta_whatsapp') setOpenMetaWizard(true);
    else if (provider === 'meta_instagram') setOpenIgWizard(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Suas Conexões</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os canais conectados (WhatsApp via QR, WhatsApp Oficial Meta e Instagram).
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova conexão
        </Button>
      </div>

      <PlatformCrmEvolutionInstancesPanel
        hideHeader
        openCreate={openEvolutionCreate}
        onCloseCreate={() => setOpenEvolutionCreate(false)}
      />

      <PlatformCrmMetaWhatsAppConnectionsPanel
        hideHeader
        openWizard={openMetaWizard}
        onCloseWizard={() => setOpenMetaWizard(false)}
      />

      <PlatformCrmInstagramConnectionsPanel
        hideHeader
        openWizard={openIgWizard}
        onCloseWizard={() => setOpenIgWizard(false)}
      />

      <PlatformCrmNewConnectionDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
}
