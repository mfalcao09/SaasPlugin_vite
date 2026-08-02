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
import { Card, CardContent } from '@/components/ui/card';
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

/** Recupera a mensagem de negócio que a edge devolveu.
 *
 * ⚠️ `supabase.functions.invoke` só preenche `data` em 2xx. Em 409/403/503 ele
 * devolve `FunctionsHttpError` com **`data` NULO**, e o corpo da resposta — onde
 * vivem as frases que dizem ao tenant o que fazer ("este número já está
 * conectado a outra conta", "seu plano inclui N conexões…") — só existe em
 * `error.context`, que é a `Response` crua.
 *
 * A versão anterior fazia `error ?? data?.error` e caía sempre no texto
 * genérico: as mensagens existiam no servidor, estavam corretas, e NENHUMA
 * chegava à tela. O `error.message` do próprio SDK também não serve — é
 * "Edge Function returned a non-2xx status code", que não ajuda ninguém.
 */
async function serverMessage(error: unknown, data: unknown): Promise<string | null> {
  const inline = (data as { error?: string } | null)?.error;
  if (inline) return inline;

  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;

  try {
    const body = await ctx.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch (e) {
    // Corpo não-JSON (proxy, gateway, 502). Devolver null é honesto: o chamador
    // mostra o texto genérico em vez de inventar uma causa. O log existe para
    // quem for depurar, não como tratamento — o usuário já foi avisado.
    console.warn('[embedded-signup] resposta de erro sem corpo JSON', e);
    return null;
  }
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

        if (error || (data as { error?: string } | null)?.error) {
          const message = await serverMessage(error, data);
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
        // ⚠️ NÃO AFERIDO. Este `extras` veio da mesma anotação que trazia um
        // config_id que se provou INEXISTENTE — a procedência errou no campo
        // vizinho, então nada aqui vale como medição.
        //
        // Forma que RODA em produção (Intentus, mesmo Embedded Signup):
        //   extras: { setup: {}, featureType: 'whatsapp_embedded_signup',
        //             sessionInfoVersion: 2 }
        // Duas formas, uma só testada em campo — e não é esta. Se o fluxo
        // abrir mas o postMessage não entregar `phone_number_id`/`waba_id`,
        // é AQUI que se olha primeiro.
        extras: { sessionInfoVersion: 3, version: 'v4' },
      },
    );
  }, [onConnected]);

  // Sem as env vars de build, o self-service não existe nesta instalação — e
  // quem SABE disso é este componente. Por isso ele INFORMA, em vez de sumir.
  //
  // A versão anterior era `return null`, e o custo não era estético:
  //   • o painel tinha que ADIVINHAR este estado para escrever o texto certo,
  //     o que criava uma regra de ordem entre dois commits ("card só depois
  //     das env vars"). Regra de ordem é coisa que alguém erra;
  //   • ausência silenciosa é indistinguível de "o componente não subiu no
  //     bundle" — e um deploy sem env var mandaria alguém depurar um merge
  //     que está correto.
  //
  // Com a mensagem, a tela é honesta nos dois estados por construção: quem
  // decide informa, o painel não precisa saber, e a ordem dos commits deixa
  // de importar. (Desenho proposto pelo nó 1 — CUTOVER Studio Flor.)
  if (!APP_ID || !CONFIG_ID) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            A conexão automática com a Meta ainda não está habilitada nesta
            instalação. Fale com o suporte para conectar seu número oficial.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Button onClick={handleClick} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {busy ? 'Conectando…' : 'Conectar meu WhatsApp'}
    </Button>
  );
}

export default MetaEmbeddedSignupButton;
