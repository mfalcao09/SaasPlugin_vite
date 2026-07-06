import { PlatformCrmFunnelAppearanceTab } from '@/components/superadmin/crm/capture/appearance/PlatformCrmFunnelAppearanceTab';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — aba "Aparência" do QuizBuilder, DESACOPLADA do tenant.
 * Porte COMPLETO de `admin/capture/appearance/*`: delega ao editor visual portado
 * (`PlatformCrmFunnelAppearanceTab`) travado no canal `quiz`. O editor persiste
 * `appearance.quiz` em `platform_crm_capture_funnels` via `useUpdatePlatformCrmCaptureFunnel`
 * (mesma camada de dados que o placeholder anterior usava) — cores/tipografia/layout + logo
 * (sem avatar de bot no quiz) + galeria de presets + pré-visualização ao vivo, tudo funcional.
 * O atalho "Padrão inlead" agora está disponível como preset na galeria.
 *
 * `funnel` é `PlatformCrmCaptureFunnel` (sem organization_id).
 */

interface Props { funnel: PlatformCrmCaptureFunnel; }

export function PlatformCrmQuizAppearanceTab({ funnel }: Props) {
  return <PlatformCrmFunnelAppearanceTab funnel={funnel} channelLock="quiz" />;
}
