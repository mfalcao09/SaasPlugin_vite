import { PlatformCrmFunnelAppearanceTab } from '@/components/superadmin/crm/capture/appearance/PlatformCrmFunnelAppearanceTab';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

interface Props { funnel: PlatformCrmCaptureFunnel; }

/**
 * CRM de PLATAFORMA (super_admin) — aba "Aparência" do WidgetBuilder, DESACOPLADA do tenant.
 * Porte COMPLETO de `admin/capture/appearance/*`: delega ao editor visual portado
 * (`PlatformCrmFunnelAppearanceTab`) travado no canal `widget`. O editor persiste
 * `appearance.widget` em `platform_crm_capture_funnels` via `useUpdatePlatformCrmCaptureFunnel`
 * (mesma camada de dados que o placeholder anterior usava) — cores/tipografia/layout/marca +
 * galeria de presets + pré-visualização ao vivo, tudo funcional.
 */
export function PlatformCrmWidgetAppearanceTab({ funnel }: Props) {
  return <PlatformCrmFunnelAppearanceTab funnel={funnel} channelLock="widget" />;
}
