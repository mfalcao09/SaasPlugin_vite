// Embedded Signup da Meta — o dono do salão conecta o PRÓPRIO WhatsApp sem
// colar token, app secret nem WABA ID.
//
// Vive no slot que o painel de conexões renderiza na aba "WhatsApp Oficial
// (Meta)". Se este arquivo não existir, a aba mostra só o caminho manual — por
// isso ele é auto-contido e não altera o painel.
//
// ⚠️ POR QUE JS SDK E NÃO REDIRECT: o fluxo de Meta Ads deste repo
// (`ads-oauth-start` + `_shared/meta-ads-oauth.ts`) usa redirect. Aqui não dá:
// `phone_number_id` e `waba_id` chegam por `postMessage` (evento
// `WA_EMBEDDED_SIGNUP`), que o redirect não entrega. A divergência é técnica,
// não estilística.
//
// ⚠️ O `code` EXPIRA EM 30 SEGUNDOS. Ele vai direto para a edge function, que
// troca de forma síncrona. Nada de fila, retry ou "tentaremos mais tarde": se
// falhar, o caminho é refazer o login. Nenhum token trafega pelo front.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const FB_SDK_ID = 'facebook-jssdk';
const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

const APP_ID = import.meta.env.VITE_META_WHATSAPP_APP_ID as string | undefined;
const CONFIG_ID = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string | undefined;
const GRAPH_VERSION = (import.meta.env.VITE_META_GRAPH_VERSION as string | undefined) ?? 'v21.0';

/** Dados que o fluxo da Meta devolve por postMessage ao concluir. */
interface SignupPayload {
  phone_number_id: string;
  waba_id: string;
  business_name?: string;
}

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();

    const finish = () => {
      // `autoLogAppEvents` fica off: não queremos telemetria da Meta disparando
      // a partir do painel do tenant sem que ele tenha pedido isso.
      window.FB?.init({ appId, autoLogAppEvents: false, xfbml: false, version });
      resolve();
    };

    const existing = document.getElementById(FB_SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      window.fbAsyncInit = finish;
      return;
    }

    const script = document.createElement('script');
    script.id = FB_SDK_ID;
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => reject(new Error('sdk_load_failed'));
    window.fbAsyncInit = finish;
    document.body.appendChild(script);
  });
}

interface Props {
  /** Chamado após a conexão ser gravada, para o painel recarregar sua lista. */
  onConnected?: () => void;
}

export function MetaEmbeddedSignupButton({ onConnected }: Props) {
  const [busy, setBusy] = useState(false);
  /** Preenchido pelo postMessage; lido no callback do FB.login. */
  const signupRef = useRef<SignupPayload | null>(null);

  // O evento de conclusão e o callback do FB.login são assíncronos e
  // independentes: a Meta manda os ids por postMessage e o code pelo callback.
  // Precisamos dos dois, então o listener guarda o que chegou primeiro.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data?.event === 'FINISH' || data?.data?.phone_number_id) {
          signupRef.current = {
            phone_number_id: String(data.data?.phone_number_id ?? ''),
            waba_id: String(data.data?.waba_id ?? ''),
            business_name: data.data?.business_name ?? undefined,
          };
        }
      } catch {
        // A Meta também emite mensagens não-JSON nesse canal. Ignorar é o
        // comportamento correto — não é erro nosso e não deve virar ruído.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleClick = useCallback(async () => {
    if (!APP_ID || !CONFIG_ID) return;
    setBusy(true);
    signupRef.current = null;

    try {
      await loadFacebookSdk(APP_ID, GRAPH_VERSION);
    } catch {
      setBusy(false);
      toast.error('Não foi possível carregar o conector da Meta. Verifique sua conexão e tente de novo.');
      return;
    }

    window.FB?.login(
      async (response) => {
        const code = response?.authResponse?.code;
        const signup = signupRef.current;

        if (!code) {
          setBusy(false);
          // Sem code: o usuário fechou a janela ou negou. Não é falha do sistema.
          toast.info('Conexão cancelada.');
          return;
        }
        if (!signup?.phone_number_id || !signup?.waba_id) {
          setBusy(false);
          toast.error('A Meta não retornou o número. Tente conectar novamente.');
          return;
        }

        // Direto para o servidor: o code vale 30 segundos.
        const { data, error } = await supabase.functions.invoke(
          'whatsapp-embedded-signup-exchange',
          { body: { code, ...signup } },
        );
        setBusy(false);

        const failure = error ?? (data as { error?: string } | null)?.error;
        if (failure) {
          const message = typeof failure === 'string' ? failure : (data as { error?: string })?.error;
          toast.error(message || 'Não foi possível concluir a conexão. Tente novamente.');
          return;
        }

        toast.success('WhatsApp conectado com sucesso!');
        onConnected?.();
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        // Contrato da configuração "Nexvy" (config_id 1140027898257109).
        // NÃO é o `{ setup: {} }` que aparece na doc genérica da Meta.
        extras: { sessionInfoVersion: 3, version: 'v4' },
      },
    );
  }, [onConnected]);

  // Sem configuração, o botão não existe — o painel segue oferecendo só o
  // caminho manual. Melhor ausente do que presente e quebrado.
  if (!APP_ID || !CONFIG_ID) return null;

  return (
    <Button onClick={handleClick} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {busy ? 'Conectando…' : 'Conectar meu WhatsApp'}
    </Button>
  );
}

export default MetaEmbeddedSignupButton;
