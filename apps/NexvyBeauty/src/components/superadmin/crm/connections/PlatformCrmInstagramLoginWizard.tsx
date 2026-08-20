// Instagram no gestao via Facebook Login for Business.
// Stepper visível: login → selecionar Página/conta existente → concluído.
// Sem campos de token/secret. Ativa com platform-instagram-connect.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Instagram, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { serverMessage } from '@/components/admin/integrations/channels/edgeError';
import {
  META_APP_ID as APP_ID,
  META_GRAPH_VERSION as GRAPH_VERSION,
} from '@/components/admin/integrations/channels/selfService';
import {
  useDraftPlatformCrmInstagramConnection,
  useSavePlatformCrmInstagramConnection,
} from '@/components/superadmin/crm/data/usePlatformCrmInstagram';

const FB_SDK_ID = 'facebook-jssdk';
const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const IG_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_basic',
  'instagram_manage_messages',
  'business_management',
].join(',');

type Step = 'login' | 'select' | 'done';
const STEPS: Step[] = ['login', 'select', 'done'];

interface IgChoice {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igId: string;
  igUsername: string;
}

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string; accessToken?: string } }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error('sdk_timeout'));
    }, 15_000);
    window.fbAsyncInit = () => {
      window.clearTimeout(timer);
      window.FB?.init({ appId, autoLogAppEvents: false, xfbml: false, version });
      resolve();
    };
    if (!document.getElementById(FB_SDK_ID)) {
      const script = document.createElement('script');
      script.id = FB_SDK_ID;
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        window.clearTimeout(timer);
        sdkPromise = null;
        reject(new Error('sdk_load_failed'));
      };
      document.body.appendChild(script);
    }
  });
  return sdkPromise;
}

interface GraphPage {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string; name?: string };
}

function flattenIgAccounts(pages: GraphPage[]): IgChoice[] {
  const out: IgChoice[] = [];
  for (const page of pages) {
    const ig = page.instagram_business_account;
    if (!page.id || !page.access_token || !ig?.id) continue;
    out.push({
      pageId: String(page.id),
      pageName: String(page.name ?? 'Página'),
      pageAccessToken: String(page.access_token),
      igId: String(ig.id),
      igUsername: String(ig.username ?? ig.name ?? ig.id),
    });
  }
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PlatformCrmInstagramLoginWizard({ open, onClose }: Props) {
  const qc = useQueryClient();
  const draft = useDraftPlatformCrmInstagramConnection();
  const save = useSavePlatformCrmInstagramConnection();
  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<IgChoice[]>([]);
  const [selected, setSelected] = useState<IgChoice | null>(null);
  const [connectedName, setConnectedName] = useState('');
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('login');
      setLoading(false);
      setAccounts([]);
      setSelected(null);
      setConnectedName('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !APP_ID) return;
    let cancelled = false;
    setSdkError(null);
    loadFacebookSdk(APP_ID, GRAPH_VERSION).then(
      () => { if (!cancelled) setSdkReady(true); },
      (e: Error) => {
        if (cancelled) return;
        setSdkError(
          e?.message === 'sdk_timeout'
            ? 'O Facebook demorou demais para responder. Verifique bloqueadores de anúncio e recarregue a página.'
            : 'Não foi possível carregar o Facebook. Verifique bloqueadores de anúncio e recarregue a página.',
        );
      },
    );
    return () => { cancelled = true; };
  }, [open]);

  const handleFacebookLogin = useCallback(() => {
    if (!APP_ID) return;
    if (!window.FB) {
      toast.error('O Facebook ainda não terminou de carregar. Aguarde um instante e tente de novo.');
      return;
    }
    setLoading(true);
    const watchdog = window.setTimeout(() => {
      setLoading(false);
      toast.error(
        'Não recebemos resposta do Facebook. Se a janela abriu e mostrou algum aviso, ' +
          'nos envie o print — e se ela nem chegou a aparecer, confira se o navegador ' +
          'bloqueou pop-ups para este site.',
      );
    }, 120_000);

    window.FB.login(
      (response) => {
        window.clearTimeout(watchdog);
        const token = response?.authResponse?.accessToken;
        if (!token) {
          setLoading(false);
          return;
        }
        void (async () => {
          try {
            const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              toast.error(body?.error?.message || 'Não foi possível listar as Páginas autorizadas.');
              setLoading(false);
              return;
            }
            const list = flattenIgAccounts((body?.data ?? []) as GraphPage[]);
            setAccounts(list);
            setSelected(list.length === 1 ? list[0] : null);
            setStep('select');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao ler as contas do Instagram.');
          } finally {
            setLoading(false);
          }
        })();
      },
      { scope: IG_SCOPES },
    );
  }, []);

  const handleConnect = useCallback(async () => {
    if (!selected || !APP_ID) return;
    setLoading(true);
    try {
      const drafted = await draft.mutateAsync({
        display_name: selected.igUsername || selected.pageName,
      });
      const data = await save.mutateAsync({
        connection_id: drafted.connection_id,
        display_name: selected.igUsername || selected.pageName,
        app_id: APP_ID,
        fb_page_id: selected.pageId,
        ig_business_account_id: selected.igId,
        page_access_token: selected.pageAccessToken,
      });
      if ((data as { error?: string } | null)?.error) {
        const message = await serverMessage(null, data);
        toast.error(message || 'Não foi possível concluir a conexão.');
        return;
      }
      setConnectedName(selected.igUsername || selected.pageName);
      setStep('done');
      void qc.invalidateQueries({ queryKey: ['platform-crm-instagram-connections'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a conexão.');
    } finally {
      setLoading(false);
    }
  }, [selected, draft, save, qc]);

  const stepIndex = useMemo(() => STEPS.indexOf(step), [step]);
  if (!APP_ID) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'login' && 'Conectar Instagram existente'}
            {step === 'select' && 'Selecionar conta'}
            {step === 'done' && 'Conectado!'}
          </DialogTitle>
          <DialogDescription>
            {step === 'login' && 'Faça login com o Facebook para escolher uma conta Business/Creator já vinculada a uma Página.'}
            {step === 'select' && 'Selecione a Página e a conta Instagram que deseja conectar'}
            {step === 'done' && 'Canal conectado com sucesso'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : stepIndex > i
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {stepIndex > i ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 'login' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-center text-muted-foreground max-w-sm">
              Conecta uma conta Instagram Business ou Creator que já existe, vinculada a uma Página do Facebook.
            </p>
            <Button
              onClick={handleFacebookLogin}
              disabled={loading || !sdkReady || !!sdkError}
              className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
              {(loading || (!sdkReady && !sdkError)) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {sdkError
                ? 'Facebook indisponível'
                : !sdkReady
                  ? 'Carregando Facebook…'
                  : 'Entrar com Facebook'}
            </Button>
            {sdkError && (
              <p className="text-xs text-center text-destructive max-w-sm">{sdkError}</p>
            )}
          </div>
        )}

        {step === 'select' && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {accounts.map((a) => (
              <Card
                key={a.igId}
                className={`cursor-pointer transition-all ${
                  selected?.igId === a.igId
                    ? 'border-primary ring-1 ring-primary'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelected(a)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <Instagram className="h-5 w-5 text-pink-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">@{a.igUsername}</p>
                    <p className="text-xs text-muted-foreground truncate">Página: {a.pageName}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {accounts.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">
                Nenhuma conta Instagram Business/Creator vinculada a Página foi encontrada.
              </p>
            )}
            <Button onClick={handleConnect} disabled={!selected || loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Conectar selecionado
            </Button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-pink-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-pink-600" />
            </div>
            <p className="text-center font-medium">
              @{connectedName} conectado com sucesso!
            </p>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
