import { PlatformCrmFunnelAppearanceTab } from '@/components/superadmin/crm/capture/appearance/PlatformCrmFunnelAppearanceTab';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

interface Props { funnel: PlatformCrmCaptureFunnel; }

/**
 * CRM de PLATAFORMA (super_admin) — aba "Aparência" do ChatBotBuilder, DESACOPLADA do tenant.
 * Porte COMPLETO de `admin/capture/chatbot/ChatBotAppearanceTab`: delega ao editor visual
 * portado (`PlatformCrmFunnelAppearanceTab`) travado no canal `chat`. O editor persiste
 * `appearance.chat` em `platform_crm_capture_funnels` via `useUpdatePlatformCrmCaptureFunnel` —
 * cores/tipografia/layout/marca + galeria de presets + pré-visualização ao vivo, tudo funcional.
 */
export function PlatformCrmChatBotAppearanceTab({ funnel }: Props) {
  return <PlatformCrmFunnelAppearanceTab funnel={funnel} channelLock="chat" />;
}
