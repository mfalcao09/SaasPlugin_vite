import { useId, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Headphones,
  Layers3,
  Loader2,
  Repeat2,
  Send,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import styles from "./OperationalFunnel.module.css";

const stages = [
  { key: "db", label: "Na Base", icon: Layers3, detail: "Leads na base de prospecção." },
  { key: "preselected", label: "Pré-selecionados", icon: Target, detail: "Leads pré-selecionados para a abordagem." },
  { key: "contacted", label: "Contatados", icon: Send, detail: "Leads com contato registrado." },
  { key: "service", label: "Em atendimento", icon: Headphones, detail: "Leads em atendimento comercial." },
  { key: "remarketing_pool", label: "Remarketing", icon: Repeat2, detail: "Leads no grupo de remarketing.", branch: "Retorno" },
  { key: "do_not_contact", label: "Não Contatar", icon: Ban, detail: "Leads marcados para não receber contato.", branch: "Bloqueio" },
  { key: "closing", label: "Fechamento", icon: CheckCircle2, detail: "Leads na etapa de fechamento." },
  { key: "onboarding", label: "Onboarding", icon: Sparkles, detail: "Leads na etapa de onboarding." },
] as const;

const phases = [
  { key: "entry", label: "Entrada", range: "01", from: 0, to: 1 },
  { key: "qualification", label: "Qualificação", range: "02–03", from: 1, to: 3 },
  { key: "relationship", label: "Relacionamento", range: "04–06", from: 3, to: 6 },
  { key: "conversion", label: "Conversão", range: "07–08", from: 6, to: 8 },
] as const;

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentageFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function percentageLabel(value: number, total: number) {
  const share = total > 0 ? (value / total) * 100 : 0;
  return share > 0 && share < 0.1 ? "<0,1%" : `${percentageFormat.format(share)}%`;
}

type Props = {
  byStage: Record<string, number> | undefined;
  isRefreshing?: boolean;
};

/** Current-state distribution only; it does not imply historical conversion rates. */
export function OperationalFunnel({ byStage, isRefreshing = false }: Props) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const values = stages.map((stage) => {
    const raw = byStage?.[stage.key];
    return {
      ...stage,
      count: typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null,
    };
  });
  const complete = values.every(({ count }) => count !== null);
  const total = values.reduce((sum, { count }) => sum + (count ?? 0), 0);
  const selected = values.find(({ key }) => key === selectedKey);

  return (
    <section className={styles.funnel} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHeading}>
        <h2 id={`${id}-title`}>Estágio operacional</h2>
        <span>4 fases <span aria-hidden="true">/</span> 8 etapas</span>
      </div>
      <div className={styles.panel} aria-busy={isRefreshing}>
        <div className={styles.phases}>
          {phases.map((phase) => (
            <div
              key={phase.key}
              className={styles.phase}
              data-phase={phase.key}
              style={{ "--phase-span": phase.to - phase.from } as CSSProperties}
            >
              <div className={styles.ribbon}>
                <h3>{phase.label}</h3>
                <span className={styles.phaseRange}>{phase.range}</span>
              </div>
              <div className={styles.stations}>
                {values.slice(phase.from, phase.to).map((stage, localIndex) => {
                  const index = phase.from + localIndex;
                  const StageIcon = stage.icon;
                  const branch = "branch" in stage ? stage.branch : null;
                  const share = complete && stage.count !== null
                    ? percentageLabel(stage.count, total)
                    : "—";
                  const fraction = complete && total > 0 ? (stage.count ?? 0) / total : 0;
                  const countLabel = stage.count === null
                    ? "Dados indisponíveis"
                    : `${numberFormat.format(stage.count)} ${stage.count === 1 ? "lead" : "leads"}`;

                  return (
                    <button
                      key={stage.key}
                      type="button"
                      className={styles.station}
                      data-stage={stage.key}
                      data-branch={branch || undefined}
                      data-edge={index === 0 ? "first" : index === stages.length - 1 ? "last" : undefined}
                      disabled={stage.count === null}
                      aria-label={`${stage.label}: ${countLabel}${complete ? `, ${share} das etapas` : ""}`}
                      aria-pressed={selectedKey === stage.key}
                      aria-controls={`${id}-detail`}
                      onClick={() => setSelectedKey((current) => current === stage.key ? null : stage.key)}
                      onKeyDown={(event) => { if (event.key === "Escape") setSelectedKey(null); }}
                    >
                      <span className={styles.stationTop}>
                        <span className={styles.stationIndex}>{String(index + 1).padStart(2, "0")}</span>
                        {branch && <span className={styles.branchLabel}>{branch}</span>}
                      </span>
                      <span className={styles.track} aria-hidden="true">
                        <span className={styles.node}><StageIcon size={19} strokeWidth={1.8} /></span>
                        {!branch && index < stages.length - 1 && <ArrowRight className={styles.direction} size={13} />}
                      </span>
                      <span className={styles.stageLabel}>{stage.label}</span>
                      <span className={styles.stageCount}>{stage.count === null ? "—" : numberFormat.format(stage.count)}</span>
                      <span className={styles.share}>
                        <span className={styles.meter} aria-hidden="true">
                          <span style={{ transform: `scaleX(${fraction})` }} />
                        </span>
                        <span>{share}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.insight} id={`${id}-detail`} role="status" aria-live="polite" aria-atomic="true">
          <Workflow size={16} aria-hidden="true" className={styles.insightIcon} />
          <div className={styles.insightText}>
            {selected && selected.count !== null ? (
              <>
                <strong>{selected.label}</strong>
                <span>{selected.detail}</span>
              </>
            ) : (
              <>
                <strong>{complete ? `${numberFormat.format(total)} leads nas etapas` : "Dados das etapas incompletos"}</strong>
                <span>{complete && total === 0 ? "Os volumes aparecerão quando houver leads nestas etapas." : "Selecione uma etapa para explorar sua distribuição."}</span>
              </>
            )}
          </div>
          <span className={styles.insightMetric}>
            {isRefreshing ? (
              <><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Atualizando…</>
            ) : selected && selected.count !== null && complete ? (
              <><b>{percentageLabel(selected.count, total)}</b> das etapas</>
            ) : "Distribuição atual"}
          </span>
        </div>
      </div>
    </section>
  );
}
