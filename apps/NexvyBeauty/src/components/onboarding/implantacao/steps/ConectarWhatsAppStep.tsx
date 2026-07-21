import { useEffect, useRef, useState, type FC } from 'react';
import {
  CheckCircle2,
  Loader2,
  MessageCircleHeart,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  useCreateEvolutionInstanceSelf,
  useConnectEvolutionInstance,
} from '@/hooks/useEvolutionInstances';
import { useOnboardingEvolution } from '@/hooks/useOnboardingEvolution';
import { toast } from 'sonner';

/**
 * Passo do wizard de implantação: conectar o WhatsApp do espaço via QR Code.
 *
 * Reusa a mecânica provada do WhatsAppStep do GuidedOnboarding:
 * - useCreateEvolutionInstanceSelf / useConnectEvolutionInstance (edge evolution-proxy)
 * - polling de evolution_instances.status/qr_code/phone_number a cada 3s
 * - vincula profiles.default_connection_id ao conectar
 *
 * Diferenças: nome da instância derivado da organização (sem input manual),
 * consentimento LGPD obrigatório antes de gerar o QR e orientação passo-a-passo
 * pra cliente não se perder.
 */

const PASSOS_QR = [
  'Abra o WhatsApp no seu celular',
  'Toque em Configurações → Aparelhos conectados',
  'Toque em Conectar aparelho',
  'Aponte a câmera para o código abaixo',
];

const LGPD_TEXTO =
  'Declaro que tenho o consentimento das minhas clientes para o uso dos dados das nossas ' +
  'conversas de WhatsApp. Eu sou a Controladora desses dados; a Nexvy atua como Operadora, ' +
  'tratando-os exclusivamente para operar o meu atendimento (LGPD).';

/** Formas relevantes das respostas do evolution-proxy (create/connect). */
type ProxyCreateResult = { instance?: { id?: string } | null; id?: string } | null;
type ProxyConnectResult = { qr_code?: string | null } | null;

/** Sanitiza o nome da organização para o formato exigido pelo evolution-proxy (^[a-z0-9-]{3,40}$). */
function sanitizeInstanceName(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return s.length >= 3 ? s : 'principal';
}

export const ConectarWhatsAppStep: FC<{
  organizationId: string;
  onConnected: (instanceId: string) => void;
  onSkip: () => void;
  /** Link público de implantação. Presentes ⇒ a compradora NÃO tem sessão:
   *  fala com a edge `onboarding-evolution` (token+session_token) em vez do
   *  `evolution-proxy`, que exige JWT e devolvia 401 (bug de 20/07/2026).
   *  Ausentes ⇒ contexto logado, segue pelo proxy como sempre. */
  token?: string | null;
  sessionToken?: string | null;
}> = ({ organizationId, onConnected, onSkip, token, sessionToken }) => {
  const createInstance = useCreateEvolutionInstanceSelf();
  const connectInstance = useConnectEvolutionInstance();
  const { profile } = useAuth();

  // Hooks não podem ser condicionais — instancia sempre, usa só quando há link.
  const semSessao = !!token && !!sessionToken;
  const publicApi = useOnboardingEvolution({
    token: token ?? '',
    sessionToken: sessionToken ?? '',
  });

  const [lgpdOk, setLgpdOk] = useState(false);
  const [starting, setStarting] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  // Garante que onConnected dispara uma única vez (polling roda a cada 3s).
  const connectedFiredRef = useRef(false);

  const isConnected = status === 'connected' || status === 'paired';

  const handleConnected = async (id: string, phone?: string | null) => {
    if (connectedFiredRef.current) return;
    connectedFiredRef.current = true;
    toast.success('WhatsApp conectado!');
    if (phone) setPhoneNumber(phone);
    // Vincula a conexão ao admin que está fazendo a implantação (mesma
    // convenção do GuidedOnboarding: default_connection_id no profile).
    if (profile?.id) {
      try {
        await supabase
          .from('profiles')
          .update({ default_connection_id: id })
          .eq('id', profile.id);
      } catch (e) {
        console.warn('Could not set default_connection_id', e);
      }
    }
    onConnected(id);
  };

  // Polling do status/QR — mesma cadência (3s) e mesmas colunas do WhatsAppStep.
  useEffect(() => {
    if (!instanceId || isConnected) return;
    const interval = setInterval(async () => {
      // Sem sessão a RLS esconde `evolution_instances` do front — perguntar o
      // status pela edge não é preferência, é o único caminho que enxerga algo.
      const data = semSessao
        ? await publicApi.status().catch(() => null)
        : (await supabase
            .from('evolution_instances')
            .select('status, qr_code, phone_number')
            .eq('id', instanceId)
            .maybeSingle()).data;
      if (!data) return;
      if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
      if (data.status && data.status !== status) setStatus(data.status);
      if (data.phone_number) setPhoneNumber(data.phone_number);
      if (data.status === 'connected' || data.status === 'paired') {
        await handleConnected(instanceId, data.phone_number);
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, status, qr, isConnected]);

  const handleGerarQr = async () => {
    if (!lgpdOk || starting) return;
    setStarting(true);
    try {
      // Caminho SEM SESSÃO (link de implantação): a edge resolve tudo — acha ou
      // cria a instância da org DA SUBMISSION e devolve o QR. O front não
      // consulta tabela nenhuma aqui, porque a RLS não deixaria.
      if (semSessao) {
        const r = await publicApi.connect();
        if (!r?.ok) throw new Error(r?.error || 'Não foi possível gerar o QR Code.');
        if (r.instance_id) setInstanceId(r.instance_id);
        if (r.already_connected && r.instance_id) {
          setStatus('connected');
          await handleConnected(r.instance_id);
          return;
        }
        if (r.qr_code) setQr(r.qr_code);
        setStatus('qr_pending');
        return;
      }

      // 1) Se a organização já tem uma conexão (refresh da página, retomada do
      //    wizard), reusa em vez de criar duplicata — o edge rejeita nome repetido.
      const { data: existing } = await supabase
        .from('evolution_instances')
        .select('id, status')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        if (existing.status === 'connected' || existing.status === 'paired') {
          setInstanceId(existing.id);
          setStatus(existing.status);
          await handleConnected(existing.id);
          return;
        }
        setInstanceId(existing.id);
        const result: ProxyConnectResult = await connectInstance.mutateAsync(existing.id);
        if (result?.qr_code) setQr(result.qr_code);
        setStatus('qr_pending');
        return;
      }

      // 2) Cria a instância com nome derivado da organização (sanitizado).
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();
      const instanceName = sanitizeInstanceName(org?.name || 'principal');

      const created: ProxyCreateResult = await createInstance.mutateAsync({ name: instanceName });
      const newId = created?.instance?.id || created?.id;
      if (!newId) throw new Error('Falha ao obter ID da conexão');
      setInstanceId(newId);
      const result: ProxyConnectResult = await connectInstance.mutateAsync(newId);
      if (result?.qr_code) setQr(result.qr_code);
      setStatus('qr_pending');
    } catch (err) {
      // No caminho logado os hooks já exibem toast. No caminho público não há
      // hook nenhum — errar em silêncio aqui deixaria a dona olhando um botão
      // que "não faz nada", que foi exatamente o sintoma do 401.
      if (semSessao) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o QR Code.');
      }
      console.warn('[ConectarWhatsAppStep] handleGerarQr', err);
    } finally {
      setStarting(false);
    }
  };

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const busy = starting || createInstance.isPending || connectInstance.isPending;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Conectar seu WhatsApp</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          É rápido e você só precisa do seu celular em mãos.
        </p>
      </div>

      {/* Reforço amigável do porquê */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <MessageCircleHeart className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Conectar o WhatsApp é o coração do seu espaço:{' '}
          <span className="font-medium text-foreground">
            é assim que suas conversas viram sua carteira de clientes
          </span>{' '}
          — tudo organizado, sem você digitar nada.
        </p>
      </div>

      {/* Passo-a-passo visual numerado */}
      <div className="space-y-2">
        {PASSOS_QR.map((passo, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="text-sm">{passo}</span>
          </div>
        ))}
      </div>

      {/* Consentimento LGPD — obrigatório antes de gerar o QR */}
      {!instanceId && (
        <label className="flex items-start gap-3 p-4 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
          <Checkbox
            checked={lgpdOk}
            onCheckedChange={(v) => setLgpdOk(v === true)}
            className="mt-0.5"
            aria-label="Consentimento LGPD"
          />
          <span className="text-sm text-muted-foreground leading-relaxed">
            <ShieldCheck className="inline w-4 h-4 text-primary mr-1 align-text-bottom" />
            {LGPD_TEXTO}
          </span>
        </label>
      )}

      {/* Ação principal / área do QR */}
      {!instanceId ? (
        <Button
          onClick={handleGerarQr}
          disabled={!lgpdOk || busy}
          className="w-full gap-2"
          size="lg"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Gerar QR Code
        </Button>
      ) : (
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500" />
                <p className="font-medium">WhatsApp conectado!</p>
                {phoneNumber && (
                  <p className="text-sm text-muted-foreground">+{phoneNumber}</p>
                )}
              </>
            ) : busy && !qr ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </>
            ) : qr ? (
              <>
                <div className="bg-white p-3 rounded-lg">
                  <img
                    src={
                      isQrBase64
                        ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
                        : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`
                    }
                    alt="QR Code para conectar o WhatsApp"
                    className="w-56 h-56"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground max-w-sm">
                  Siga os 4 passos acima e aponte a câmera para o código.
                </p>
                <Badge variant="secondary">Aguardando leitura...</Badge>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Não foi possível gerar o QR Code.
                </p>
                <Button variant="outline" size="sm" onClick={handleGerarQr} disabled={busy}>
                  Tentar novamente
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Pular com aviso honesto */}
      {!isConnected && (
        <div className="text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-muted-foreground">
                Conectar depois
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conectar o WhatsApp depois?</AlertDialogTitle>
                <AlertDialogDescription>
                  Seu espaço só começa a trabalhar de verdade quando o WhatsApp estiver
                  conectado — você pode fazer isso depois em <strong>Conexões</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Conectar agora</AlertDialogCancel>
                <AlertDialogAction onClick={onSkip}>Deixar pra depois</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
};

export default ConectarWhatsAppStep;
