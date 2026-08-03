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

/** Promise única do SDK, memoizada no módulo. Ver `loadFacebookSdk`. */
let sdkPromise: Promise<void> | null = null;

/**
 * Carrega e inicializa o SDK do Facebook — UMA vez por página.
 *
 * ⚠️ A VERSÃO ANTERIOR TRAVAVA O BOTÃO PARA SEMPRE, e o modo de falha vale
 * registro porque não aparece no primeiro teste:
 *
 *   const existing = document.getElementById(FB_SDK_ID);
 *   if (existing) { window.fbAsyncInit = finish; return; }   // ← sem resolve()
 *
 * Na PRIMEIRA abertura funciona: o script é inserido, o SDK chama `fbAsyncInit`,
 * a promise resolve. Em qualquer REABERTURA a tag já existe, cai no `return`, e
 * a promise fica pendente PARA SEMPRE — o `await` antes do `FB.login` nunca
 * passa e o spinner gira eternamente. Pior: se o SDK já executou, ele já
 * consumiu o `fbAsyncInit`, então reatribuí-lo não dispara nada.
 *
 * Medido em produção (2026-08-02): tag no DOM presente, `window.FB` undefined,
 * `window.fbAsyncInit` undefined, e DOIS `<script src*="facebook">` — a função
 * foi chamada mais de uma vez e cada chamada deixou uma promise órfã. A rede
 * entregava o SDK normalmente (fetch no-cors respondeu opaque), então nunca foi
 * bloqueio: era o `return` sem `resolve()`.
 *
 * O conserto não é acrescentar `resolve()` no ramo — é NÃO TER RAMO. Uma promise
 * memoizada no módulo: quem chegar depois espera a MESMA, e não existe segundo
 * caminho para divergir. Mesma família do invariante de `selfService.ts` — o
 * defeito nasce de duas definições do mesmo estado, não de dois leitores.
 */
function loadFacebookSdk(appId: string, version: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    // TIMEOUT EXPLÍCITO. Sem ele, bloqueador de anúncio ou rede ruim produzem
    // "spinner para sempre", que é indistinguível de "está carregando" para
    // quem olha a tela. Falhar alto em 15s permite mostrar erro e liberar o
    // botão — e o `sdkPromise = null` deixa o próximo clique tentar de novo.
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error('sdk_timeout'));
    }, 15_000);

    window.fbAsyncInit = () => {
      window.clearTimeout(timer);
      // `autoLogAppEvents` off: não queremos telemetria da Meta disparando a
      // partir do painel do tenant sem que ele tenha pedido isso.
      window.FB?.init({ appId, autoLogAppEvents: false, xfbml: false, version });
      resolve();
    };

    // Reaproveita a tag se já existir (o StrictMode monta duas vezes em dev). O
    // `fbAsyncInit` acima já está registrado: se o SDK ainda não executou, ele o
    // encontra; se já executou, `window.FB` existe e retornamos lá em cima.
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

  // O SDK carrega ao ABRIR O MODAL, não dentro do clique.
  //
  // ⚠️ ERRATA (2026-08-02, mesmo dia): uma versão anterior deste comentário
  // afirmava que o travamento em produção vinha daqui — que o
  // `await loadFacebookSdk(...)` dentro do handler consumia a *user activation*
  // e fazia o navegador recusar o popup. **REFUTADO por medição no mesmo dia:**
  // `window.open` abriu normalmente a partir de um script injetado, SEM
  // ativação nenhuma. A causa real não estava no código — ver abaixo. Fica
  // registrado porque código certo com explicação errada é pior que código
  // errado: o comportamento melhora, o teste passa, e o comentário ensina a
  // coisa errada para quem vier depois.
  //
  // 🔴 A CAUSA REAL do spinner eterno: `app.nexvybeauty.com.br` não estava em
  // *Domínios permitidos para o SDK do JavaScript* no Painel de Apps da Meta
  // (`business-login/settings/` — lista do APP INTEIRO, não da config, então
  // trocar `config_id` não resolveria). O popup ABRIA e morria exibindo "O
  // domínio do host JSSDK é desconhecido"; o callback voltava
  // `{authResponse: null, status: 'unknown'}` ou não voltava. Daqui de dentro
  // não havia NADA para ver: zero exceção, zero violação de CSP, zero log.
  // Se este fluxo travar num host novo (FIC, Intentus, staging), **confira essa
  // lista ANTES de mexer em qualquer linha deste arquivo.**
  //
  // Por que o pré-carregamento FICA, mesmo não tendo sido o conserto: `FB.login`
  // abre um popup, e a regra de user activation é real — depender dela só
  // porque neste navegador ela estava frouxa seria construir sobre sorte. Com o
  // SDK pronto antes, o clique chama `FB.login` de forma síncrona, e o botão
  // consegue distinguir "carregando o Facebook" de "abrindo a janela", que
  // antes eram o mesmo spinner.
  //
  // 🔬 Outra coisa medida no caminho, e que quase me fez consertar o lugar
  // errado: `window.FB` lido pelo console da extensão aparecia `undefined` —
  // mas aquilo é o ISOLATED WORLD, onde as globais da página não existem. Um
  // `<script>` inline injetado na própria página respondeu `FB: object`,
  // `FB.login: function`, e `FB.getLoginStatus` retornou `{status:'unknown'}`.
  // O SDK sempre esteve carregado; o instrumento é que lia outro mundo.
  // Instrumento exato, alvo certo, MUNDO errado.
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

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

  // Não é `async` e não tem `await` — de propósito. Não porque um `await` aqui
  // tenha causado o bug de 02/08 (não causou, ver a errata acima), mas porque
  // `FB.login` abre popup e a regra de user activation existe: manter a chamada
  // síncrona no handler é a forma de não depender de quão frouxa a janela de
  // ativação está neste ou naquele navegador. Se um dia for preciso buscar algo
  // antes de abrir o login, o lugar é o efeito acima, não aqui.
  const handleFacebookLogin = useCallback(() => {
    if (!APP_ID || !CONFIG_ID) return;

    // O botão só habilita com `sdkReady`, então este ramo é defesa em
    // profundidade — e ele AVISA, em vez de sair calado.
    if (!window.FB) {
      toast.error('O Facebook ainda não terminou de carregar. Aguarde um instante e tente de novo.');
      return;
    }
    setLoading(true);

    // WATCHDOG. O `setLoading(false)` do caminho feliz vive dentro do callback
    // do `FB.login`; se o callback não vier — popup recusado, janela fechada
    // pelo gerenciador, SDK engasgado — ele nunca roda e a tela mente que ainda
    // está trabalhando. O `clearTimeout` no callback é o que torna este timer
    // invisível quando tudo dá certo.
    const watchdog = window.setTimeout(() => {
      setLoading(false);
      // ⚠️ A mensagem descreve o FATO ("não recebemos resposta"), não uma causa.
      // A versão anterior dizia "a janela do Facebook não abriu" — e no caso
      // real de 02/08 a janela ABRIA, exibindo um erro de configuração nossa.
      // Afirmar a causa errada manda o tenant caçar bloqueador de pop-up por
      // um problema que só nós podemos consertar, e ainda faz o suporte
      // acreditar na pista falsa. Só o que foi observado entra no texto.
      toast.error(
        'Não recebemos resposta do Facebook. Se a janela abriu e mostrou algum aviso, ' +
          'nos envie o print — e se ela nem chegou a aparecer, confira se o navegador ' +
          'bloqueou pop-ups para este site.',
      );
    }, 120_000);

    window.FB.login(
      // ⚠️ ESTE CALLBACK NÃO PODE SER `async`. NUNCA. Este é o defeito que
      // travou o botão em produção o dia inteiro de 2026-08-02:
      //
      //   Uncaught t {message: 'Expression is of type asyncfunction, not function'}
      //
      // O SDK do Facebook valida o TIPO do callback e **lança** ao receber uma
      // `AsyncFunction`. A exceção sobe antes de qualquer janela abrir — nada de
      // popup, nada de callback, e o `setLoading(false)` (que mora dentro deste
      // callback) nunca roda. Da tela: spinner eterno. Do código: nada visível,
      // porque a exceção é engolida pelo próprio SDK.
      //
      // 🔬 POR QUE DEMOROU TANTO A APARECER — e a lição vale mais que a correção:
      // para depurar, instalei um wrapper em `FB.login` que envolvia o callback
      // num `function(){}` comum antes de repassar ao SDK. **O wrapper
      // consertava o bug que eu estava investigando.** Toda medição minha
      // passava (popup abria, `config_id` correto, janela no centro da tela) e
      // eu concluí "a cadeia inteira funciona" — enquanto o Marcelo, clicando no
      // botão de verdade, continuava travado. O instrumento alterou o observado.
      // Quem resolveu foi ele expandindo o `Uncaught` no console.
      // ⇒ Ao instrumentar um call site, o wrapper tem que reproduzir o
      //   ARGUMENTO EXATO que o código real passa — inclusive o tipo dele.
      //
      // A forma correta é esta: callback síncrono que dispara o trabalho async
      // por dentro. `void` deixa explícito que a promise é deliberadamente não
      // aguardada — o SDK não espera retorno nenhum daqui.
      (response) => {
        // Primeira linha do callback: o callback CHEGOU, então o watchdog não
        // tem mais o que vigiar. Desarmar aqui — e não em cada `return` — é o
        // que garante que nenhum caminho de saída futuro esqueça de fazê-lo.
        window.clearTimeout(watchdog);

        const code = response?.authResponse?.code;
        if (!code) {
          // Cancelou ou fechou a janela. Não é erro do sistema — é decisão do
          // usuário, e a tela volta ao estado inicial sem drama.
          setLoading(false);
          return;
        }

        void (async () => {
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
          // Um único número é o caso comum: já deixa selecionado para o usuário
          // só confirmar, sem transformar a etapa em trabalho burocrático.
          setSelected(list.length === 1 ? list[0] : null);
          setStep('select');
        })();
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
            {/* O estado do SDK aparece NO BOTÃO. Antes, "carregando o Facebook"
                e "abrindo a janela do Facebook" eram o mesmo spinner — e a
                falha de um era indistinguível da espera do outro. */}
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
