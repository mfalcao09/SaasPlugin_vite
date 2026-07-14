import { useEffect, useRef, useState, type FC } from 'react';
import { CheckCircle2, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';

/**
 * Passo final do wizard de implantação: tela de "montagem" do espaço.
 *
 * Enquanto o backend importa as conversas/contatos do WhatsApp recém-conectado
 * (webhook evolution-webhook → tabela `clientes`), esta tela mostra progresso
 * REAL: poll da contagem de `clientes` da organização a cada 4s.
 *
 * Critérios de conclusão:
 * - contagem estável por ~15s DEPOIS de ter passado de 0 (importação assentou), OU
 * - timeout de 3 minutos, OU
 * - instanceId null (cliente pulou o QR) → conclui rápido com mensagem adequada.
 */

const FRASES = [
  'Estamos preparando tudo pro seu negócio alcançar o próximo nível ✨',
  'Hora do seu espaço decolar 🚀',
  'Preparando o melhor atendimento pras suas clientes 💖',
  'Organizando suas conversas e sua carteira de clientes 📇',
];

const POLL_MS = 4_000; // 3-5s
const FRASE_MS = 4_000; // rotação das frases de incentivo
const ESTABILIDADE_MS = 15_000; // contagem estável por 15s após passar de 0
const TIMEOUT_MS = 180_000; // 3 minutos
const SKIP_DELAY_MS = 4_000; // sem WhatsApp: conclui rápido, mas sem "piscar"

export const MontandoEspacoStep: FC<{
  organizationId: string;
  instanceId: string | null;
  onFinish: () => void;
}> = ({ organizationId, instanceId, onFinish }) => {
  const [done, setDone] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [fraseIdx, setFraseIdx] = useState(0);
  const [progress, setProgress] = useState(4);

  const startRef = useRef<number>(Date.now());
  const lastCountRef = useRef<number>(0);
  const lastChangeRef = useRef<number>(Date.now());

  // Rotação das frases de incentivo (~4s) + progresso visual assintótico.
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      setFraseIdx((i) => (i + 1) % FRASES.length);
    }, FRASE_MS);
    const p = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      // Curva suave que se aproxima de 92% — os 100% só quando concluir de verdade.
      setProgress(Math.min(92, Math.round(92 * (1 - Math.exp(-elapsed / 45_000)))));
    }, 1_000);
    return () => {
      clearInterval(t);
      clearInterval(p);
    };
  }, [done]);

  // Sem WhatsApp conectado (pulo do QR): não há importação a esperar.
  useEffect(() => {
    if (instanceId !== null || done) return;
    const t = setTimeout(() => setDone(true), SKIP_DELAY_MS);
    return () => clearTimeout(t);
  }, [instanceId, done]);

  // PROGRESSO REAL: poll da contagem de `clientes` da organização.
  useEffect(() => {
    if (!instanceId || done) return;
    const interval = setInterval(async () => {
      const { count } = await supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      const c = count ?? 0;
      const now = Date.now();
      if (c !== lastCountRef.current) {
        lastCountRef.current = c;
        lastChangeRef.current = now;
      }
      setClientCount(c);

      const estavel = c > 0 && now - lastChangeRef.current >= ESTABILIDADE_MS;
      const estourou = now - startRef.current >= TIMEOUT_MS;
      if (estavel || estourou) setDone(true);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [instanceId, organizationId, done]);

  useEffect(() => {
    if (done) setProgress(100);
  }, [done]);

  /* ---------- Tela de sucesso in-component ---------- */
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 space-y-5">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
          Seu espaço está pronto! 🎉
        </h2>
        {clientCount > 0 ? (
          <p className="text-muted-foreground max-w-md">
            <span className="font-semibold text-foreground">
              {clientCount} {clientCount === 1 ? 'cliente já importada' : 'clientes já importadas'}
            </span>{' '}
            pra sua carteira — e as próximas conversas entram sozinhas.
          </p>
        ) : instanceId === null ? (
          <p className="text-muted-foreground max-w-md">
            Tudo montado! Você pode conectar seu WhatsApp depois, em{' '}
            <strong>Conexões</strong> — é ele que traz suas conversas e sua carteira de
            clientes pra cá.
          </p>
        ) : (
          <p className="text-muted-foreground max-w-md">
            Tudo montado! Suas conversas e clientes vão aparecendo por aqui conforme
            chegam no seu WhatsApp.
          </p>
        )}
        <Button size="lg" className="mt-2" onClick={onFinish}>
          Começar um novo tempo no meu negócio
        </Button>
      </div>
    );
  }

  /* ---------- Tela de montagem (loading friendly) ---------- */
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 space-y-6">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Sparkles className="h-10 w-10 text-primary" />
        </div>
      </div>

      <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
        Montando seu Espaço 💆🏻‍♀️💅🏻💄
      </h2>

      {/* Frase de incentivo rotativa */}
      <p
        key={fraseIdx}
        className="text-muted-foreground max-w-md min-h-[3rem] flex items-center justify-center animate-in fade-in duration-500"
      >
        {FRASES[fraseIdx]}
      </p>

      <div className="w-full max-w-sm space-y-3">
        <Progress value={progress} className="h-2" />
        {instanceId && clientCount > 0 && (
          <Badge variant="secondary" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {clientCount} {clientCount === 1 ? 'cliente já importada' : 'clientes já importadas'}
          </Badge>
        )}
      </div>

      <Card className="p-4 max-w-md bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          Pode levar alguns instantes — estamos organizando suas conversas pra você não
          precisar cadastrar nada na mão.
        </p>
      </Card>
    </div>
  );
};

export default MontandoEspacoStep;
