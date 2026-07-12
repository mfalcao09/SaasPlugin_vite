// AdsOAuthReturn — pouso do redirect OAuth BRANDED do Meta Ads (NexvyAds F1).
//
// Por quê: a Meta REJEITA redirect_uri em domínio cru *.supabase.co (sufixo
// público não-verificável no App Review). Por isso o redirect_uri configurado
// no app da Meta (e nas edges ads-oauth-start/ads-oauth-callback via
// ADS_OAUTH_REDIRECT_URI) é https://gestao.nexvy.tech/ads/oauth-return — o
// browser volta pra esta página da SPA em vez de bater direto na edge.
//
// Esta página só repassa code+state pra edge `ads-oauth-callback` via
// supabase.functions.invoke (POST, body JSON) — a MESMA edge que atende o
// redirect GET direto da Meta (retrocompat). A troca de code por token, a
// validação do state HMAC e a persistência continuam 100% na edge; aqui é
// só UI de transição (loading → sucesso/erro → navega pra Integrações).
//
// PÚBLICO por natureza (a edge é verify_jwt=false — a confiança vem do state
// HMAC assinado no ads-oauth-start, não de um JWT local): funciona mesmo sem
// sessão ativa no shell, então esta rota NÃO é embrulhada em ProtectedRoute
// nem SuperAdminRoute (ver App.tsx) e está isenta do HostConfinementGuard
// (ver requiredHostClass em @/lib/publicUrl).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/ui/Logo';

type ReturnState = 'loading' | 'success' | 'error';

export default function AdsOAuthReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<ReturnState>('loading');
  const [reason, setReason] = useState<string | null>(null);
  // Guarda contra dupla execução (StrictMode / re-render) — o `code` da Meta
  // é single-use; uma segunda troca falharia e mascararia o resultado real.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get('code');
    const stateToken = searchParams.get('state');
    const oauthError = searchParams.get('error') || searchParams.get('error_description');

    (async () => {
      if (oauthError || !code || !stateToken) {
        const r = oauthError ?? 'missing_code_or_state';
        setState('error');
        setReason(r);
        toast.error('Falha ao conectar Meta Ads', {
          description: oauthError ? 'Consentimento negado na Meta.' : 'Código de autorização ausente.',
        });
        setTimeout(() => navigate('/', { replace: true }), 2500);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('ads-oauth-callback', {
          body: { code, state: stateToken },
        });
        if (error) throw error;

        const connected = Boolean((data as any)?.ads_connected);
        if (!connected) {
          const r = (data as any)?.reason ?? 'unknown';
          setState('error');
          setReason(r);
          toast.error('Falha ao conectar Meta Ads', { description: r });
          setTimeout(() => navigate('/', { replace: true }), 2500);
          return;
        }

        setState('success');
        toast.success('Meta Ads conectado com sucesso');
        // Sem deep-link de URL pra aba "Integrações" dentro do shell (o
        // PlatformShell navega por estado interno, não por rota) — volta pra
        // raiz do gestao; o usuário reabre "Integrações" no menu.
        setTimeout(() => navigate('/', { replace: true }), 1200);
      } catch (e: any) {
        const msg = e?.message ?? 'exchange_failed';
        setState('error');
        setReason(msg);
        toast.error('Falha ao conectar Meta Ads', { description: msg });
        setTimeout(() => navigate('/', { replace: true }), 2500);
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <Logo size="md" />

      {state === 'loading' && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Conectando Meta Ads...</p>
        </>
      )}

      {state === 'success' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-blue-600" />
          <p className="text-sm text-muted-foreground">Meta Ads conectado. Redirecionando...</p>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Não foi possível conectar o Meta Ads.</p>
            {reason && <p className="text-xs text-muted-foreground break-all">{reason}</p>}
            <p className="text-xs text-muted-foreground">Redirecionando...</p>
          </div>
        </>
      )}
    </div>
  );
}
