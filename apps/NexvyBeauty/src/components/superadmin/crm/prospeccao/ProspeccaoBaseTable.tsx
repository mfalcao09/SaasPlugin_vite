import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Triage = "principal" | "semente" | "nao_classificado" | "remocao_confirmada";
type Stage = "db" | "preselected" | "contacted" | "remarketing_pool" | "service" | "closing" | "onboarding" | "do_not_contact";
type Filters = {
  triagem?: Triage[];
  derived_stage?: Stage[];
  phone?: "with" | "without";
  suppressed?: boolean;
  active_operation?: boolean;
  query?: string;
};
type Profile = { id: string; handle: string | null; triagem: Triage | null; telefone: string | null; seguidores: number | null; origem: string };
type Lead = {
  lead_id: string; name: string; phone: string | null; phone_normalized: string | null;
  source: string | null; updated_at: string; derived_stage: Stage | null;
  triagem_summary: Triage; profile_count: number; followers_count: number;
  profiles: Profile[]; active_operation_count: number; is_suppressed: boolean;
};

const triageLabels: Record<Triage, string> = {
  principal: "Principal", semente: "Semente", nao_classificado: "Não classificado", remocao_confirmada: "Remoção confirmada",
};
const stageLabels: Record<Stage, string> = {
  db: "Na base", preselected: "Pré-selecionado", contacted: "Contatado", remarketing_pool: "Remarketing", service: "Em atendimento", closing: "Fechamento", onboarding: "Onboarding", do_not_contact: "Não contatar",
};
const triages = Object.keys(triageLabels) as Triage[];
const stages = Object.keys(stageLabels) as Stage[];
const controlClass = "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const numberFormat = new Intl.NumberFormat("pt-BR");

function formatPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^55\d{2}9\d{8}$/.test(digits)) return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 5)}${digits.slice(5, 9)}-${digits.slice(9)}`;
  return null;
}

function MultiFilter<T extends string>({ title, values, selected, labels, onChange }: {
  title: string; values: T[]; selected: T[]; labels: Record<T, string>; onChange: (values: T[]) => void;
}) {
  return (
    <details className="group relative">
      <summary className={controlClass + " flex cursor-pointer list-none items-center gap-2"}>
        {title}{selected.length ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{selected.length}</span> : null}
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-60 space-y-1 rounded-xl border border-border bg-card p-3 shadow-xl">
        {values.map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" checked={selected.includes(value)} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((entry) => entry !== value))} />
            {labels[value]}
          </label>
        ))}
        {selected.length > 0 && <button className="mt-1 w-full border-t border-border pt-2 text-left text-xs text-muted-foreground" onClick={() => onChange([])}>Limpar {title.toLowerCase()}</button>}
      </div>
    </details>
  );
}

export function ProspeccaoBaseTable({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [triagem, setTriagem] = useState<Triage[]>([]);
  const [stage, setStage] = useState<Stage[]>([]);
  const [phone, setPhone] = useState("all");
  const [suppression, setSuppression] = useState("all");
  const [operation, setOperation] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [descending, setDescending] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [targetTriage, setTargetTriage] = useState<Triage>("principal");
  const [actionBusy, setActionBusy] = useState(false);
  const filters = useMemo<Filters>(() => ({
    ...(triagem.length ? { triagem } : {}),
    ...(stage.length ? { derived_stage: stage } : {}),
    ...(phone !== "all" ? { phone: phone as "with" | "without" } : {}),
    ...(suppression !== "all" ? { suppressed: suppression === "yes" } : {}),
    ...(operation !== "all" ? { active_operation: operation === "yes" } : {}),
    ...(query.trim() ? { query: query.trim() } : {}),
  }), [triagem, stage, phone, suppression, operation, query]);
  const queryKey = ["nova-prospeccao-base", productId, filters, sortBy, descending, pageSize, page];
  const base = useQuery({
    queryKey,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("leads-operational-snapshot", {
        body: { product_id: productId, mode: "base", filters, sort_by: sortBy, sort_direction: descending ? "desc" : "asc", limit: pageSize, offset: page * pageSize },
      });
      if (error) throw error;
      return { rows: (data?.data ?? []) as Lead[], total: Number(data?.filtered_total ?? 0), summary: data?.summary ?? {} };
    },
  });
  const rows = base.data?.rows ?? [];
  const total = base.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCount = allFilteredSelected ? total : selected.length;
  const pageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.lead_id));

  const resetPageAndSelection = () => { setPage(0); setSelected([]); setAllFilteredSelected(false); };
  const changeSort = (value: string) => { setSortBy(value); setPage(0); };
  const togglePage = (checked: boolean) => {
    setAllFilteredSelected(false);
    setSelected(checked ? [...new Set([...selected, ...rows.map((row) => row.lead_id)])] : selected.filter((id) => !rows.some((row) => row.lead_id === id)));
  };
  const reclassify = async () => {
    const ids = allFilteredSelected ? null : selected;
    if (!ids?.length && !allFilteredSelected) return;
    const count = allFilteredSelected ? total : ids?.length ?? 0;
    if (!window.confirm(`Aplicar “${triageLabels[targetTriage]}” a ${numberFormat.format(count)} lead(s)? Essa alteração será registrada na triagem.`)) return;
    setActionBusy(true);
    try {
      const extractedIds = allFilteredSelected ? undefined : rows.filter((row) => ids?.includes(row.lead_id)).flatMap((row) => row.profiles.map((profile) => profile.id));
      const { error } = await supabase.functions.invoke("leads-triage", {
        body: allFilteredSelected ? { product_id: productId, lead_filters: filters, triagem: targetTriage } : { product_id: productId, extracted_lead_ids: extractedIds, triagem: targetTriage },
      });
      if (error) throw error;
      setSelected([]); setAllFilteredSelected(false);
      await qc.invalidateQueries({ queryKey: ["nova-prospeccao-base", productId] });
      await qc.invalidateQueries({ queryKey: ["nova-prospeccao-snapshot", productId] });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível aplicar a triagem.");
    } finally { setActionBusy(false); }
  };

  const start = total ? page * pageSize + 1 : 0;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leads na base</div><div className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(base.data?.summary.total_cards ?? 0)}</div></div>
        <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Com telefone</div><div className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(base.data?.summary.with_phone ?? 0)}</div></div>
        <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Correspondem aos filtros</div><div className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(total)}</div></div>
        <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operações ativas</div><div className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(base.data?.summary.active_operations ?? 0)}</div></div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPageAndSelection(); }} placeholder="Buscar nome, @handle ou telefone" className={controlClass + " w-full pl-9"} /></label>
          <MultiFilter title="Triagem" values={triages} selected={triagem} labels={triageLabels} onChange={(value) => { setTriagem(value); resetPageAndSelection(); }} />
          <MultiFilter title="Etapa" values={stages} selected={stage} labels={stageLabels} onChange={(value) => { setStage(value); resetPageAndSelection(); }} />
          <select aria-label="Filtro de telefone" value={phone} onChange={(event) => { setPhone(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Telefone: qualquer</option><option value="with">Com telefone</option><option value="without">Sem telefone</option></select>
          <select aria-label="Filtro de supressão" value={suppression} onChange={(event) => { setSuppression(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Supressão: qualquer</option><option value="yes">Suprimidos</option><option value="no">Não suprimidos</option></select>
          <select aria-label="Filtro de operações" value={operation} onChange={(event) => { setOperation(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Operação: qualquer</option><option value="yes">Com operação ativa</option><option value="no">Sem operação ativa</option></select>
          <Button variant="outline" onClick={() => void base.refetch()} disabled={base.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${base.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Ordenar por</span>
            <select aria-label="Ordenação" value={sortBy} onChange={(event) => changeSort(event.target.value)} className={controlClass}>
              <option value="name">Nome</option><option value="handle">@handle</option><option value="followers">Seguidores</option><option value="phone">Telefone normalizado</option><option value="stage">Etapa</option><option value="updated_at">Atualização</option>
            </select>
            <Button variant="ghost" size="icon" aria-label={descending ? "Ordem decrescente" : "Ordem crescente"} onClick={() => { setDescending((value) => !value); setPage(0); }}>{descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button>
          </div>
          <span className="text-xs text-muted-foreground">Os filtros se combinam: opções dentro de um grupo somam; grupos diferentes restringem em conjunto.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pageSelected} onChange={(event) => togglePage(event.target.checked)} />Selecionar esta página</label>
          {selectedCount > 0 && !allFilteredSelected && total > selected.length && <Button size="sm" variant="link" onClick={() => { setAllFilteredSelected(true); setSelected([]); }}>Selecionar todos os {numberFormat.format(total)} resultados</Button>}
          {allFilteredSelected && <span className="text-sm font-medium text-primary">Todos os {numberFormat.format(total)} resultados filtrados selecionados</span>}
          {(selected.length > 0 || allFilteredSelected) && <Button size="sm" variant="ghost" onClick={() => { setSelected([]); setAllFilteredSelected(false); }}>Limpar seleção</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Triagem de destino" value={targetTriage} onChange={(event) => setTargetTriage(event.target.value as Triage)} className={controlClass}>{triages.map((value) => <option key={value} value={value}>Mover para: {triageLabels[value]}</option>)}</select>
          <Button onClick={() => void reclassify()} disabled={!selectedCount || actionBusy}>{actionBusy ? "Aplicando…" : `Aplicar triagem${selectedCount ? ` (${numberFormat.format(selectedCount)})` : ""}`}</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>
              <th className="w-12 px-4 py-3"><span className="sr-only">Selecionar</span></th><th className="px-4 py-3">Lead / perfil</th><th className="px-4 py-3">Triagem</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3 text-right">Seguidores</th><th className="px-4 py-3">Operação</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {base.isLoading ? <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">Carregando os leads…</td></tr> : base.error ? <tr><td colSpan={7} className="p-8 text-center text-destructive">{(base.error as Error).message}</td></tr> : rows.map((row) => {
                const phoneLabel = formatPhone(row.phone_normalized);
                return <tr key={row.lead_id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3"><input aria-label={`Selecionar ${row.name}`} type="checkbox" checked={selected.includes(row.lead_id) || allFilteredSelected} onChange={(event) => { setAllFilteredSelected(false); setSelected((current) => event.target.checked ? [...new Set([...current, row.lead_id])] : current.filter((id) => id !== row.lead_id)); }} /></td>
                  <td className="max-w-[360px] px-4 py-3"><div className="truncate font-medium text-foreground">{row.name || "Sem nome"}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{row.profiles.map((profile) => profile.handle ? `@${profile.handle.replace(/^@/, "")}` : null).filter(Boolean).join(" · ") || "Sem perfil vinculado"}{row.profile_count > 1 ? ` · ${row.profile_count} perfis` : ""}</div></td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{triageLabels[row.triagem_summary]}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{stageLabels[row.derived_stage ?? "db"]}</td>
                  <td className="px-4 py-3 tabular-nums">{phoneLabel ? <span>{phoneLabel}</span> : row.phone ? <span title={`Valor armazenado: ${row.phone}`} className="text-amber-700">Revisar telefone</span> : <span className="text-muted-foreground">Não informado</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.profile_count ? numberFormat.format(row.followers_count) : "—"}</td>
                  <td className="px-4 py-3">{row.is_suppressed ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">Suprimido</span> : row.active_operation_count ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700">{row.active_operation_count} ativa(s)</span> : <span className="text-xs text-muted-foreground">Sem operação</span>}</td>
                </tr>;
              })}
              {!base.isLoading && !base.error && !rows.length && <tr><td colSpan={7} className="p-12 text-center"><Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><div className="font-medium">Nenhum lead encontrado</div><div className="mt-1 text-sm text-muted-foreground">Altere ou limpe alguns filtros para ampliar o resultado.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="text-sm text-muted-foreground">Exibindo <span className="font-medium text-foreground">{numberFormat.format(start)}–{numberFormat.format(end)}</span> de <span className="font-medium text-foreground">{numberFormat.format(total)}</span> leads</div>
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="base-page-size" className="text-sm text-muted-foreground">Por página</label><select id="base-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); resetPageAndSelection(); }} className={controlClass}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><span className="min-w-24 text-center text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span><Button variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0 || base.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setSelected([]); setAllFilteredSelected(false); }}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={page + 1 >= totalPages || base.isFetching} onClick={() => { setPage((value) => value + 1); setSelected([]); setAllFilteredSelected(false); }}><ChevronRight className="h-4 w-4" /></Button></div>
        </footer>
      </div>
      <p className="text-xs text-muted-foreground">Telefones que já atendem ao padrão móvel brasileiro são exibidos como +55 (DDD) 9XXXX-XXXX. Valores fora desse padrão ficam sinalizados para revisão e não são alterados automaticamente.</p>
    </section>
  );
}
