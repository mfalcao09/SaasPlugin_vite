// ─── Tela 3 do wizard demo — `relatorio_dinheiro` = o AHA (Esteira E1.8) ────
// "O dinheiro na carteira dela": sumidos × ticket em REAIS, com nomes e telefones
// REAIS. Reusa as peças PURAS da Home de Valor (MoneyHeadline + OpportunityCard
// seed+CTA) via o adapter reportItemsToCards. INTEGRIDADE: nunca seedOpportunities
// fake aqui — se a varredura vier rasa, a tela é honesta (mentir no AHA mata a
// venda no pós). Rodapé: "Excluir meus dados" (sem "agora" — exclusão agendada
// pro fim das 72h, não imediata; art. 18). Em paralelo, o resumo é enviado no
// WhatsApp dela (send_report server-side).
//
// ── Os 4 estados de R$ 0,00 (medido em produção 2026-07-20) ────────────────
// Antes, TUDO que não fosse count>0 caía na mesma tela ("sua base está em dia")
// e a lead ficava SEM CAMINHO (o CTA só existia com count>0 → beco sem saída).
// Agora o zero é desambiguado — erro ≠ ingerindo ≠ janela cortou ≠ base em dia —
// e o CTA pros planos aparece em TODOS os estados.
// NOTA: o <MoneyHeadline/> só entra quando count>0. Com count===0 ele afirma
// "não encontrou clientes… bom sinal, sua base está em dia", o que é MENTIRA nos
// estados erro/ingerindo/janela. Por isso os zeros usam headline próprio aqui.

import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import {
  ArrowRight, Trash2, Loader2, ShieldCheck, AlertTriangle, RefreshCw, Search, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MoneyHeadline } from '@/cockpit/home/MoneyHeadline';
import { OpportunityCard } from '@/cockpit/home/OpportunityCard';
import { formatBRL } from '@/cockpit/home/format';
import { toast } from 'sonner';
import type { DemoReport, DemoEvolutionApi } from '../demoApi';
import { reportItemsToCards } from '../reportAdapter';

const POLL_MS = 5000;
const MAX_WAIT_MS = 90_000; // depois disso, mostra o que tiver (histórico pode ser raso)
/** depois disto o spinner opaco vira texto honesto — o polling CONTINUA por trás.
 *  Sem isso a lead ficava 90s olhando "Analisando…" sem caminho nenhum. */
const SOFT_MS = 12_000;
const SHALLOW = 5;          // < 5 sumidos = varredura rasa → estado honesto
/** ativos/base acima disto = base realmente em dia (não é "a janela cortou"). */
const EM_DIA_RATIO = 0.5;

/**
 * 'ok'        → achou sumidos (o AHA).
 * 'erro'      → o polling falhou. NUNCA mostrar como "base em dia".
 * 'ingerindo' → varredura ainda rodando (ou nada ingerido até o timeout).
 * 'janela'    → ingeriu contatos, mas nenhum caiu na janela dos 45+ dias.
 * 'em_dia'    → ingeriu e a maioria falou com ela há pouco. Aí sim está em dia.
 */
type ReportState = 'ok' | 'erro' | 'ingerindo' | 'janela' | 'em_dia';

const nf = new Intl.NumberFormat('pt-BR');

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
  /** já dá pra parar de esconder atrás do spinner? (ver SOFT_MS) */
  const [soft, setSoft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const sentRef = useRef(false);

  // Poll do report até estabilizar (sem crescimento por 2 ciclos) ou timeout.
  // O catch NÃO é vazio: guarda o erro para a tela poder dizer "deu problema ao
  // ler" em vez de fingir que a base está vazia (401/403/500 por 90s caíam antes
  // na MESMA tela do vazio — erro e "base em dia" ficavam indistinguíveis).
  useEffect(() => {
    let alive = true;
    const started = Date.now();
    let lastCount = -1;
    let stableHits = 0;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const late = () => Date.now() - started >= SOFT_MS;
      try {
        const r = await api.report();
        if (!alive) return;
        if (r.ok === false) throw new Error('A varredura não conseguiu ler sua base.');
        setReport(r);
        setError(null);
        fails = 0;
        // A edge AVISOU que ainda está ingerindo → já podemos contar isso pra ela.
        if (r.scan_status === 'ingerindo' || late()) setSoft(true);
        if (r.count === lastCount) stableHits += 1;
        else { stableHits = 0; lastCount = r.count; }

        // scan_status ausente = contrato antigo: não dá pra saber, não bloqueia.
        const scanDone = r.scan_status ? r.scan_status === 'pronto' : true;
        const baseTotal = r.base_total ?? 0;
        const stable = r.count > 0 && stableHits >= 1 && scanDone;   // 2 leituras iguais (~10s)
        // Zero CONFIRMADO: varredura pronta, base ingerida e nada na janela.
        // Sem isso a lead esperaria os 90s à toa por um zero que já era final.
        const settledZero = scanDone && baseTotal > 0 && r.count === 0 && stableHits >= 1;
        const timedOut = Date.now() - started >= MAX_WAIT_MS;
        if (stable || settledZero || timedOut) {
          setReady(true);
          return; // para o polling
        }
        timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!alive) return;
        fails += 1;
        setError(e instanceof Error ? e.message : 'Não conseguimos ler seu relatório.');
        // 2 falhas seguidas (~5s) não é blip: conta pra ela em vez de fingir spinner.
        if (fails >= 2 || late()) setSoft(true);
        if (Date.now() - started >= MAX_WAIT_MS) {
          setReady(true);
          return; // desiste: a tela mostra ERRO (nunca "base em dia")
        }
        timer = setTimeout(tick, POLL_MS);
      }
    };
    timer = setTimeout(tick, 0);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => {
    setReady(false);
    setSoft(false);
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  const count = report?.count ?? 0;
  const total = report?.total ?? 0;
  const baseTotal = report?.base_total ?? 0;
  const ativos = report?.ativos ?? 0;
  const semData = report?.sem_data ?? 0;
  const faixas = report?.faixas;

  const state: ReportState =
    count > 0 ? 'ok'
      : error ? 'erro'
        : baseTotal === 0 ? 'ingerindo'
          : ativos >= baseTotal * EM_DIA_RATIO ? 'em_dia'
            : 'janela';

  // Dispara o resumo no WhatsApp dela uma única vez, quando o report fica pronto.
  useEffect(() => {
    if (!ready || sentRef.current || !report || report.count <= 0) return;
    sentRef.current = true;
    onTotal?.(report.total);
    const text =
      `Achamos ${report.count} cliente(s) que sumiram e ${formatBRL(report.total)} ` +
      `que dá pra recuperar. Veja o detalhe: ${reportUrl}`;
    void api.sendReport({ text, report_url: reportUrl }).catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  if (!ready && !soft && count === 0) {
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

  const cards = reportItemsToCards(report?.items ?? []);
  const shallow = count > 0 && count < SHALLOW;
  const ctaLabel = state === 'ok' ? 'Quero recuperar esses clientes' : 'Ver os planos';

  return (
    <div className="space-y-6">
      {state === 'ok' ? (
        <MoneyHeadline
          total={total}
          count={count}
          subtitle="clientes que falaram com você nos seus últimos meses e sumiram"
        />
      ) : (
        <ZeroHeadline
          state={state}
          error={error}
          baseTotal={baseTotal}
          ativos={ativos}
          semData={semData}
          hasBaseFields={report?.base_total !== undefined}
          polling={!ready}
          onRetry={retry}
        />
      )}

      {state === 'ok' && (
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

      {/* Faixas: informação de valor que antes ficava escondida no payload. */}
      {faixas && (faixas.m2_6 + faixas.m6_12 + faixas.m12_plus) > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-foreground">Há quanto tempo elas sumiram</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatBox label="Entre 2 e 6 meses" value={faixas.m2_6} />
            <StatBox label="Entre 6 meses e 1 ano" value={faixas.m6_12} />
            <StatBox label="Mais de 1 ano" value={faixas.m12_plus} />
          </div>
        </section>
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
        {/* SEMPRE visível: sem isso, com count===0 a lead ficava sem caminho
            nenhum (o wizard só desenha "Continuar" na tela `empresa`). */}
        <Button onClick={onQuero} size="lg" className="gap-1.5 w-full sm:w-auto">
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Não contratou? Tudo é apagado em até 72h, automaticamente, com confirmação.
      </p>
    </div>
  );
};

// ─── Headline honesto dos estados de R$ 0,00 ────────────────────────────────
const ZeroHeadline: FC<{
  state: Exclude<ReportState, 'ok'>;
  error: string | null;
  baseTotal: number;
  ativos: number;
  semData: number;
  /** a edge mandou o denominador? (contrato novo) — sem ele não citamos números. */
  hasBaseFields: boolean;
  /** o polling ainda está rodando por trás desta tela? */
  polling: boolean;
  onRetry: () => void;
}> = ({ state, error, baseTotal, ativos, semData, hasBaseFields, polling, onRetry }) => {
  const stillTrying = polling && (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <Loader2 className="h-3 w-3 animate-spin" /> Continuamos verificando em segundo plano.
    </p>
  );

  if (state === 'erro') {
    return (
      <Card className="p-6 space-y-3 border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Não conseguimos ler sua base agora
        </div>
        <p className="text-sm text-muted-foreground">
          Deu um problema ao carregar seu relatório. Isso <strong>não</strong> quer dizer que sua
          base está vazia nem que está em dia — a gente simplesmente não conseguiu ler agora.
        </p>
        {error && (
          <p className="text-xs text-muted-foreground/80 font-mono break-words">{error}</p>
        )}
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
        {stillTrying}
      </Card>
    );
  }

  if (state === 'ingerindo') {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Search className="h-5 w-5 text-primary" />
          Ainda estamos lendo suas conversas
        </div>
        <p className="text-sm text-muted-foreground">
          A varredura do seu histórico continua rodando. Dependendo do tamanho da sua base, isso
          pode levar alguns minutos. Ainda não dá para afirmar nada sobre suas clientes — nem que
          há dinheiro parado, nem que não há.
        </p>
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar agora
        </Button>
        {stillTrying}
      </Card>
    );
  }

  if (state === 'em_dia') {
    return (
      <Card className="p-6 space-y-3 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Sua base está em dia
        </div>
        <p className="text-sm text-muted-foreground">
          Lemos <strong>{nf.format(baseTotal)}</strong> contatos e{' '}
          <strong>{nf.format(ativos)}</strong> falaram com você há menos de 45 dias. Por isso não
          há clientes sumidas para reconquistar agora — isso é bom sinal.
        </p>
        <BaseStats baseTotal={baseTotal} ativos={ativos} semData={semData} />
        {stillTrying}
      </Card>
    );
  }

  // 'janela' — ingeriu, mas nada caiu no período analisado. O caso mais mentido antes.
  return (
    <Card className="p-6 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Search className="h-5 w-5 text-primary" />
        {hasBaseFields
          ? `Encontramos ${nf.format(baseTotal)} contatos na sua base — nenhum no período que a gente analisa`
          : 'Nenhum contato caiu no período que a gente analisa'}
      </div>
      <p className="text-sm text-muted-foreground">
        Este Raio-X procura quem falou com você e sumiu há mais de 45 dias. Nesta leitura, ninguém
        caiu nessa janela. Isso não é o mesmo que dizer que sua base está em dia — pode ser que o
        histórico sincronizado tenha vindo curto ou sem data de conversa.
      </p>
      {hasBaseFields && <BaseStats baseTotal={baseTotal} ativos={ativos} semData={semData} />}
      <p className="text-sm text-muted-foreground">
        Na plataforma, o Radar trabalha com a sua base completa, todo dia.
      </p>
      {stillTrying}
    </Card>
  );
};

const BaseStats: FC<{ baseTotal: number; ativos: number; semData: number }> = ({
  baseTotal, ativos, semData,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
    <StatBox label="Contatos lidos" value={baseTotal} />
    <StatBox label="Falaram há menos de 45 dias" value={ativos} />
    <StatBox label="Sem data de conversa" value={semData} hint="não entram na conta" />
  </div>
);

const StatBox: FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border bg-card p-3">
    <div className="text-2xl font-bold tracking-tight text-foreground">{nf.format(value)}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
    {hint && <div className="text-[11px] text-muted-foreground/70">{hint}</div>}
  </div>
);

export default RelatorioDinheiroStep;
