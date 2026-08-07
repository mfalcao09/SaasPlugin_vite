// ─── Tela 2 do wizard demo — `whatsapp_qr` (Esteira E1.7 / E3.3 / E4.3) ─────
// Bloco LGPD ROBUSTO antes do QR (checklist art. 9º/39) → checkbox de
// consentimento explícito (texto VERBATIM do blueprint §5.2) → só então o QR.
// QR é base64-ONLY (E4.3 / R9: NUNCA api.qrserver.com — vazaria o pairing-code a
// terceiro). Polling do status é server-side pela edge `demo-evolution` (o front
// anônimo não lê evolution_instances direto — morre no RLS).

import { useEffect, useRef, useState, type FC } from 'react';
import {
  ShieldCheck, Lock, Eye, EyeOff, Clock, QrCode, Loader2,
  CheckCircle2, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  DEMO_SCAN_CONSENT_TEXT, DEMO_OPERATOR_IDENTITY, TERMS_VERSION, PRIVACY_VERSION,
} from '@/pages/legal/legalContent';
import type { DemoEvolutionApi } from '../demoApi';

const PASSOS_QR = [
  'Abra o WhatsApp no seu celular',
  'Toque em Configurações → Aparelhos conectados',
  'Toque em Conectar aparelho e aponte a câmera para o código',
];
// Via CÓDIGO: um aparelho só. A lead digita dentro do próprio WhatsApp.
const PASSOS_CODIGO = [
  'Abra o WhatsApp neste mesmo celular',
  'Toque em Configurações → Aparelhos conectados',
  'Toque em Conectar aparelho → Conectar com número de telefone',
  'Digite o código que aparece abaixo',
];

// ── QUAL VIA (06/08) ────────────────────────────────────────────────────────
// A pergunta REAL não é "é mobile?" — é "o WhatsApp está NESTE aparelho?".
// O navegador não sabe responder isso, então a detecção escolhe o PADRÃO e
// NUNCA tranca o caminho: as duas vias ficam a um toque de distância.
//
// Tablet vai para CÓDIGO junto com o celular. Existe WhatsApp para iPad, e o
// custo de errar é assimétrico: errar para código custa digitação; errar para
// QR entrega uma tela sem saída — que foi exatamente o defeito medido.
export type Via = 'qr' | 'codigo';
export function viaPadrao(): Via {
  if (typeof navigator === 'undefined') return 'qr';
  const ua = navigator.userAgent || '';
  const uaMovel = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua);
  // iPadOS >= 13 MENTE o UA como "Macintosh". Sem este ramo, todo iPad cairia
  // no QR — e é justamente onde o WhatsApp pode estar no mesmo aparelho.
  const iPadDisfarcado = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  // "Solicitar site para computador" no celular também falseia o UA; ponteiro
  // grosso (dedo) é o sinal que sobrevive a isso.
  const dedoNaoMouse = typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches;
  return (uaMovel || iPadDisfarcado || dedoNaoMouse) ? 'codigo' : 'qr';
}

type Phase = 'lgpd' | 'connecting' | 'qr' | 'connected';

// Só base64 (data:image… ou base64 cru). Pairing-code cru NUNCA vira <img> aqui.
function qrSrc(qr: string): string | null {
  if (qr.startsWith('data:image')) return qr;
  if (/^[A-Za-z0-9+/=]{40,}$/.test(qr)) return `data:image/png;base64,${qr}`;
  return null; // veio um pairing-code, não uma imagem → não renderiza (E4.3/R9)
}

export const WhatsappQrStep: FC<{
  api: DemoEvolutionApi;
  onConnected: () => void;
}> = ({ api, onConnected }) => {
  const [phase, setPhase] = useState<Phase>('lgpd');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  // Via escolhida: nasce da detecção, muda com um toque da lead.
  const [via, setVia] = useState<Via>(viaPadrao);
  const [pairing, setPairing] = useState<string | null>(null);
  const firedRef = useRef(false);
  // Sempre aponta para o onConnected mais recente. Necessário porque o avanço
  // vive num efeito que NÃO pode ter a callback nas deps: `goNext` (DemoWizard:66)
  // é recriado a cada render e reiniciaria o timer indefinidamente.
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const handleConectar = async () => {
    if (!consent || busy) return;
    setBusy(true);
    try {
      // 1) grava a prova de consentimento (scope demo_whatsapp_scan) com o texto MOSTRADO.
      await api.accept({
        consent_text: DEMO_SCAN_CONSENT_TEXT,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      });
      // 2) cria a instância lazy + puxa o QR base64.
      setPhase('connecting');
      const res = await api.connect({ wantPairing: via === 'codigo' });
      setQr(res.qr_code);
      setPairing(res.pairing_code ?? null);
      setPhase('qr');
    } catch (e) {
      toast.error('Não foi possível iniciar a conexão', {
        description: e instanceof Error ? e.message : 'Tente novamente em instantes.',
      });
      setPhase('lgpd');
    } finally {
      setBusy(false);
    }
  };

  // Troca de via SEM refazer o consentimento: só repede a conexão no outro
  // formato. Existe para que a detecção seja um palpite reversível, e não uma
  // sentença — se ela errar, a lead corrige sozinha.
  const trocarVia = async () => {
    if (busy) return;
    const nova: Via = via === 'codigo' ? 'qr' : 'codigo';
    setVia(nova);
    setBusy(true);
    try {
      const res = await api.connect({ wantPairing: nova === 'codigo' });
      setQr(res.qr_code);
      setPairing(res.pairing_code ?? null);
    } catch (e) {
      toast.error('Não consegui trocar o modo de conexão', {
        description: e instanceof Error ? e.message : 'Tente novamente em instantes.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Polling do status server-side (3s) — enquanto não conectado.
  useEffect(() => {
    if (phase !== 'qr') return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.status();
        if (!alive) return;
        if (s.qr_code && s.qr_code !== qr) setQr(s.qr_code);
        if (s.status === 'connected') {
          if (!firedRef.current) {
            firedRef.current = true;
            toast.success('WhatsApp conectado! Analisando suas conversas…');
          }
          // O AVANÇO não mora aqui — ver o efeito logo abaixo. Ver comentário lá.
          setPhase('connected');
        }
      } catch {
        /* transiente — o próximo tick tenta de novo */
      }
    };
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qr]);

  // AVANÇO para o relatório — efeito PRÓPRIO, disparado quando a fase vira
  // 'connected'.
  //
  // ⚠️ BUG CORRIGIDO 2026-07-20 (a lead ficava presa PARA SEMPRE em "Estamos
  // analisando suas conversas"): o setTimeout do avanço morava dentro do efeito
  // de polling, cujas deps incluem `phase`. A sequência era mortal e 100%
  // determinística:
  //   1. tick() vê 'connected' e chama setPhase('connected');
  //   2. `phase` mudou → o efeito de polling é RECRIADO → o cleanup do efeito
  //      ANTIGO roda e faz `alive = false`;
  //   3. 1800ms depois o timeout dispara, testa `if (alive)` — que é a variável
  //      capturada no closure JÁ DERRUBADO, agora false — e NÃO chama onConnected();
  //   4. o efeito novo aborta de cara no guard `if (phase !== 'qr') return`.
  // Ou seja: o próprio setPhase matava o timer que dependia dele. Aqui o timer
  // vive num efeito que só é limpo no unmount real, e a callback vem de ref
  // (deps só [phase]) para `goNext` recriado não reiniciar o relógio.
  useEffect(() => {
    if (phase !== 'connected') return;
    // respiro pra os chunks async começarem a cair na carteira antes do relatório
    const t = setTimeout(() => onConnectedRef.current(), 1800);
    return () => clearTimeout(t);
  }, [phase]);

  const img = qr ? qrSrc(qr) : null;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Conecte seu WhatsApp</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          É de onde a gente lê, com sua autorização, quem já foi sua cliente e sumiu.
          Leva menos de um minuto.
        </p>
      </div>

      {phase === 'lgpd' && (
        <>
          {/* ── Bloco LGPD (checklist art. 9º/39) ── */}
          <Card className="p-5 space-y-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Antes de conectar, sua transparência
            </div>

            <ul className="space-y-3 text-sm text-muted-foreground">
              <LgpdItem icon={Lock}>
                <b className="text-foreground">Quem somos:</b> {DEMO_OPERATOR_IDENTITY.razaoSocial}{' '}
                (CNPJ {DEMO_OPERATOR_IDENTITY.cnpj}), atuando como <b>Operadora</b> dos seus
                dados. Você é a <b>Controladora</b>.
              </LgpdItem>
              <LgpdItem icon={Eye}>
                <b className="text-foreground">Para quê:</b> só para identificar clientes que
                não voltaram nos <b>seus últimos meses</b> e estimar quanto dá para recuperar.
                Finalidade única.
              </LgpdItem>
              <LgpdItem icon={EyeOff}>
                <b className="text-foreground">O que NÃO fazemos:</b> não guardamos o conteúdo
                das suas mensagens — só nome, telefone e a data do último contato. Nada de
                marketing nosso, nada com terceiros.
              </LgpdItem>
              <LgpdItem icon={Clock}>
                <b className="text-foreground">Retenção de 72h:</b> os dados importados ficam por
                até 72 horas e depois são apagados automaticamente — mesmo que você peça a
                exclusão antes. Enquanto sua conexão seguir ativa, seguimos analisando, inclusive
                mensagens novas do período.
              </LgpdItem>
            </ul>

            {/* Checkbox de consentimento explícito — texto VERBATIM (prova). */}
            <label className="flex items-start gap-3 p-4 rounded-lg border bg-background cursor-pointer">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
                aria-label="Consentimento do scan de WhatsApp"
              />
              <span className="text-sm text-muted-foreground leading-relaxed">
                {DEMO_SCAN_CONSENT_TEXT}
              </span>
            </label>

            <p className="text-xs text-muted-foreground">
              Dúvidas de privacidade? Fale com nosso Encarregado (DPO):{' '}
              <a href={`mailto:${DEMO_OPERATOR_IDENTITY.dpo}`} className="underline text-primary">
                {DEMO_OPERATOR_IDENTITY.dpo}
              </a>. Você poderá pedir a exclusão dos seus dados na próxima tela.
            </p>
          </Card>

          <Button onClick={handleConectar} disabled={!consent || busy} className="w-full gap-2" size="lg">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Conectar meu WhatsApp
          </Button>
        </>
      )}

      {(phase === 'connecting' || phase === 'qr' || phase === 'connected') && (
        <>
          {/* Passo-a-passo (os 3 pontos do GuidedOnboarding) */}
          {phase !== 'connected' && (
            <div className="space-y-2">
              {(via === 'codigo' ? PASSOS_CODIGO : PASSOS_QR).map((passo, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm">{passo}</span>
                </div>
              ))}
            </div>
          )}

          <Card className="p-6">
            <div className="flex flex-col items-center justify-center min-h-[280px] gap-3">
              {phase === 'connected' ? (
                <>
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                  <p className="font-medium">WhatsApp conectado!</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Estamos analisando suas conversas — isso leva alguns instantes.
                  </p>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </>
              ) : via === 'codigo' && pairing ? (
                /* ── CÓDIGO DE PAREAMENTO — um aparelho só ──────────────────
                   TEXTO, nunca imagem: o código é credencial de sessão e não
                   pode ir para gerador de QR de terceiro (defesa E4.3/R9 que
                   já existia — aqui ela ganha a saída que faltava). */
                <>
                  <p className="text-sm text-muted-foreground">Seu código de conexão</p>
                  <div className="font-mono text-4xl tracking-[0.3em] font-bold select-all px-4 py-3 rounded-lg bg-muted">
                    {pairing}
                  </div>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    Digite no WhatsApp deste mesmo celular, seguindo os passos acima.
                  </p>
                  <Badge variant="secondary">Aguardando confirmação…</Badge>
                </>
              ) : phase === 'connecting' || (!qr && !pairing) ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {via === 'codigo' ? 'Gerando seu código…' : 'Gerando seu QR Code…'}
                  </p>
                </>
              ) : img ? (
                <>
                  <div className="bg-white p-3 rounded-lg">
                    <img src={img} alt="QR Code para conectar o WhatsApp" className="w-56 h-56" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    Siga os 3 passos acima e aponte a câmera para o código.
                  </p>
                  <Badge variant="secondary">Aguardando leitura…</Badge>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground text-center">
                    {via === 'codigo'
                      ? 'Não foi possível gerar o código agora.'
                      : 'Não foi possível gerar o QR Code agora.'}
                  </p>
                  {/* Saída dupla: repetir OU trocar de via. Sem a segunda, uma
                      via quebrada era beco sem saída — a lead não tinha como
                      tentar o outro caminho. */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleConectar} disabled={busy}>
                      Tentar novamente
                    </Button>
                    <Button variant="ghost" size="sm" onClick={trocarVia} disabled={busy}>
                      {via === 'codigo' ? 'Tentar pelo QR Code' : 'Tentar por código'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* ── A ALTERNATIVA SEMPRE VISÍVEL ─────────────────────────────────
              A detecção acerta o padrão na maioria dos casos e erra em alguns
              (iPadOS mente o UA, "solicitar site para computador", navegador
              dentro de app). Deixar a outra via a um toque transforma a
              detecção num PALPITE REVERSÍVEL em vez de uma sentença — que é a
              diferença entre a lead se corrigir sozinha e a lead desistir. */}
          {phase !== 'connected' && (
            <div className="text-center">
              <Button variant="link" size="sm" onClick={trocarVia} disabled={busy}
                className="text-muted-foreground">
                {via === 'codigo'
                  ? 'Está num computador? Prefiro ler o QR Code'
                  : 'Está no celular? Conectar por código, sem QR'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function LgpdItem({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

export default WhatsappQrStep;
