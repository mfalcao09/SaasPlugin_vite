// Pouso do redirect Instagram Login (app NEXVY - IGLOG).
// redirect_uri: https://app.nexvybeauty.com.br/instagram/oauth-return
// A SPA repassa code+state para instagram-login-oauth-callback (JWT + HMAC).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/ui/Logo';
import { INSTAGRAM_LOGIN_APP_ID } from '@/lib/instagramLoginApp';
import { notifyInstagramOAuthOpener } from '@/lib/instagramOAuthPopup';

type ReturnState = 'loading' | 'success' | 'error';

function finishReturn(
  navigate: ReturnType<typeof useNavigate>,
  outcome: { ok: true } | { ok: false; error: string },
  delayMs: number,
) {
  if (notifyInstagramOAuthOpener(outcome)) return;
  setTimeout(() => navigate('/conexoes', { replace: true }), delayMs);
}

export default function InstagramOAuthReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<ReturnState>('loading');
  const [reason, setReason] = useState<string | null>(null);
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
        const error = oauthError ? 'Consentimento negado no Instagram.' : 'Código de autorização ausente.';
        if (!window.opener) {
          toast.error('Falha ao conectar Instagram', { description: error });
        }
        finishReturn(navigate, { ok: false, error }, 2500);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('instagram-login-oauth-callback', {
          body: { code, state: stateToken },
        });
        if (error) throw error;

        const connected = Boolean((data as { ig_connected?: boolean } | null)?.ig_connected);
        if (!connected) {
          const r = (data as { reason?: string } | null)?.reason ?? 'unknown';
          setState('error');
          setReason(r);
          if (!window.opener) {
            toast.error('Falha ao conectar Instagram', { description: r });
          }
          finishReturn(navigate, { ok: false, error: r }, 2500);
          return;
        }

        setState('success');
        if (!window.opener) {
          toast.success('Instagram conectado com sucesso');
        }
        finishReturn(navigate, { ok: true }, 1200);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'exchange_failed';
        setState('error');
        setReason(msg);
        if (!window.opener) {
          toast.error('Falha ao conectar Instagram', { description: msg });
        }
        finishReturn(navigate, { ok: false, error: msg }, 2500);
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col items-center justify-center gap-6 p-4 text-center"
      data-instagram-login-app-id={INSTAGRAM_LOGIN_APP_ID ?? ''}
    >
      <Logo size="md" />

      {state === 'loading' && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Conectando Instagram...</p>
        </>
      )}

      {state === 'success' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-pink-600" />
          <p className="text-sm text-muted-foreground">
            {window.opener ? 'Instagram conectado.' : 'Instagram conectado. Redirecionando...'}
          </p>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Não foi possível conectar o Instagram.</p>
            {reason && <p className="text-xs text-muted-foreground break-all">{reason}</p>}
            {!window.opener && (
              <p className="text-xs text-muted-foreground">Redirecionando...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
