import { useId, useState } from "react";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, ListChecks, Loader2, Search, Send, Sparkles, TriangleAlert,
} from "lucide-react";
import styles from "./DashboardActions.module.css";

type Lead = {
  lead_id: string;
  name: string;
  phone: string | null;
  derived_stage: string | null;
  triagem_summary: string;
  is_suppressed: boolean;
  active_operation_count: number;
  profiles: Array<{ handle?: string | null }>;
};
type Props = {
  summary: {
    total_cards: number;
    by_triagem: Record<string, number>;
    campaign_problems?: number;
  };
  rows: Lead[];
  isRefreshing: boolean;
  onNavigate: (section: string) => void;
};
type ActionKey = "triage" | "enrichment" | "campaign" | "issues";
const format = new Intl.NumberFormat("pt-BR");
const PAGE_SIZE = 4;
const count = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function DashboardActions({ summary, rows, isRefreshing, onNavigate }: Props) {
  const id = useId();
  const [selected, setSelected] = useState<ActionKey | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  // These sample predicates deliberately match the unchanged OperationView.
  const enrichment = rows.filter((row) => !row.phone);
  const campaign = rows.filter((row) => row.derived_stage === "preselected" && !!row.phone);
  const triage = rows.filter((row) => row.triagem_summary === "nao_classificado");
  const actions = [
    {
      key: "triage" as const, label: "Não classificados", icon: CircleHelp,
      total: count(summary.by_triagem?.nao_classificado), scope: "Total na base",
      title: "Definir a categoria dos leads", unit: "sem classificação na base",
      reason: "Revise a categoria antes de preparar a abordagem.",
      matches: triage, condition: "Sem classificação",
      cta: "Abrir base de leads", section: "v-nova-prospeccao-base",
    },
    {
      key: "enrichment" as const, label: "Para enriquecimento", icon: Sparkles,
      total: enrichment.length, scope: "Nesta amostra",
      title: "Completar os contatos", unit: "sem telefone na amostra",
      reason: "Confira quais leads estão sem telefone antes de abrir o enriquecimento.",
      matches: enrichment, condition: "Sem telefone",
      cta: "Abrir enriquecimento", section: "v-nova-prospeccao-enriquecimento",
    },
    {
      key: "campaign" as const, label: "Pré-selecionados", icon: Send,
      total: campaign.length, scope: "Com telefone · amostra",
      title: "Preparar a abordagem", unit: "pré-selecionados com telefone",
      reason: "A campanha valida os bloqueios e a categoria antes da preparação.",
      matches: campaign, condition: "Com telefone",
      cta: "Abrir campanhas", section: "v-nova-prospeccao-campanhas",
    },
    {
      key: "issues" as const, label: "Campanhas a revisar", icon: TriangleAlert,
      total: count(summary.campaign_problems), scope: "Resumo do produto",
      title: "Conferir as campanhas", unit: "no indicador de problemas",
      reason: "O resumo inclui campanhas pausadas e ocorrências de falha.",
      matches: [] as Lead[], condition: "",
      cta: "Ver campanhas", section: "v-nova-prospeccao-campanhas",
    },
  ];
  const action = actions.find(({ key }) => key === selected)
    ?? actions.find(({ total }) => total !== null && total > 0)
    ?? actions[0];
  const withVolume = actions.filter(({ total }) => total !== null && total > 0).length;
  const allKnown = actions.every(({ total }) => total !== null);
  const isFlagged = (lead: Lead) => lead.is_suppressed || lead.active_operation_count > 0;
  const flaggedCount = action.matches.filter(isFlagged).length;
  const term = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = action.matches.filter((lead) =>
    (!flaggedOnly || isFlagged(lead)) && [lead.name, lead.phone, ...lead.profiles.map(({ handle }) => handle)]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const ActionIcon = action.icon;
  const sampleLabel = `Amostra de ${format.format(rows.length)} leads`;

  return (
    <section className={styles.actions} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`${id}-title`}><ListChecks size={17} aria-hidden="true" /> Próximas ações</h2>
          <p>Escolha uma frente, confira os leads e siga para a operação.</p>
        </div>
        <span className={styles.summary} role="status">
          {isRefreshing ? <><Loader2 size={13} className={styles.spinner} aria-hidden="true" /> Atualizando…</>
            : allKnown ? `${withVolume} de 4 frentes com volume` : "Resumo parcial"}
        </span>
      </div>
      <div className={styles.workbench} aria-busy={isRefreshing}>
        <nav className={styles.queue} aria-label="Frentes de trabalho">
          <div className={styles.queueHeading}>Fila de trabalho <span>Selecionar para conferir</span></div>
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className={styles.queueItem}
                data-empty={item.total === 0 || undefined}
                aria-pressed={action.key === item.key} aria-controls={`${id}-detail`}
                onClick={() => { setSelected(item.key); setQuery(""); setPage(0); setFlaggedOnly(false); }}>
                <span className={styles.queueIcon}><Icon size={18} aria-hidden="true" /></span>
                <span className={styles.queueLabel}><strong>{item.label}</strong><span>{item.scope}</span></span>
                <span className={styles.queueCount}>{item.total === null ? "—" : format.format(item.total)}</span>
                <ArrowRight size={14} className={styles.queueArrow} aria-hidden="true" />
              </button>
            );
          })}
          <div className={styles.queueFoot}><span className={styles.sampleDot} />{sampleLabel}<span>Totais identificados por frente.</span></div>
        </nav>
        <div className={styles.detail} id={`${id}-detail`} role="region" aria-labelledby={`${id}-detail-title`}>
          <div className={styles.detailHeading}>
            <div className={styles.detailTitle}><span className={styles.detailIcon}><ActionIcon size={20} aria-hidden="true" /></span>
              <div><h3 id={`${id}-detail-title`}>{action.title}</h3><p>{action.reason}</p></div>
            </div>
            <div className={styles.metric}><strong>{action.total === null ? "—" : format.format(action.total)}</strong><span>{action.unit}</span></div>
          </div>

          {action.key === "issues" ? (
            <div className={styles.empty}>
              {action.total === 0 ? <CheckCircle2 size={28} aria-hidden="true" /> : <TriangleAlert size={28} aria-hidden="true" />}
              <strong>{action.total === null ? "Contagem indisponível" : action.total === 0 ? "Nenhuma ocorrência no resumo" : "Há campanhas para conferir"}</strong>
              <p>{action.total === null ? "Atualize o dashboard para consultar o indicador." : "Abra as campanhas para consultar o histórico e os estados individuais."}</p>
            </div>
          ) : (
            <>
              <div className={styles.toolbar}>
                <span><b>{format.format(action.matches.length)}</b> nesta amostra <span className={styles.sampleDenominator}>/ {format.format(rows.length)} carregados</span></span>
                <div className={styles.tools}>
                <button type="button" className={styles.flagFilter} aria-pressed={flaggedOnly}
                  disabled={flaggedCount === 0 && !flaggedOnly}
                  title="Leads bloqueados para contato ou com operação em andamento"
                  onClick={() => { setFlaggedOnly((current) => !current); setPage(0); }}>
                  <TriangleAlert size={13} aria-hidden="true" /> Sinalizados ({format.format(flaggedCount)})
                </button>
                <label className={styles.search}>
                  <Search size={14} aria-hidden="true" /><span className="sr-only">Buscar leads nesta frente</span>
                  <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Buscar lead" type="search" />
                </label>
                </div>
              </div>
              <div className={styles.leadList}>
                {visible.length ? visible.map((lead) => {
                  const handle = lead.profiles.find((profile) => profile.handle)?.handle;
                  const state = lead.is_suppressed ? "Contato bloqueado"
                    : lead.active_operation_count > 0 ? "Em operação" : action.condition;
                  return (
                    <div key={lead.lead_id} className={styles.leadRow}>
                      <span className={styles.avatar} aria-hidden="true">{(lead.name?.trim() || "L").slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                      <span className={styles.leadName}><strong title={lead.name || "Lead sem nome"}>{lead.name?.trim() || "Lead sem nome"}</strong><span>{lead.phone || (handle ? `@${handle.replace(/^@/, "")}` : "Sem contato informado")}</span></span>
                      <span className={styles.leadState} data-attention={lead.is_suppressed || lead.active_operation_count > 0 || undefined}>{state}</span>
                    </div>
                  );
                }) : <div className={styles.empty}>
                  <Search size={24} aria-hidden="true" />
                  <strong>{term ? "Nenhum resultado nesta busca" : flaggedOnly ? "Nenhum lead sinalizado nesta amostra" : "Nenhum lead desta frente na amostra"}</strong>
                  <p>{term ? "Tente outro nome ou contato." : flaggedOnly ? "Desative o filtro para consultar os demais leads." : action.key === "triage" && (action.total ?? 0) > 0 ? "O total da base inclui leads fora dos registros carregados aqui." : "Os leads aparecerão aqui quando atenderem ao critério desta frente."}</p>
                </div>}
              </div>
              <div className={styles.pagination}>
                <span role="status">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de ${format.format(filtered.length)}` : "0 resultados"}</span>
                <div><button type="button" aria-label="Leads anteriores" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
                  <button type="button" aria-label="Próximos leads" disabled={currentPage === pages - 1 || !filtered.length} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div>
              </div>
            </>
          )}
          <div className={styles.detailFooter}>
            <span>{action.key === "issues" ? "Detalhes no histórico de campanhas." : "A revisão e a execução continuam na tela da operação."}</span>
            <button type="button" className={styles.openButton} disabled={isRefreshing} onClick={() => onNavigate(action.section)}>{action.cta}<ArrowUpRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
