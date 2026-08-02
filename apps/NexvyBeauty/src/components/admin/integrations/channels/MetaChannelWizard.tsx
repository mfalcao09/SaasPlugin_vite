// Wizard do Embedded Signup da Meta — porte da UI do Intentus
// (`apps/intentus/src/components/chat/ChannelConnectionWizard.tsx`).
//
// FORMA do Intentus: mesmo stepper 1—2—3, mesmas três etapas (login → seleção →
// concluído), mesmo botão azul do Facebook, mesma lista de cards clicáveis.
// BACKEND nosso, com a segurança que aquele não tem — ver `-register`.
//
// ⚠️ NÃO CONFUNDIR com `PlatformCrmMetaWhatsAppWizard`: aquele é super-admin,
// product-scoped, manual, sobre outra tabela. Este é do dono do salão.
//
// ⚠️ POR QUE TRÊS ETAPAS E NÃO UMA (o desenho anterior desta trilha):
//
//   1. ROBUSTEZ. O fluxo de uma etapa dependia de DOIS canais assíncronos: o
//      callback do `FB.login` (traz o `code`) e o `postMessage`
//      `WA_EMBEDDED_SIGNUP` (traz `phone_number_id`/`waba_id`). Se o segundo não
//      chegasse, o botão ficava em "Conectando…" para sempre, sem erro; e se o
//      callback disparasse primeiro, os ids iam vazios. Aqui só o `code` importa
//      — o resto vem de uma chamada ao Graph, que é requisição nossa e falha
//      visivelmente. Este arquivo NÃO escuta `postMessage`, de propósito.
//
//   2. O ANALISTA DA META PRECISA VER. A recusa de 22/04 pedia "a experiência
//      completa do caso de uso" e "um usuário fornecendo acesso ao recurso". A
//      etapa 2 é uma tela NOSSA mostrando os ativos que ele acabou de autorizar.
//      Um `postMessage` invisível não aparece em frame nenhum.
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { serverMessage } from './edgeError';
// Fonte ÚNICA do estado de self-service — ver `selfService.ts` para o invariante
// ("um estado, um dono"). Este arquivo LÊ; nunca reescreve a condição.
import {
  META_APP_ID as APP_ID,
  META_CONFIG_ID as CONFIG_ID,
  META_GRAPH_VERSION as GRAPH_VERSION,
} from './selfService';

const FB_SDK_ID = 'facebook-jssdk';
const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

type Step = 'login' | 'select' | 'done';
const STEPS: Step[] = ['login', 'select', 'done'];

/** Um número escolhível, já achatado da resposta aninhada do Graph. */
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
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();

    const finish = () => {
      // `autoLogAppEvents` off: não queremos telemetria da Meta disparando a
      // partir do painel do tenant sem que ele tenha pedido isso.
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

/**
 * Achata a resposta do Graph numa lista simples de números.
 *
 * O Graph devolve três níveis aninhados (business → WABA → phone), cada um
 * embrulhado em `.data`. O Intentus faz esse `map` triplo dentro do JSX; aqui a
 * transformação fica isolada e testável, e o JSX renderiza uma lista chapada.
 * Cada nível é opcional na resposta real — conta sem WABA e WABA sem número
 * existem, e um `?.` faltando vira tela branca em vez de lista vazia.
 */
function flattenPhones(assets: unknown): PhoneChoice[] {
  const businesses = (assets as { data?: unknown[] } | null)?.data ?? [];
  const out: PhoneChoice[] = [];

  for (const biz of businesses as Record<string, any>[]) {
    const wabas = biz?.owned_whatsapp_business_accounts?.data ?? [];
    for (const waba of wabas as Record<string, any>[]) {
      const phones = waba?.phone_numbers?.data ?? [];
      for (const phone of phones as Record<string, any>[]) {
        if (!phone?.id) continue;
        out.push({
          wabaId: String(waba.id),
          wabaName: String(waba.name ?? 'Conta WhatsApp'),
          phoneNumberId: String(phone.id),
          displayPhoneNumber: String(phone.display_phone_number ?? ''),
          verifiedName: phone.verified_name ?? null,
        });
      }
    }
  }
  return out;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após a conexão ficar ativa, para o painel recarregar a lista. */
  onConnected?: () => void;
}

export function MetaChannelWizard({ open, onOpenChange, onConnected }: Props) {
  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [phones, setPhones] = useState<PhoneChoice[]>([]);
  const [selected, setSelected] = useState<PhoneChoice | null>(null);
  const [connectedName, setConnectedName] = useState<string>('');

  // Fechar o diálogo tem que zerar TUDO. Sem isto, reabrir mostra a etapa
  // "concluído" da conexão anterior — ou pior, mantém um `connectionId` velho e
  // o "Conectar selecionado" tenta completar um rascunho que já foi usado.
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

  const handleFacebookLogin = useCallback(async () => {
    if (!APP_ID || !CONFIG_ID) return;
    setLoading(true);

    try {
      await loadFacebookSdk(APP_ID, GRAPH_VERSION);
    } catch {
      setLoading(false);
      toast.error('Não foi possível carregar o Facebook. Verifique bloqueadores de anúncio e tente de novo.');
      return;
    }

    window.FB?.login(
      async (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          // Cancelou ou fechou a janela. Não é erro do sistema — é decisão do
          // usuário, e a tela volta ao estado inicial sem drama.
          setLoading(false);
          return;
        }

        // O code vale 30 SEGUNDOS. Vai direto para o servidor, que troca de
        // forma síncrona. Nada de fila, retry ou "tentaremos mais tarde".
        const { data, error } = await supabase.functions.invoke(
          'whatsapp-embedded-signup-exchange',
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
        // Um único número é o caso comum: já deixa selecionado para o usuário só
        // confirmar, sem transformar a etapa em trabalho burocrático.
        setSelected(list.length === 1 ? list[0] : null);
        setStep('select');
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        // ⚠️ NÃO AFERIDO. Veio da mesma anotação que trazia um config_id que se
        // provou INEXISTENTE — a procedência errou no campo vizinho, então nada
        // aqui vale como medição. Forma que RODA em produção no Intentus:
        //   extras: { setup: {}, featureType: 'whatsapp_embedded_signup',
        //             sessionInfoVersion: 2 }
        // Se o fluxo abrir mas a etapa 2 vier vazia, é AQUI que se olha primeiro.
        extras: { sessionInfoVersion: 3, version: 'v4' },
      },
    );
  }, []);

  const handleRegister = useCallback(async () => {
    if (!connectionId || !selected) return;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke(
      'whatsapp-embedded-signup-register',
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
    onConnected?.();
  }, [connectionId, selected, onConnected]);

  const stepIndex = useMemo(() => STEPS.indexOf(step), [step]);

  // Sem as env vars de build o wizard não abre. Quem INFORMA isso ao tenant é o
  // painel, com estado explícito no lugar do card — aqui só não renderizamos.
  if (!APP_ID || !CONFIG_ID) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'login' && 'WhatsApp Business (Oficial)'}
            {step === 'select' && 'Selecionar conta'}
            {step === 'done' && 'Conectado!'}
          </DialogTitle>
          <DialogDescription>
            {step === 'login' && 'Faça login com o Facebook para conectar sua conta'}
            {step === 'select' && 'Selecione o número que deseja conectar'}
            {step === 'done' && 'Canal conectado com sucesso'}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper 1—2—3. É ele que torna o progresso visível em vídeo. */}
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
              Ao clicar no botão abaixo, você será redirecionado para o Facebook
              para autorizar a conexão com sua conta WhatsApp Business. Nenhuma
              senha ou token passa por nós.
            </p>
            <Button
              onClick={handleFacebookLogin}
              disabled={loading}
              className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Entrar com Facebook
            </Button>
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
              // Estado vazio REAL: o Graph respondeu e não havia número. Diferente
              // de falha na listagem, que a edge devolve como erro e cai no toast.
              <p className="text-center text-muted-foreground text-sm py-4">
                Nenhum número de WhatsApp encontrado na conta que você autorizou.
                Verifique se o número já está cadastrado no seu WhatsApp Business.
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
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default MetaChannelWizard;
