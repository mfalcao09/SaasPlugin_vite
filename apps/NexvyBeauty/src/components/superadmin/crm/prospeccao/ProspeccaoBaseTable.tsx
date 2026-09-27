import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, CircleAlert, ContactRound, Copy, Eye, Filter, MoreHorizontal, Phone, RefreshCw, Search, Users, Workflow, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PlatformCrmLeadDetail } from "../leads/PlatformCrmLeadDetail";
import { toast } from "sonner";

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
  const [leadDetailId, setLeadDetailId] = useState<string | null>(null);
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
      if (error) {
        const context = (error as { context?: Response }).context;
        const payload = await context?.clone().json().catch(() => null);
        throw new Error(payload?.error ?? error.message ?? "Não foi possível carregar a base de leads.");
      }
      return { rows: (data?.data ?? []) as Lead[], total: Number(data?.filtered_total ?? 0), summary: data?.summary ?? {} };
    },
  });
  const rows = base.data?.rows ?? [];
  const total = base.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCount = allFilteredSelected ? total : selected.length;
  const selectedRows = rows.filter((row) => selected.includes(row.lead_id));
  const pageSelected = rows.length > 0 && (allFilteredSelected || rows.every((row) => selected.includes(row.lead_id)));
  const copyValue = async (value: string | null | undefined, label: string) => {
    if (!value) return toast.error(`${label} indisponível para este lead.`);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  };
  const copySelectedContacts = async () => {
    if (allFilteredSelected) return toast.error("Selecione leads desta página para copiar contatos.");
    const payload = selectedRows.map((row) => {
      const handle = row.profiles.find((profile) => profile.handle)?.handle;
      return [row.name || "Sem nome", handle ? `@${handle.replace(/^@/, "")}` : "", formatPhone(row.phone_normalized) ?? row.phone ?? ""].join("\t");
    }).filter((line) => line.split("\t").some(Boolean)).join("\n");
    if (!payload) return toast.error("Os leads selecionados não têm dados de contato.");
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(`${numberFormat.format(selectedRows.length)} contato(s) copiado(s).`);
    } catch {
      toast.error("Não foi possível copiar os contatos.");
    }
  };

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
  const activeFilterCount = triagem.length + stage.length + Number(phone !== "all") + Number(suppression !== "all") + Number(operation !== "all") + Number(Boolean(query.trim()));
  return (
    <section className="space-y-3.5">
      {base.error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0" />{(base.error as Error).message}</span><Button variant="outline" size="sm" onClick={() => void base.refetch()} disabled={base.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${base.isFetching ? "animate-spin" : ""}`} />Tentar novamente</Button></div> : null}

      <div className="overflow-visible rounded-2xl border border-border bg-card shadow-[0_8px_28px_-22px_rgba(15,23,42,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/[0.045] via-card to-card px-5 py-4">
          <div className="flex items-center gap-3"><span className="rounded-xl border border-primary/10 bg-primary/10 p-2.5 text-primary"><ContactRound className="h-5 w-5" /></span><div><h2 className="text-base font-semibold tracking-tight">Localizar leads</h2><p className="mt-0.5 text-sm text-muted-foreground">Combine critérios para encontrar o segmento certo.</p></div></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"><Filter className="h-3.5 w-3.5" />{activeFilterCount ? `${activeFilterCount} critérios ativos` : "Sem filtros"}</span>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-[1_1_280px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPageAndSelection(); }} placeholder="Nome, @perfil ou telefone" className={controlClass + " w-full pl-9 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"} /></label>
          <MultiFilter title="Triagem" values={triages} selected={triagem} labels={triageLabels} onChange={(value) => { setTriagem(value); resetPageAndSelection(); }} />
          <MultiFilter title="Etapa" values={stages} selected={stage} labels={stageLabels} onChange={(value) => { setStage(value); resetPageAndSelection(); }} />
          <select aria-label="Filtro de telefone" value={phone} onChange={(event) => { setPhone(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Telefone · Todos</option><option value="with">Com telefone</option><option value="without">Sem telefone</option></select>
          <select aria-label="Filtro de supressão" value={suppression} onChange={(event) => { setSuppression(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Supressão · Todas</option><option value="yes">Suprimidos</option><option value="no">Não suprimidos</option></select>
          <select aria-label="Filtro de operações" value={operation} onChange={(event) => { setOperation(event.target.value); resetPageAndSelection(); }} className={controlClass}><option value="all">Operação · Todas</option><option value="yes">Com operação ativa</option><option value="no">Sem operação ativa</option></select>
          <Button variant="outline" className="shrink-0" onClick={() => void base.refetch()} disabled={base.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${base.isFetching ? "animate-spin" : ""}`} />{base.isFetching ? "Atualizando" : "Atualizar"}</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ordenação</span>
            <select aria-label="Ordenação" value={sortBy} onChange={(event) => changeSort(event.target.value)} className={controlClass + " min-w-44"}>
              <option value="name">Nome</option><option value="handle">@handle</option><option value="followers">Seguidores</option><option value="phone">Telefone normalizado</option><option value="stage">Etapa</option><option value="updated_at">Atualização</option>
            </select>
            <Button variant="ghost" size="icon" aria-label={descending ? "Ordem decrescente" : "Ordem crescente"} onClick={() => { setDescending((value) => !value); setPage(0); }}>{descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button>
          </div>
          {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTriagem([]); setStage([]); setPhone("all"); setSuppression("all"); setOperation("all"); resetPageAndSelection(); }}><X className="mr-1.5 h-3.5 w-3.5" />Limpar filtros</Button>}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_34px_-26px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
          <div><h2 className="text-sm font-semibold">Base de leads</h2><p className="mt-0.5 text-xs text-muted-foreground">Ações individuais ficam no menu ⋯ à direita de cada linha.</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${base.isFetching ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />{base.isFetching ? "Sincronizando" : "Dados atualizados"}</div>
        </div>
        {selectedCount > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 bg-primary/[0.045] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground">{numberFormat.format(selectedCount)}</span>
            <span className="text-sm font-semibold">Ações em lote</span>
            <span className="text-xs text-muted-foreground">{allFilteredSelected ? "todos os resultados filtrados" : selectedCount === 1 ? "lead selecionado" : "leads selecionados"}</span>
            {!allFilteredSelected && total > selected.length && <Button size="sm" variant="link" className="h-8 px-1" onClick={() => { setAllFilteredSelected(true); setSelected([]); }}>Selecionar os {numberFormat.format(total)} resultados</Button>}
            {allFilteredSelected && <Button size="sm" variant="link" className="h-8 px-1" onClick={() => { setAllFilteredSelected(false); setSelected([]); }}>Desfazer seleção total</Button>}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setSelected([]); setAllFilteredSelected(false); }}><X className="mr-1 h-3.5 w-3.5" />Limpar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount === 1 && !allFilteredSelected && <Button variant="outline" size="sm" onClick={() => setLeadDetailId(selected[0])}><Eye className="mr-2 h-4 w-4" />Visualizar</Button>}
            <Button variant="outline" size="sm" onClick={() => void copySelectedContacts()} disabled={allFilteredSelected || !selectedRows.length} title={allFilteredSelected ? "Disponível ao selecionar leads desta página" : "Copia nome, @perfil e telefone dos selecionados"}><Copy className="mr-2 h-4 w-4" />Copiar contatos</Button>
            <select aria-label="Triagem de destino" value={targetTriage} onChange={(event) => setTargetTriage(event.target.value as Triage)} className={controlClass + " h-9 bg-card"}>{triages.map((value) => <option key={value} value={value}>{triageLabels[value]}</option>)}</select>
            <Button size="sm" onClick={() => void reclassify()} disabled={actionBusy}><Workflow className="mr-2 h-4 w-4" />{actionBusy ? "Aplicando…" : "Aplicar triagem"}</Button>
          </div>
        </div> : null}
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-muted/70 text-[11px] uppercase tracking-[0.12em] text-muted-foreground"><tr>
              <th className="sticky left-0 z-20 w-12 border-r border-border bg-muted px-4 py-3"><input className="h-4 w-4 accent-primary" title="Selecionar todos os leads desta página" aria-label="Selecionar todos os leads desta página" type="checkbox" checked={pageSelected} onChange={(event) => togglePage(event.target.checked)} /></th><th className="min-w-[280px] px-4 py-3">Lead / perfil</th><th className="whitespace-nowrap px-4 py-3">Triagem</th><th className="whitespace-nowrap px-4 py-3">Etapa</th><th className="whitespace-nowrap px-4 py-3">Telefone</th><th className="whitespace-nowrap px-4 py-3 text-right">Seguidores</th><th className="whitespace-nowrap px-4 py-3">Operação</th><th className="sticky right-0 z-20 w-[68px] border-l border-border bg-muted px-2 py-3 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]"><span>Ações</span></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {base.isLoading ? <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">Carregando os leads…</td></tr> : base.error ? <tr><td colSpan={8} className="p-8 text-center text-destructive">{(base.error as Error).message}</td></tr> : rows.map((row) => {
                const phoneLabel = formatPhone(row.phone_normalized);
                const handles = row.profiles.map((profile) => profile.handle ? `@${profile.handle.replace(/^@/, "")}` : null).filter(Boolean);
                return <tr key={row.lead_id} aria-selected={selected.includes(row.lead_id) || allFilteredSelected} className={`group border-l-2 transition-colors hover:bg-primary/[0.025] ${selected.includes(row.lead_id) || allFilteredSelected ? "border-l-primary bg-primary/[0.035]" : "border-l-transparent"}`}>
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-4 py-3 group-hover:bg-muted/30"><input className="accent-primary" aria-label={`Selecionar ${row.name}`} type="checkbox" checked={selected.includes(row.lead_id) || allFilteredSelected} onChange={(event) => { setAllFilteredSelected(false); setSelected((current) => event.target.checked ? [...new Set([...current, row.lead_id])] : current.filter((id) => id !== row.lead_id)); }} /></td>
                  <td className="max-w-[360px] whitespace-nowrap px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-xs font-semibold text-primary">{(row.name || "?").trim().slice(0, 2).toLocaleUpperCase("pt-BR")}</span><div className="min-w-0"><div className="truncate font-semibold text-foreground">{row.name || "Sem nome"}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{handles.join(" · ") || "Sem perfil vinculado"}{row.profile_count > 1 ? ` · ${row.profile_count} perfis` : ""}</div></div></div></td>
                  <td className="whitespace-nowrap px-4 py-3"><span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{triageLabels[row.triagem_summary]}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{stageLabels[row.derived_stage ?? "db"]}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{phoneLabel ? <span>{phoneLabel}</span> : row.phone ? <span title={`Valor armazenado: ${row.phone}`} className="text-amber-700">Revisar telefone</span> : <span className="text-muted-foreground">Não informado</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.profile_count ? numberFormat.format(row.followers_count) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.is_suppressed ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">Suprimido</span> : row.active_operation_count ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700">{row.active_operation_count} ativa(s)</span> : <span className="text-xs text-muted-foreground">Sem operação</span>}</td>
                  <td className="sticky right-0 z-10 border-l border-border bg-card px-2 py-2 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-muted/50">
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Abrir menu de ações de ${row.name || "lead"}`} title="Ações do lead" className="h-9 w-9 border-border bg-card text-foreground shadow-sm hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"><MoreHorizontal className="h-[18px] w-[18px]" /><span className="sr-only">Ações do lead</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ações do lead</div><DropdownMenuItem onClick={() => setLeadDetailId(row.lead_id)}><Eye className="mr-2 h-4 w-4" />Visualizar lead</DropdownMenuItem><DropdownMenuItem disabled={selected.includes(row.lead_id) || allFilteredSelected} onClick={() => { setSelected((current) => [...new Set([...current, row.lead_id])]); setAllFilteredSelected(false); }}><Check className="mr-2 h-4 w-4" />Selecionar para ação em lote</DropdownMenuItem><DropdownMenuItem disabled={!phoneLabel && !row.phone} onClick={() => void copyValue(phoneLabel ?? row.phone, "Telefone")}><Phone className="mr-2 h-4 w-4" />Copiar telefone</DropdownMenuItem><DropdownMenuItem disabled={!handles.length} onClick={() => void copyValue(handles[0], "Perfil")}><Copy className="mr-2 h-4 w-4" />Copiar @perfil</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>;
              })}
              {!base.isLoading && !base.error && !rows.length && <tr><td colSpan={8} className="p-12 text-center"><Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><div className="font-medium">Nenhum lead encontrado</div><div className="mt-1 text-sm text-muted-foreground">Altere ou limpe alguns filtros para ampliar o resultado.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="text-sm text-muted-foreground">Exibindo <span className="font-medium text-foreground">{numberFormat.format(start)}–{numberFormat.format(end)}</span> · <span className="font-medium text-foreground">{numberFormat.format(total)} leads filtrados</span></div>
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="base-page-size" className="text-sm text-muted-foreground">Por página</label><select id="base-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); resetPageAndSelection(); }} className={controlClass}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><span className="min-w-24 text-center text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span><Button variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0 || base.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setSelected([]); setAllFilteredSelected(false); }}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={page + 1 >= totalPages || base.isFetching} onClick={() => { setPage((value) => value + 1); setSelected([]); setAllFilteredSelected(false); }}><ChevronRight className="h-4 w-4" /></Button></div>
        </footer>
      </div>
      <Dialog open={Boolean(leadDetailId)} onOpenChange={(open) => !open && setLeadDetailId(null)}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
          <VisuallyHidden><DialogTitle>Detalhes do lead</DialogTitle></VisuallyHidden>
          {leadDetailId && <PlatformCrmLeadDetail leadId={leadDetailId} onBack={() => setLeadDetailId(null)} onOpenLead={setLeadDetailId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
