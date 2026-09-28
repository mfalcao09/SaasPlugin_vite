import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, CircleAlert, ChevronDown, Copy, Eye, ExternalLink, MoreHorizontal, Pencil, Phone, RefreshCw, Search, Users, Workflow, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProspeccaoLeadDetail } from "./ProspeccaoLeadDetail";
import { toast } from "sonner";
import "./ProspeccaoBaseTable.css";

type Triage = "principal" | "semente" | "nao_classificado" | "remocao_confirmada";
type Stage = "db" | "preselected" | "contacted" | "remarketing_pool" | "service" | "closing" | "onboarding" | "do_not_contact";
type DncReason = "hard_stop" | "cadence_exhausted" | "closed_lost" | "unknown";
type FollowersRange = "under_1k" | "1k_3k" | "3k_10k" | "10k_50k" | "50k_plus";
type PhoneQuality = "valid" | "invalid" | "missing";
type Filters = {
  triagem?: Triage[];
  derived_stage?: Stage[];
  phone?: "with" | "without";
  phone_quality?: PhoneQuality;
  followers_range?: FollowersRange;
  name_identifiability?: "identifiable" | "not_identifiable";
  instagram?: "with" | "without";
  dnc_reason?: DncReason[];
  query?: string;
};
export type Profile = { id: string; handle: string | null; triagem: Triage | null; telefone: string | null; seguidores: number | null; origem: string };
export type Lead = {
  lead_id: string; name: string; phone: string | null; phone_normalized: string | null;
  source: string | null; updated_at: string; derived_stage: Stage | null; dnc_reason: DncReason | null;
  triagem_summary: Triage; profile_count: number; followers_count: number;
  profiles: Profile[];
};

const triageLabels: Record<Triage, string> = {
  principal: "Principal", semente: "Semente", nao_classificado: "Não classificado", remocao_confirmada: "Remoção confirmada",
};
const stageLabels: Record<Stage, string> = {
  db: "Na base", preselected: "Pré-selecionado", contacted: "Contatado", remarketing_pool: "Remarketing", service: "Em atendimento", closing: "Fechamento", onboarding: "Onboarding", do_not_contact: "Não contatar",
};
const dncReasonLabels: Record<DncReason, string> = {
  hard_stop: "Hard stop", cadence_exhausted: "Cadência esgotada", closed_lost: "Closed lost", unknown: "Não informado",
};
const followerLabels: Record<FollowersRange, string> = { under_1k: "Menos de 1 mil", "1k_3k": "1 mil a 2.999", "3k_10k": "3 mil a 9.999", "10k_50k": "10 mil a 49.999", "50k_plus": "50 mil ou mais" };
const phoneQualityLabels: Record<PhoneQuality, string> = { valid: "Telefone válido", invalid: "Revisar telefone", missing: "Sem telefone" };
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

function instagramUrl(handle: string | null | undefined) {
  const normalized = String(handle ?? "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(normalized)) return null;
  return `https://www.instagram.com/${encodeURIComponent(normalized)}/`;
}

function MultiFilter<T extends string>({ title, values, selected, labels, onChange }: {
  title: string; values: T[]; selected: T[]; labels: Record<T, string>; onChange: (values: T[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="lead-filter-trigger">
          {title}{selected.length > 0 && <span className="lead-filter-count">{selected.length}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-2">
        {values.map((value) => (
          <DropdownMenuCheckboxItem key={value} checked={selected.includes(value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onChange(checked ? [...selected, value] : selected.filter((entry) => entry !== value))}>
            {labels[value]}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && <DropdownMenuItem onSelect={() => onChange([])}>Limpar seleção</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SingleFilter<T extends string>({ title, value, values, labels, onChange }: {
  title: string; value: T | null; values: T[]; labels: Record<T, string>; onChange: (value: T | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="lead-filter-trigger">{value ? labels[value] : title}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-2">
        {values.map((item) => <DropdownMenuCheckboxItem key={item} checked={value === item} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onChange(checked ? item : null)}>{labels[item]}</DropdownMenuCheckboxItem>)}
        {value && <DropdownMenuItem onSelect={() => onChange(null)}>Limpar seleção</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProspeccaoBaseTable({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [triagem, setTriagem] = useState<Triage[]>([]);
  const [stage, setStage] = useState<Stage[]>([]);
  const [phone, setPhone] = useState<"with" | "without" | null>(null);
  const [phoneQuality, setPhoneQuality] = useState<PhoneQuality | null>(null);
  const [followersRange, setFollowersRange] = useState<FollowersRange | null>(null);
  const [nameIdentifiability, setNameIdentifiability] = useState<"identifiable" | "not_identifiable" | null>(null);
  const [instagram, setInstagram] = useState<"with" | "without" | null>(null);
  const [dncReason, setDncReason] = useState<DncReason[]>([]);
  const [sortBy, setSortBy] = useState("name");
  const [descending, setDescending] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [targetTriage, setTargetTriage] = useState<Triage>("principal");
  const [actionBusy, setActionBusy] = useState(false);
  const [leadDetail, setLeadDetail] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const filters = useMemo<Filters>(() => ({
    ...(triagem.length ? { triagem } : {}),
    ...(stage.length ? { derived_stage: stage } : {}),
    ...(phone ? { phone } : {}),
    ...(phoneQuality ? { phone_quality: phoneQuality } : {}),
    ...(followersRange ? { followers_range: followersRange } : {}),
    ...(nameIdentifiability ? { name_identifiability: nameIdentifiability } : {}),
    ...(instagram ? { instagram } : {}),
    ...(stage.includes("do_not_contact") && dncReason.length ? { dnc_reason: dncReason } : {}),
    ...(query.trim() ? { query: query.trim() } : {}),
  }), [triagem, stage, phone, phoneQuality, followersRange, nameIdentifiability, instagram, dncReason, query]);
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
  const summary = base.data?.summary ?? {};
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
  const changeSort = (value: string) => { setSortBy(value); resetPageAndSelection(); };
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

  const openEdit = (lead: Lead) => {
    setLeadDetail(null);
    setEditingLead(lead);
    setEditName(lead.name ?? "");
    setEditPhone(lead.phone ?? "");
  };
  const saveLead = async () => {
    if (!editingLead || !editName.trim()) return toast.error("Informe o nome do lead.");
    setEditBusy(true);
    try {
      const { error } = await supabase.from("platform_crm_leads").update({ name: editName.trim(), phone: editPhone.trim() || null }).eq("id", editingLead.lead_id).eq("product_id", productId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["nova-prospeccao-base", productId] });
      setEditingLead(null);
      toast.success("Lead atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o lead.");
    } finally { setEditBusy(false); }
  };

  const start = total ? page * pageSize + 1 : 0;
  const end = Math.min((page + 1) * pageSize, total);
  const activeFilterCount = triagem.length + stage.length + Number(Boolean(phone)) + Number(Boolean(phoneQuality)) + Number(Boolean(followersRange)) + Number(Boolean(nameIdentifiability)) + Number(Boolean(instagram)) + dncReason.length + Number(Boolean(query.trim()));
  return (
    <section className="leads-executive space-y-3.5">
      {base.error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0" />Não foi possível atualizar os leads. Tente novamente.</span><Button variant="outline" size="sm" onClick={() => void base.refetch()} disabled={base.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${base.isFetching ? "animate-spin" : ""}`} />Tentar novamente</Button></div> : null}


      <div className="lead-summary-grid" aria-label="Resumo da base">
        <div className="lead-summary-card lead-summary-primary"><div className="lead-summary-heading"><span>Base consolidada</span><i><Users /></i></div><strong>{base.isLoading || base.error ? "—" : numberFormat.format(Number(summary.total_cards ?? total))}</strong></div>
        <div className="lead-summary-card lead-summary-green"><div className="lead-summary-heading"><span>Contato disponível</span><i><Phone /></i></div><strong>{base.isLoading || base.error ? "—" : numberFormat.format(Number(summary.with_phone ?? 0))}</strong></div>
        <div className="lead-summary-card lead-summary-gold"><div className="lead-summary-heading"><span>Não contatar</span><i><CircleAlert /></i></div><strong>{base.isLoading || base.error ? "—" : numberFormat.format(Number(summary.do_not_contact ?? 0))}</strong></div>
      </div>

      <div className="lead-workbench">
        <div className="lead-command-bar">
          <label className="lead-search"><Search className="h-4 w-4 shrink-0" />
            <input aria-label="Buscar leads" value={query} onChange={(event) => { setQuery(event.target.value); resetPageAndSelection(); }} placeholder="Buscar nome, @perfil ou telefone" />
            {query && <button aria-label="Limpar busca" onClick={() => { setQuery(""); resetPageAndSelection(); }}><X className="h-4 w-4" /></button>}
          </label>
          <div className="lead-sync" role="status"><span className={base.isFetching ? "is-loading" : base.error ? "is-error" : ""} />{base.isFetching ? "Atualizando" : base.error ? "Indisponível" : "Atualizado"}</div>
          <Button variant="ghost" size="icon" aria-label="Atualizar leads" onClick={() => void base.refetch()} disabled={base.isFetching}><RefreshCw className={`h-4 w-4 ${base.isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
        <div className="lead-facets">
          <div className="lead-filter-group">
            <MultiFilter title="Triagem" values={triages} selected={triagem} labels={triageLabels} onChange={(value) => { setTriagem(value); resetPageAndSelection(); }} />
            <MultiFilter title="Etapa" values={stages} selected={stage} labels={stageLabels} onChange={(value) => { setStage(value); if (!value.includes("do_not_contact")) setDncReason([]); resetPageAndSelection(); }} />
            <SingleFilter title="Contato" value={phone} values={["with", "without"]} labels={{ with: "Com telefone", without: "Sem telefone" }} onChange={(value) => { setPhone(value); resetPageAndSelection(); }} />
            <SingleFilter title="Qualidade do telefone" value={phoneQuality} values={["valid", "invalid", "missing"]} labels={phoneQualityLabels} onChange={(value) => { setPhoneQuality(value); resetPageAndSelection(); }} />
            <SingleFilter title="Seguidores" value={followersRange} values={["under_1k", "1k_3k", "3k_10k", "10k_50k", "50k_plus"]} labels={followerLabels} onChange={(value) => { setFollowersRange(value); resetPageAndSelection(); }} />
            <SingleFilter title="Nome" value={nameIdentifiability} values={["identifiable", "not_identifiable"]} labels={{ identifiable: "Nome identificável", not_identifiable: "Nome igual ao @ ou ausente" }} onChange={(value) => { setNameIdentifiability(value); resetPageAndSelection(); }} />
            <SingleFilter title="Instagram" value={instagram} values={["with", "without"]} labels={{ with: "Com perfil Instagram", without: "Sem perfil Instagram" }} onChange={(value) => { setInstagram(value); resetPageAndSelection(); }} />
            {stage.includes("do_not_contact") && <MultiFilter title="Motivo DNC" values={["hard_stop", "cadence_exhausted", "closed_lost", "unknown"]} selected={dncReason} labels={dncReasonLabels} onChange={(value) => { setDncReason(value); resetPageAndSelection(); }} />}
          </div>
          <div className="lead-sort"><span>Ordenar por</span>
            <select aria-label="Ordenação" value={sortBy} onChange={(event) => changeSort(event.target.value)}>
              <option value="name">Nome</option><option value="handle">@perfil</option><option value="followers">Seguidores</option><option value="phone">Telefone</option><option value="stage">Etapa</option><option value="updated_at">Atualização</option>
            </select>
            <Button variant="ghost" size="icon" aria-label={descending ? "Ordem decrescente" : "Ordem crescente"} onClick={() => { setDescending((value) => !value); resetPageAndSelection(); }}>{descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button>
          </div>
        </div>
        {activeFilterCount > 0 && <div className="lead-active-filters">
          {triagem.map((value) => <button key={value} className={`lead-chip triage-${value}`} onClick={() => { setTriagem(triagem.filter((item) => item !== value)); resetPageAndSelection(); }}>{triageLabels[value]}<X className="h-3 w-3" /><span className="sr-only">Remover filtro</span></button>)}
          {stage.map((value) => <button key={value} className="lead-chip" onClick={() => { const next = stage.filter((item) => item !== value); setStage(next); if (!next.includes("do_not_contact")) setDncReason([]); resetPageAndSelection(); }}>{stageLabels[value]}<X className="h-3 w-3" /><span className="sr-only">Remover filtro</span></button>)}
          {phone && <button className="lead-chip" onClick={() => { setPhone(null); resetPageAndSelection(); }}>{phone === "with" ? "Com telefone" : "Sem telefone"}<X className="h-3 w-3" /></button>}
          {phoneQuality && <button className="lead-chip" onClick={() => { setPhoneQuality(null); resetPageAndSelection(); }}>{phoneQualityLabels[phoneQuality]}<X className="h-3 w-3" /></button>}
          {followersRange && <button className="lead-chip" onClick={() => { setFollowersRange(null); resetPageAndSelection(); }}>{followerLabels[followersRange]}<X className="h-3 w-3" /></button>}
          {nameIdentifiability && <button className="lead-chip" onClick={() => { setNameIdentifiability(null); resetPageAndSelection(); }}>{nameIdentifiability === "identifiable" ? "Nome identificável" : "Nome igual ao @ ou ausente"}<X className="h-3 w-3" /></button>}
          {instagram && <button className="lead-chip" onClick={() => { setInstagram(null); resetPageAndSelection(); }}>{instagram === "with" ? "Com perfil Instagram" : "Sem perfil Instagram"}<X className="h-3 w-3" /></button>}
          {dncReason.map((value) => <button key={value} className="lead-chip" onClick={() => { setDncReason(dncReason.filter((item) => item !== value)); resetPageAndSelection(); }}>{dncReasonLabels[value]}<X className="h-3 w-3" /></button>)}
          <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTriagem([]); setStage([]); setPhone(null); setPhoneQuality(null); setFollowersRange(null); setNameIdentifiability(null); setInstagram(null); setDncReason([]); resetPageAndSelection(); }}>Limpar filtros</Button>
        </div>}

        <div className="lead-table-viewport" tabIndex={0} aria-label="Tabela de leads" role="region">
          <table className="lead-data-table">
            <thead><tr>
              <th className="sticky left-0 z-20 w-12 border-r border-border bg-muted px-4 py-3"><input className="h-4 w-4 accent-primary" title="Selecionar todos os leads desta página" aria-label="Selecionar todos os leads desta página" type="checkbox" checked={pageSelected} onChange={(event) => togglePage(event.target.checked)} /></th><th className="min-w-[280px] px-4 py-3">Lead / perfil</th><th className="w-[72px] whitespace-nowrap px-3 py-3 text-center">Instagram</th><th className="whitespace-nowrap px-4 py-3">Triagem</th><th className="whitespace-nowrap px-4 py-3">Etapa</th><th className="whitespace-nowrap px-4 py-3">Telefone</th><th className="whitespace-nowrap px-4 py-3 text-right">Seguidores</th><th className="sticky right-0 z-20 w-[68px] border-l border-border bg-muted px-2 py-3 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]"><span>Ações</span></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {base.isLoading ? Array.from({ length: 6 }, (_, index) => <tr key={index} aria-label="Carregando leads">{Array.from({ length: 8 }, (_, cell) => <td key={cell} className="p-4"><div className="lead-skeleton" /></td>)}</tr>) : base.error ? <tr><td colSpan={8} className="p-8 text-center text-destructive">{(base.error as Error).message}</td></tr> : rows.map((row) => {
                const phoneLabel = formatPhone(row.phone_normalized);
                const handles = row.profiles.map((profile) => profile.handle ? `@${profile.handle.replace(/^@/, "")}` : null).filter(Boolean);
                const profileUrl = instagramUrl(row.profiles.find((profile) => profile.handle)?.handle);
                return <tr key={row.lead_id} aria-selected={selected.includes(row.lead_id) || allFilteredSelected} className={`group border-l-2 transition-colors hover:bg-primary/[0.025] ${selected.includes(row.lead_id) || allFilteredSelected ? "border-l-primary bg-primary/[0.035]" : "border-l-transparent"}`}>
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-4 py-3 group-hover:bg-muted/30"><input className="accent-primary" aria-label={`Selecionar ${row.name}`} type="checkbox" checked={selected.includes(row.lead_id) || allFilteredSelected} onChange={(event) => { setAllFilteredSelected(false); setSelected((current) => event.target.checked ? [...new Set([...current, row.lead_id])] : current.filter((id) => id !== row.lead_id)); }} /></td>
                  <td className="max-w-[360px] whitespace-nowrap px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-xs font-semibold text-primary">{(row.name.match(/[\p{L}\p{N}]+/gu) ?? ["?"]).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR")}</span><div className="min-w-0"><div className="truncate font-semibold text-foreground"><button className="lead-name" onClick={() => setLeadDetail(row)}>{row.name || "Sem nome"}</button></div><div className="mt-0.5 truncate text-xs text-muted-foreground">{handles.join(" · ") || "Sem perfil vinculado"}{row.profile_count > 1 ? ` · ${row.profile_count} perfis` : ""}</div></div></div></td>
                  <td className="whitespace-nowrap px-3 py-3 text-center"><a href={profileUrl ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={profileUrl ? `Abrir Instagram de ${row.name || "lead"}` : "Instagram indisponível"} title={profileUrl ? "Abrir perfil no Instagram" : "Perfil do Instagram indisponível"} className={`lead-instagram-link ${profileUrl ? "" : "is-disabled"}`} onClick={(event) => { if (!profileUrl) event.preventDefault(); }}><ExternalLink className="h-4 w-4" aria-hidden="true" /></a></td>
                  <td className="whitespace-nowrap px-4 py-3"><span className={`lead-triage triage-${row.triagem_summary}`}>{triageLabels[row.triagem_summary]}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground"><span className={`lead-stage stage-${row.derived_stage ?? "db"}`}><i />{stageLabels[row.derived_stage ?? "db"]}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{phoneLabel ? <span>{phoneLabel}</span> : row.phone ? <span title={`Valor armazenado: ${row.phone}`} className="text-amber-700">Revisar telefone</span> : <span className="text-muted-foreground">Não informado</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.profile_count ? numberFormat.format(row.followers_count) : "—"}</td>
                  <td className="sticky right-0 z-10 border-l border-border bg-card px-2 py-2 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-muted/50">
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Abrir menu de ações de ${row.name || "lead"}`} title="Ações do lead" className="h-9 w-9 border-border bg-card text-foreground shadow-sm hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"><MoreHorizontal className="h-[18px] w-[18px]" /><span className="sr-only">Ações do lead</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ações do lead</div><DropdownMenuItem onClick={() => setLeadDetail(row)}><Eye className="mr-2 h-4 w-4" />Visualizar lead</DropdownMenuItem><DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="mr-2 h-4 w-4" />Editar Lead</DropdownMenuItem><DropdownMenuItem disabled={selected.includes(row.lead_id) || allFilteredSelected} onClick={() => { setSelected((current) => [...new Set([...current, row.lead_id])]); setAllFilteredSelected(false); }}><Check className="mr-2 h-4 w-4" />Selecionar para ação em lote</DropdownMenuItem><DropdownMenuItem disabled={!phoneLabel && !row.phone} onClick={() => void copyValue(phoneLabel ?? row.phone, "Telefone")}><Phone className="mr-2 h-4 w-4" />Copiar telefone</DropdownMenuItem><DropdownMenuItem disabled={!handles.length} onClick={() => void copyValue(handles[0], "Perfil")}><Copy className="mr-2 h-4 w-4" />Copiar @perfil</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>;
              })}
              {!base.isLoading && !base.error && !rows.length && <tr><td colSpan={8} className="p-12 text-center"><Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><div className="font-medium">Nenhum lead encontrado</div><div className="mt-1 text-sm text-muted-foreground">Altere ou limpe alguns filtros para ampliar o resultado.</div></td></tr>}
            </tbody>
          </table>
        </div>
        {selectedCount > 0 ? <div className="lead-selection-dock">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground">{numberFormat.format(selectedCount)}</span>
            <span className="text-sm font-semibold">Ações em lote</span>
            <span className="text-xs text-muted-foreground">{allFilteredSelected ? "todos os resultados filtrados" : selectedCount === 1 ? "lead selecionado" : "leads selecionados"}</span>
            {!allFilteredSelected && total > selected.length && <Button size="sm" variant="link" className="h-8 px-1" onClick={() => { setAllFilteredSelected(true); setSelected([]); }}>Selecionar os {numberFormat.format(total)} resultados</Button>}
            {allFilteredSelected && <Button size="sm" variant="link" className="h-8 px-1" onClick={() => { setAllFilteredSelected(false); setSelected([]); }}>Desfazer seleção total</Button>}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setSelected([]); setAllFilteredSelected(false); }}><X className="mr-1 h-3.5 w-3.5" />Limpar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount === 1 && !allFilteredSelected && <Button variant="outline" size="sm" onClick={() => selectedRows[0] && setLeadDetail(selectedRows[0])} title="Abre a ficha completa do lead"><Eye className="mr-2 h-4 w-4" />Visualizar lead</Button>}
            <Button variant="outline" size="sm" onClick={() => void copySelectedContacts()} disabled={allFilteredSelected || !selectedRows.length} title={allFilteredSelected ? "Disponível ao selecionar leads desta página" : "Copia nome, @perfil e telefone dos selecionados"}><Copy className="mr-2 h-4 w-4" />Copiar dados</Button>
            <select aria-label="Classificação de destino" title="Altera a triagem dos leads selecionados; não altera a etapa" value={targetTriage} onChange={(event) => setTargetTriage(event.target.value as Triage)} className={controlClass + " h-9 bg-card"}>{triages.map((value) => <option key={value} value={value}>{triageLabels[value]}</option>)}</select>
            <Button size="sm" onClick={() => void reclassify()} disabled={actionBusy} title="Altera a triagem dos leads selecionados; não cria campanha nem move a etapa"><Workflow className="mr-2 h-4 w-4" />{actionBusy ? "Aplicando…" : "Classificar leads"}</Button>
          </div>
          <div className="lead-bulk-help"><span><Eye />Visualizar abre a ficha individual.</span><span><Copy />Copiar dados leva nome, @perfil e telefone.</span><span><Workflow />Classificar altera apenas a triagem.</span></div>
        </div> : null}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="text-sm text-muted-foreground">Exibindo <span className="font-medium text-foreground">{numberFormat.format(start)}–{numberFormat.format(end)}</span> · <span className="font-medium text-foreground">{base.error || base.isLoading ? "—" : numberFormat.format(total)} leads filtrados</span></div>
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="base-page-size" className="text-sm text-muted-foreground">Por página</label><select id="base-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); resetPageAndSelection(); }} className={controlClass}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><span className="min-w-24 text-center text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span><Button variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0 || base.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setSelected([]); setAllFilteredSelected(false); }}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={page + 1 >= totalPages || base.isFetching} onClick={() => { setPage((value) => value + 1); setSelected([]); setAllFilteredSelected(false); }}><ChevronRight className="h-4 w-4" /></Button></div>
        </footer>
      </div>
      <Dialog open={Boolean(leadDetail)} onOpenChange={(open) => !open && setLeadDetail(null)}>
        <DialogContent className="flex h-[min(90vh,900px)] w-[calc(100vw-32px)] max-w-[1440px] flex-col overflow-hidden p-0">
          <VisuallyHidden><DialogTitle>Detalhes do lead</DialogTitle></VisuallyHidden>
          {leadDetail && <ProspeccaoLeadDetail lead={leadDetail} onEdit={() => openEdit(leadDetail)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingLead)} onOpenChange={(open) => !open && !editBusy && setEditingLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Lead</DialogTitle></DialogHeader>
          <div className="space-y-4 py-3"><div className="space-y-2"><Label htmlFor="base-lead-name">Nome</Label><Input id="base-lead-name" value={editName} onChange={(event) => setEditName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="base-lead-phone">Telefone</Label><Input id="base-lead-phone" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="+55 11 99999-9999" /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingLead(null)} disabled={editBusy}>Cancelar</Button><Button onClick={() => void saveLead()} disabled={editBusy}>{editBusy ? "Salvando…" : "Salvar alterações"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
