// ─── Tela 3 do wizard demo — `relatorio_dinheiro` = o AHA (Esteira E1.8) ────
// "O dinheiro na carteira dela": sumidos × ticket em REAIS, com nomes e telefones
// REAIS. Reusa as peças PURAS da Home de Valor (MoneyHeadline + OpportunityCard
// seed+CTA) via o adapter reportItemsToCards. INTEGRIDADE: nunca seedOpportunities
// fake aqui — se a varredura vier rasa, a tela é honesta (mentir no AHA mata a
// venda no pós). Rodapé: "Excluir meus dados" (sem "agora" — exclusão agendada
// pro fim das 72h, não imediata; art. 18). Em paralelo, o resumo é enviado no
// WhatsApp dela (send_report server-side).

import { useEffect, useRef, useState, type FC } from 'react';
import { ArrowRight, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MoneyHeadline } from '@/cockpit/home/MoneyHeadline';
import { OpportunityCard } from '@/cockpit/home/OpportunityCard';
import { formatBRL } from '@/cockpit/home/format';
import { toast } from 'sonner';
import type { DemoEvolutionApi, DemoReport } from '../demoApi';
import { reportItemsToCards } from '../reportAdapter';

const POLL_MS = 5000;
const MAX_WAIT_MS = 90_000; // depois disso, mostra o que tiver (histórico pode ser raso)
const SHALLOW = 5;          // < 5 sumidos = varredura rasa → estado honesto

export const RelatorioDinheiroStep: FC<{
  api: DemoEvolutionApi;
  /** URL desta demo — vai junto do resumo no WhatsApp dela (send_report). */
  reportUrl: string;
  /** avança pra tela de planos (CTA "Quero recuperar esses clientes"). */
  onQuero: () => void;
  /** total recuperável (R$) → vira a âncora de valor da tela de planos. */
  onTotal?: (total: number) => void;
}> = ({ api, reportUrl, onQuero, onTotal }) => {
  const [report, setReport] = useState<DemoReport | null>(null);
  const [ready, setReady] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const sentRef = useRef(false);

  // Poll do report até estabilizar (sem crescimento por 2 ciclos) ou timeout.
  useEffect(() => {
    let alive = true;
    const started = Date.now();
    let lastCount = -1;
    let stableHits = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const r = await api.report();
        if (!alive) return;
        setReport(r);
        if (r.count === lastCount) stableHits += 1;
        else { stableHits = 0; lastCount = r.count; }

        const stable = r.count > 0 && stableHits >= 1;   // 2 leituras iguais (~10s)
        const timedOut = Date.now() - started >= MAX_WAIT_MS;
        if (stable || timedOut) {
          setReady(true);
          return; // para o polling
        }
        if (alive) timer = setTimeout(tick, POLL_MS);
      } catch {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    };
    timer = setTimeout(tick, 0);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispara o resumo no WhatsApp dela uma única vez, quando o report fica pronto.
  useEffect(() => {
    if (!ready || sentRef.current || !report || report.count <= 0) return;
    sentRef.current = true;
    onTotal?.(report.total);
    const text =
      `Achamos ${report.count} cliente(s) que sumiram e ${formatBRL(report.total)} ` +
      `que dá pra recuperar. Veja o detalhe: ${reportUrl}`;
    void api.sendReport({ text, report_url: reportUrl }).catch(() => { /* best-effort */ });
  }, [ready, report, api, reportUrl]);

  const handleExcluir = async () => {
    if (deleting || deleted) return;
    setDeleting(true);
    try {
      await api.requestDeletion();
      setDeleted(true);
      toast.success('Exclusão agendada', {
        description: 'Seus dados serão apagados ao fim das 72h. Nada foi mantido além do prazo.',
      });
    } catch (e) {
      toast.error('Não foi possível registrar o pedido', {
        description: e instanceof Error ? e.message : 'Tente novamente.',
      });
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading (chunks async ainda caindo) ──
  if (!ready && (!report || report.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-3 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-medium">Analisando suas conversas…</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Estamos varrendo seu histórico e montando sua carteira de clientes. Isso leva
          alguns instantes.
        </p>
      </div>
    );
  }

  const count = report?.count ?? 0;
  const total = report?.total ?? 0;
  const cards = reportItemsToCards(report?.items ?? []);
  const shallow = count > 0 && count < SHALLOW;

  return (
    <div className="space-y-6">
      <MoneyHeadline
        total={total}
        count={count}
        subtitle="clientes que falaram com você nos seus últimos meses e sumiram"
      />

      {count === 0 ? (
        // Honesto: varredura não achou sumidos (base em dia ou histórico curtíssimo).
        <Card className="p-6 text-center space-y-2">
          <p className="font-medium">Não encontramos clientes sumidas nesse histórico.</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Pode ser que sua base esteja em dia — ou que o histórico sincronizado tenha vindo
            curto. Na plataforma, seu Radar trabalha com a sua base completa, todo dia.
          </p>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">
              Algumas das clientes que dá para reconquistar
            </h3>
            <div className="space-y-3">
              {cards.map((card) => (
                <OpportunityCard
                  key={card.id}
                  card={card}
                  seed
                  onSeedCta={onQuero}
                  seedCtaLabel="Quero recuperar esses clientes"
                />
              ))}
            </div>
          </section>

          {shallow && (
            // Honesto: varredura rasa — não inflar o número.
            <Card className="p-4 text-sm text-muted-foreground border-dashed">
              Seu histórico sincronizado foi curto, então essa conta é uma amostra. Na plataforma,
              o Radar trabalha com a sua base completa — o número real tende a ser maior.
            </Card>
          )}
        </>
      )}

      {/* Rodapé LGPD — "Excluir meus dados" (sem "agora"): exclusão AGENDADA pro TTL. */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={handleExcluir}
          disabled={deleting || deleted}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-60"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {deleted ? 'Exclusão agendada (fim das 72h)' : 'Excluir meus dados'}
        </button>
        {count > 0 && (
          <Button onClick={onQuero} size="lg" className="gap-1.5 w-full sm:w-auto">
            Quero recuperar esses clientes <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Não contratou? Tudo é apagado em até 72h, automaticamente, com confirmação.
      </p>
    </div>
  );
};

export default RelatorioDinheiroStep;
