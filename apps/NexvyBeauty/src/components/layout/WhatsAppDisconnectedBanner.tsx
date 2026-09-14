import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdminView } from '@/hooks/useSuperAdminView';
import { Button } from '@/components/ui/button';
import { isGestaoHostname } from '@/lib/publicUrl';
import { readCachedBrandingSync } from '@/hooks/usePlatformBranding';

const DEFAULT_APP_URL = 'https://app.nexvybeauty.com.br';
const CONEXOES_PATH = '/conexoes';

/**
 * Banner global quando a org ativa tem instâncias Evolution, mas nenhuma
 * está `connected`.
 *
 * Superfície:
 * - App do tenant (app.*): sempre elegível.
 * - Gestão (gestao.*): só com impersonação ativa (gestor “dentro” do salão).
 *   Sem impersonação o banner não aparece — é ruído de plataforma.
 *
 * CTA: sempre a tela de Conexões do tenant (`/conexoes`), nunca `/admin`.
 */
export function WhatsAppDisconnectedBanner() {
  const { profile, roles } = useAuth();
  const { isImpersonating } = useSuperAdminView();
  const navigate = useNavigate();
  const orgId = profile?.organization_id;
  const onGestao = isGestaoHostname();

  const { data } = useQuery({
    queryKey: ['evolution-instances-health', orgId],
    queryFn: async () => {
      if (!orgId) return { total: 0, connected: 0 };
      const { data: rows } = await supabase
        .from('evolution_instances')
        .select('status')
        .eq('organization_id', orgId);
      const total = rows?.length ?? 0;
      const connected = (rows ?? []).filter((r: { status: string }) => r.status === 'connected').length;
      return { total, connected };
    },
    enabled: !!orgId && (!onGestao || isImpersonating),
    refetchInterval: (query) => {
      const d = query.state.data as { total: number; connected: number } | undefined;
      return d && d.total > 0 && d.connected === 0 ? 5_000 : 60_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 3_000,
  });

  // Gestão sem impersonação: nunca mostrar alerta de WhatsApp de tenant/master.
  if (onGestao && !isImpersonating) return null;
  if (!data || data.total === 0 || data.connected > 0) return null;

  const canManage = roles.includes('admin') || roles.includes('manager') || isImpersonating;

  const goConexoes = () => {
    // Em gestao.* a rota /conexoes não monta no PlatformShell (sem Outlet).
    // Leva ao app do operador, onde Conexões vive de verdade.
    if (onGestao) {
      const configured = (readCachedBrandingSync() as { public_app_url?: string | null } | null)
        ?.public_app_url;
      const base = (configured?.trim() || DEFAULT_APP_URL).replace(/\/+$/, '');
      window.location.assign(`${base}${CONEXOES_PATH}`);
      return;
    }
    navigate(CONEXOES_PATH);
  };

  return (
    <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-destructive">WhatsApp desconectado.</span>{' '}
        <span className="text-foreground/80">
          Mensagens automáticas de pós-venda e atendimento não estão sendo enviadas.
          {canManage ? ' Reconecte a instância para retomar.' : ' Avise um admin.'}
        </span>
      </div>
      {canManage && (
        <Button size="sm" variant="destructive" onClick={goConexoes}>
          Reconectar
        </Button>
      )}
    </div>
  );
}
