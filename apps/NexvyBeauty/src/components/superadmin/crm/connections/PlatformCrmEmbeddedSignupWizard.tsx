// Embedded Signup no gestao — login → seleção (tela NOSSA) → concluído.
// Mesmo FB.login para criar número novo ou conectar API existente.
// Callback do FB.login NÃO é async. config_id, nunca solution_id. Code TTL 30s.

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
import { Loader2, MessageCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { serverMessage } from '@/components/admin/integrations/channels/edgeError';
import {
  META_APP_ID as APP_ID,
  META_CONFIG_ID as CONFIG_ID,
  META_GRAPH_VERSION as GRAPH_VERSION,
} from '@/components/admin/integrations/channels/selfService';

const FB_SDK_ID = 'facebook-jssdk';
const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

type Step = 'login' | 'select' | 'done';
const STEPS: Step[] = ['login', 'select', 'done'];

export type EmbeddedSignupIntent = 'create' | 'existing';

interface PhoneChoice {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
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

function flattenPhones(assets: unknown): PhoneChoice[] {
  const businesses = (assets as { data?: unknown[] } | null)?.data ?? [];
  const out: PhoneChoice[] = [];

  for (const biz of businesses as Record<string, unknown>[]) {
    const wabas = (biz?.owned_whatsapp_business_accounts as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
    for (const waba of wabas) {
      const phones = (waba?.phone_numbers as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
      for (const phone of phones) {
        if (!phone?.id) continue;
        out.push({
          wabaId: String(waba.id),
          wabaName: String(waba.name ?? 'Conta WhatsApp'),
          phoneNumberId: String(phone.id),
          displayPhoneNumber: String(phone.display_phone_number ?? ''),
          verifiedName: (phone.verified_name as string | null) ?? null,
        });
      }
    }
  }
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
  intent?: EmbeddedSignupIntent;
}

export function PlatformCrmEmbeddedSignupWizard({ open, onClose, intent = 'existing' }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [phones, setPhones] = useState<PhoneChoice[]>([]);
  const [selected, setSelected] = useState<PhoneChoice | null>(null);
  const [connectedName, setConnectedName] = useState('');
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('login');
      setLoading(false);
      setConnectionId(null);
      setPhones([]);
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
    if (!APP_ID || !CONFIG_ID) return;
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
        const code = response?.authResponse?.code;
        if (!code) {
          setLoading(false);
          return;
        }

        void (async () => {
          const { data, error } = await supabase.functions.invoke(
            'platform-embedded-signup-exchange',
            { body: { code } },
          );
          setLoading(false);

          if (error || (data as { error?: string } | null)?.error) {
            const message = await serverMessage(error, data);
            toast.error(message || 'Não foi possível concluir a conexão. Tente novamente.');
            return;
          }

          const result = data as { connection_id: string; assets: unknown };
          const list = flattenPhones(result.assets);
          setConnectionId(result.connection_id);
          setPhones(list);
          setSelected(list.length === 1 ? list[0] : null);
          setStep('select');
        })();
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: 3, version: 'v4' },
      },
    );
  }, []);

  const handleRegister = useCallback(async () => {
    if (!connectionId || !selected) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke(
      'platform-embedded-signup-register',
      {
        body: {
          connection_id: connectionId,
          waba_id: selected.wabaId,
          phone_number_id: selected.phoneNumberId,
          display_name: selected.verifiedName ?? selected.wabaName,
        },
      },
    );
    setLoading(false);

    if (error || (data as { error?: string } | null)?.error) {
      const message = await serverMessage(error, data);
      toast.error(message || 'Não foi possível concluir a conexão. Tente novamente.');
      return;
    }

    setConnectedName((data as { display_name?: string })?.display_name ?? selected.wabaName);
    setStep('done');
    void qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
  }, [connectionId, selected, qc]);

  const stepIndex = useMemo(() => STEPS.indexOf(step), [step]);
  if (!APP_ID || !CONFIG_ID) return null;

  const loginCopy = intent === 'create'
    ? 'Faça login com o Facebook. Na janela da Meta você cria um número oficial novo. Depois esta tela mostra o recurso autorizado.'
    : 'Faça login com o Facebook. Na janela da Meta você seleciona uma API oficial já existente. Depois esta tela mostra o recurso autorizado.';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'login' && (intent === 'create' ? 'Criar número oficial novo' : 'Conectar API oficial existente')}
            {step === 'select' && 'Selecionar conta'}
            {step === 'done' && 'Conectado!'}
          </DialogTitle>
          <DialogDescription>
            {step === 'login' && loginCopy}
            {step === 'select' && 'Selecione o número que deseja conectar'}
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
              Nenhuma senha ou token passa por esta tela. A Meta abre o popup; nós só
              recebemos a autorização e listamos o que você concedeu.
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
            {phones.map((p) => (
              <Card
                key={p.phoneNumberId}
                className={`cursor-pointer transition-all ${
                  selected?.phoneNumberId === p.phoneNumberId
                    ? 'border-primary ring-1 ring-primary'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelected(p)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.verifiedName ?? p.wabaName}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {p.displayPhoneNumber}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

            {phones.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">
                Nenhum número de WhatsApp encontrado na conta que você autorizou.
              </p>
            )}

            <Button onClick={handleRegister} disabled={!selected || loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Conectar selecionado
            </Button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-emerald-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <p className="text-center font-medium">
              {connectedName} conectado com sucesso!
            </p>
            <Button onClick={onClose} className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
