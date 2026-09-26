import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArchiveX,
  Ban,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Headphones,
  FileUp,
  Repeat2,
  Layers3,
  Loader2,
  Sprout,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActivePlatformProduct } from "@/contexts/PlatformProductContext";
import { usePlatformModule } from "@/components/superadmin/platform-shell/usePlatformModule";
import { Button } from "@/components/ui/button";

type Mode = "dashboard" | "ingestao" | "base" | "enriquecimento" | "campanhas";
type Operation = {
  id?: string;
  type?: string;
  status?: string;
  error?: string | null;
  requested_at?: string;
  finished_at?: string | null;
};
type SnapshotRow = {
  lead_id: string;
  name: string;
  phone: string | null;
  derived_stage: string | null;
  triagem_summary: string;
  profile_count: number;
  profiles: Array<{
    id?: string | null;
    handle?: string | null;
    triagem?: string | null;
  }>;
  active_operation_count: number;
  active_operations?: Operation[];
  recent_operations?: Operation[];
  is_suppressed: boolean;
};
type SnapshotSummary = {
  total_cards: number;
  by_stage: Record<string, number>;
  by_triagem: Record<string, number>;
  active_operations: number;
  suppressed: number;
  campaign_activity: number;
  with_phone: number;
  by_triagem_with_phone?: Record<string, number>;
  by_triagem_without_phone?: Record<string, number>;
  enrichment_pending?: number;
  campaign_problems?: number;
};
type SnapshotRefreshAudit = {
  function_name: string;
  product_id: string;
  requested_at: string;
  completed_at: string;
  status: "success";
  snapshot_version: string;
};
type LeadFilters = {
  triagem?: string;
  derived_stage?: string;
  phone?: "with" | "without";
  suppressed?: boolean;
};
const TITLES: Record<
  Mode,
  { title: string; subtitle: string; icon: typeof Layers3 }
> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "",
    icon: Layers3,
  },
  ingestao: {
    title: "Ingestão de leads",
    subtitle: "",
    icon: Upload,
  },
  base: {
    title: "Base de leads",
    subtitle: "",
    icon: Users,
  },
  enriquecimento: {
    title: "Enriquecimento",
    subtitle: "",
    icon: Sparkles,
  },
  campanhas: {
    title: "Campanhas & disparos",
    subtitle: "",
    icon: Send,
  },
};

function useSnapshot(productId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["nova-prospeccao-snapshot", productId],
    enabled: !!productId && enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "leads-operational-snapshot",
        { body: { product_id: productId, limit: 500 } },
      );
      if (error) throw error;
      return {
        rows: (data?.data ?? []) as SnapshotRow[],
        summary: (data?.summary ?? {}) as SnapshotSummary,
        audit: (data?.audit ?? null) as SnapshotRefreshAudit | null,
      };
    },
  });
}
function useOperation(productId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      operation_type: string;
      lead_id: string;
      idempotency_key: string;
      payload?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "leads-operation",
        { body: { product_id: productId, ...input } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["nova-prospeccao-snapshot", productId],
      }),
  });
}
function useCancelOperation(productId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (operationId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "leads-operation",
        {
          body: {
            product_id: productId,
            action: "cancel",
            operation_id: operationId,
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["nova-prospeccao-snapshot", productId],
      }),
  });
}
function useTriage(productId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      extracted_lead_ids?: string[];
      lead_ids?: string[];
      lead_filters?: LeadFilters;
      triagem: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("leads-triage", {
        body: { product_id: productId, ...input, source: "human" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["nova-prospeccao-snapshot", productId],
      }),
  });
}
function EmptyProduct() {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm text-muted-foreground">
      Selecione o produto NexvyBeauty no topo para operar esta prancha.
    </div>
  );
}
function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "green" | "amber";
}) {
  const color =
    tone === "green"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Dashboard({ summary }: { summary: SnapshotSummary }) {
  const { setActiveSection } = usePlatformModule();
  const stageLabels = [
    {
      key: "db",
      label: "Na Base",
      icon: Layers3,
      tone: "border-primary/25 bg-primary/[0.04] hover:border-primary/45 hover:bg-primary/[0.07]",
      iconTone: "bg-primary/10 text-primary",
    },
    {
      key: "preselected",
      label: "Pré-selecionados",
      icon: Target,
      tone: "border-brand/25 bg-brand/[0.04] hover:border-brand/45 hover:bg-brand/[0.08]",
      iconTone: "bg-brand/10 text-brand",
    },
    {
      key: "contacted",
      label: "Contatados",
      icon: Send,
      tone: "border-sky-500/20 bg-sky-500/[0.04] hover:border-sky-500/40 hover:bg-sky-500/[0.07]",
      iconTone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      key: "service",
      label: "Em atendimento",
      icon: Headphones,
      tone: "border-violet-500/20 bg-violet-500/[0.04] hover:border-violet-500/40 hover:bg-violet-500/[0.07]",
      iconTone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
    {
      key: "remarketing_pool",
      label: "Remarketing",
      icon: Repeat2,
      tone: "border-orange-500/20 bg-orange-500/[0.04] hover:border-orange-500/40 hover:bg-orange-500/[0.07]",
      iconTone: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    },
    {
      key: "do_not_contact",
      label: "Não Contatar",
      icon: Ban,
      tone: "border-rose-500/20 bg-rose-500/[0.04] hover:border-rose-500/40 hover:bg-rose-500/[0.07]",
      iconTone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    },
    {
      key: "closing",
      label: "Fechamento",
      icon: CheckCircle2,
      tone: "border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/40 hover:bg-emerald-500/[0.07]",
      iconTone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      key: "onboarding",
      label: "Onboarding",
      icon: Sparkles,
      tone: "border-cyan-500/20 bg-cyan-500/[0.04] hover:border-cyan-500/40 hover:bg-cyan-500/[0.07]",
      iconTone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    },
  ];
  const categoryCards = [
    {
      key: "principal",
      label: "Principal",
      icon: Users,
      tone: "border-primary/35 bg-primary/[0.06] text-primary hover:border-brand/50 hover:bg-primary/[0.09] hover:ring-2 hover:ring-brand/20 hover:shadow-premium-xl",
      iconTone: "bg-brand text-brand-foreground shadow-md shadow-brand/20 ring-2 ring-brand/20 transition-transform duration-200 group-hover:scale-105 group-hover:shadow-lg",
    },
    {
      key: "semente",
      label: "Semente",
      icon: Sprout,
      tone: "border-border border-t-2 border-t-emerald-500 bg-card text-emerald-700 dark:text-emerald-400",
      iconTone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    {
      key: "nao_classificado",
      label: "Não classificados",
      icon: CircleHelp,
      tone: "border-border border-t-2 border-t-amber-500 bg-card text-amber-700 dark:text-amber-400",
      iconTone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    {
      key: "remocao_confirmada",
      label: "Remoção confirmada",
      icon: ArchiveX,
      tone: "border-border border-t-2 border-t-rose-500 bg-card text-rose-700 dark:text-rose-400",
      iconTone: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    },
  ];
  const actionCards = [
    {
      label: "Não classificados",
      value: summary.by_triagem?.nao_classificado ?? 0,
      cta: "Revisar leads",
      section: "v-nova-prospeccao-base",
      icon: CircleHelp,
      tone: "border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/45 hover:bg-amber-500/[0.07]",
      iconTone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      label: "Para enriquecimento",
      value: summary.enrichment_pending ?? 0,
      cta: "Enriquecer leads",
      section: "v-nova-prospeccao-enriquecimento",
      icon: Sparkles,
      tone: "border-violet-500/20 bg-violet-500/[0.04] hover:border-violet-500/40 hover:bg-violet-500/[0.07]",
      iconTone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
    {
      label: "Leads pré-selecionados",
      value: summary.by_stage?.preselected ?? 0,
      cta: "Programar disparo",
      section: "v-nova-prospeccao-campanhas",
      icon: Target,
      tone: "border-brand/25 bg-brand/[0.04] hover:border-brand/45 hover:bg-brand/[0.08]",
      iconTone: "bg-brand/10 text-brand",
    },
    {
      label: "Campanhas com problema",
      value: summary.campaign_problems ?? 0,
      cta: "Ver campanhas",
      section: "v-nova-prospeccao-campanhas",
      icon: AlertTriangle,
      tone: "border-rose-500/20 bg-rose-500/[0.04] hover:border-rose-500/40 hover:bg-rose-500/[0.07]",
      iconTone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    },
  ] as const;
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Base de leads
          </h2>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {summary.total_cards ?? 0} cards
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[0.95fr_2.25fr]">
          {(() => {
            const principal = summary.by_triagem?.principal ?? 0;
            const withPhone = summary.by_triagem_with_phone?.principal ?? 0;
            const withoutPhone = summary.by_triagem_without_phone?.principal ?? 0;
            return (
              <div className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-primary p-3 text-primary-foreground shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium-xl">
                <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[18px] border-brand/20" />
                <div className="relative grid min-h-[108px] grid-cols-[minmax(0,230px)_112px] items-center justify-start gap-3">
                  <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
                        Principal
                      </div>
                      <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                        {principal}
                      </div>
                  </div>
                  <div className="flex min-w-[112px] flex-col gap-2 border-l-2 border-primary-foreground/25 pl-3 pr-1">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{withPhone}</div>
                      <div className="text-xs text-primary-foreground/60">com telefone</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{withoutPhone}</div>
                      <div className="text-xs text-primary-foreground/60">sem telefone</div>
                    </div>
                  </div>
                  <span className="absolute right-0 top-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-lg shadow-black/10 ring-1 ring-white/20">
                      <Users className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            );
          })()}
          <div className="grid gap-3 sm:grid-cols-3">
            {categoryCards
              .filter(({ key }) => key !== "principal")
              .map(({ key, label, icon: CategoryIcon, tone, iconTone }) => {
                const value = summary.by_triagem?.[key] ?? 0;
                return (
                  <div
                    key={key}
                    className={`group relative flex min-h-[108px] flex-col justify-between overflow-hidden rounded-2xl border bg-card p-3 shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium ${tone}`}
                  >
                    <span className="pointer-events-none absolute -bottom-8 -right-8 h-20 w-20 rounded-full border-[10px] border-current opacity-[0.08]" />
                    <div className="flex items-start justify-between gap-3">
                      <span className="max-w-[10rem] text-sm font-medium leading-snug text-foreground">
                        {label}
                      </span>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
                        <CategoryIcon className="h-[19px] w-[19px]" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="relative mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                      {value}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Estágio operacional
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stageLabels.map(({ key, label, icon: StageIcon, tone, iconTone }) => (
            <div
              key={key}
              className={`group flex min-h-[65px] flex-col justify-between rounded-2xl border bg-card p-3 shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium ${tone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
                  <StageIcon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <b className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {summary.by_stage?.[key] ?? 0}
              </b>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ações pendentes
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actionCards.map(({ label, value, cta, section, icon: ActionIcon, tone, iconTone }) => (
            <div
              key={label}
              className={`group flex min-h-[142px] flex-col rounded-2xl border bg-card p-3 shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium ${tone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{label}</div>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
                  <ActionIcon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {value}
              </div>
              <Button
                className="mt-auto w-full"
                variant="outline"
                size="sm"
                onClick={() => setActiveSection(section)}
              >
                {cta} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Ingestao({ productId }: { productId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    count: number;
    handles: string[];
  } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inspect = async (selected: File) => {
    try {
      const raw = JSON.parse(await selected.text());
      const records = Array.isArray(raw)
        ? raw
        : (raw.cards ?? raw.records ?? raw.profiles ?? []);
      const handles: string[] = records
        .map((r: any) =>
          String(r.handle ?? r.username ?? r.instagram_handle ?? "").replace(
            /^@/,
            "",
          ),
        )
        .filter((value: string) => Boolean(value));
      setPreview({
        count: records.length,
        handles: [...new Set(handles)].slice(0, 5),
      });
      setError(null);
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof Error
          ? `Preview inválido: ${e.message}`
          : "Preview inválido",
      );
    }
  };
  const history = useQuery({
    queryKey: ["nova-prospeccao-ingestion-history", productId],
    queryFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke(
        "leads-ingestion-history",
        { body: { product_id: productId } },
      );
      if (fnError) throw fnError;
      return data?.data ?? [];
    },
  });
  const reprocess = useMutation({
    mutationFn: async (extractionId: string) => {
      const { data, error: fnError } = await supabase.functions.invoke(
        "leads-ingestion-reprocess",
        { body: { product_id: productId, extraction_id: extractionId } },
      );
      if (fnError) throw fnError;
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
      void history.refetch();
    },
    onError: (e: Error) => setError(e.message),
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Escolha um JSON");
      const raw = JSON.parse(await file.text());
      const records = Array.isArray(raw)
        ? raw
        : (raw.cards ?? raw.records ?? raw.profiles ?? []);
      if (!records.length)
        throw new Error("O arquivo não contém cards/records/profiles");
      const { data, error: fnError } = await supabase.functions.invoke(
        "leads-import-profiles",
        {
          body: {
            product_id: productId,
            source: "prospectagram",
            contract_version: "1",
            source_file_name: file.name,
            cards: records,
          },
        },
      );
      if (fnError) throw fnError;
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-border bg-card p-8 text-center">
        <FileUp className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-medium">
          Importe o JSON exportado pelo Prospectagram
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          A UI envia o lote para a Edge Function; normalização, deduplicação e
          triagem acontecem no backend.
        </p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected);
            if (selected) void inspect(selected);
            else setPreview(null);
          }}
        />
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => input.current?.click()}
        >
          Escolher arquivo
        </Button>
        {file && <p className="mt-3 text-sm">{file.name}</p>}
      </div>
      {preview && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <b>Prévia para confirmação</b>
          <div className="mt-1">
            {preview.count} registros encontrados · handles amostrados:{" "}
            {preview.handles.join(", ") || "nenhum identificado"}
          </div>
          <div className="mt-1 text-muted-foreground">
            Nada foi escrito ainda. Ao confirmar, o lote seguirá para a Edge
            Function canônica.
          </div>
        </div>
      )}
      <Button
        onClick={() => importMutation.mutate()}
        disabled={!file || !preview || importMutation.isPending}
      >
        {importMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Confirmar e processar lote
      </Button>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(result, null, 2)}
          </pre>
          {Array.isArray(result.row_results) &&
            result.row_results.some(
              (row: any) => row.status !== "accepted",
            ) && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <b>Linhas que exigem atenção</b>
                <div className="mt-2 space-y-1">
                  {result.row_results
                    .filter((row: any) => row.status !== "accepted")
                    .slice(0, 50)
                    .map((row: any) => (
                      <div key={row.index}>
                        Linha {row.index + 1}: {row.status} · {row.reason}
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      )}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Histórico de lotes</h2>
        <div className="mt-3 space-y-2">
          {history.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            (history.data as any[]).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <span>
                  {job.source} · {job.total_found ?? 0} perfis
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      job.status === "done"
                        ? "text-emerald-600"
                        : job.status === "error"
                          ? "text-destructive"
                          : "text-amber-600"
                    }
                  >
                    {job.status}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reprocess.mutate(job.id)}
                    disabled={reprocess.isPending}
                  >
                    Reprocessar
                  </Button>
                </span>
              </div>
            ))
          )}
          {!history.isLoading && !(history.data as any[]).length && (
            <span className="text-sm text-muted-foreground">
              Nenhum lote recente.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function OperationHistoryPanel({
  productId,
  leadId,
  retry,
}: {
  productId: string;
  leadId: string;
  retry: (leadId: string, op: Operation) => void;
}) {
  const history = useQuery({
    queryKey: ["nova-prospeccao-operation-history", productId, leadId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "leads-operation-history",
        { body: { product_id: productId, lead_id: leadId } },
      );
      if (error) throw error;
      return (data?.data ?? []) as Operation[];
    },
  });
  return (
    <>
      <div className="mt-3 font-medium">Histórico recente</div>
      {history.isLoading ? (
        <Loader2 className="mt-2 h-4 w-4 animate-spin" />
      ) : (
        (history.data ?? []).map((op) =>
          op.id ? (
            <div
              key={op.id}
              className="mt-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <div>
                {op.type ?? "operação"} ·{" "}
                <span
                  className={
                    op.status === "failed"
                      ? "text-destructive"
                      : op.status === "succeeded"
                        ? "text-emerald-600"
                        : "text-amber-600"
                  }
                >
                  {op.status}
                </span>
              </div>
              {op.error && (
                <div className="text-xs text-destructive">{op.error}</div>
              )}
              {["failed", "cancelled"].includes(op.status ?? "") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => retry(leadId, op)}
                >
                  Reexecutar
                </Button>
              )}
            </div>
          ) : null,
        )
      )}
      {!history.isLoading && !history.data?.length && (
        <div className="mt-2 text-xs text-muted-foreground">
          Nenhuma operação registrada.
        </div>
      )}
    </>
  );
}

function Base({ productId, rows }: { productId: string; rows: SnapshotRow[] }) {
  const operation = useOperation(productId);
  const cancelOperation = useCancelOperation(productId);
  const triage = useTriage(productId);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<LeadFilters | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [triagem, setTriagem] = useState("all");
  const [phone, setPhone] = useState("all");
  const [suppression, setSuppression] = useState("all");
  const [targetTriage, setTargetTriage] = useState("principal");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = rows.filter((r) => {
    const haystack =
      `${r.name} ${r.profiles.map((p) => p.handle).join(" ")}`.toLowerCase();
    return (
      haystack.includes(query.toLowerCase()) &&
      (stage === "all" || (r.derived_stage ?? "db") === stage) &&
      (triagem === "all" || r.triagem_summary === triagem) &&
      (phone === "all" || (phone === "with" ? !!r.phone : !r.phone)) &&
      (suppression === "all" ||
        (suppression === "yes" ? r.is_suppressed : !r.is_suppressed))
    );
  });
  const toggle = (id: string) => {
    setSelectedFilter(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const currentFilter = (): LeadFilters => ({
    ...(stage !== "all" ? { derived_stage: stage } : {}),
    ...(triagem !== "all" ? { triagem } : {}),
    ...(phone !== "all" ? { phone: phone as "with" | "without" } : {}),
    ...(suppression !== "all" ? { suppressed: suppression === "yes" } : {}),
  });
  const selectCurrentFilter = () => {
    if (query.trim()) {
      setSelectedFilter(null);
      setSelected(filtered.map((r) => r.lead_id));
      return;
    }
    setSelected([]);
    setSelectedFilter(currentFilter());
  };
  const preselect = (ids: string[]) =>
    ids.forEach((leadId) =>
      operation.mutate({
        operation_type: "preselection",
        lead_id: leadId,
        idempotency_key: `nova-preselection:${leadId}`,
      }),
    );
  const enrich = (ids: string[]) =>
    ids.forEach((leadId) =>
      operation.mutate({
        operation_type: "enrichment",
        lead_id: leadId,
        idempotency_key: `nova-enrichment:${leadId}`,
      }),
    );
  const reclassify = (ids: string[]) => {
    const extracted = rows
      .filter((row) => ids.includes(row.lead_id))
      .flatMap((row) =>
        row.profiles
          .map((profile) => profile.id)
          .filter((id): id is string => !!id),
      );
    if (extracted.length)
      triage.mutate({ extracted_lead_ids: extracted, triagem: targetTriage });
  };
  const reclassifySelection = () => {
    if (selectedFilter) {
      triage.mutate({ lead_filters: selectedFilter, triagem: targetTriage });
      return;
    }
    reclassify(selected);
  };
  const retry = (leadId: string, op: Operation) => {
    if (!op.id || !op.type) return;
    operation.mutate({
      operation_type: op.type,
      lead_id: leadId,
      idempotency_key: `nova-retry:${op.id}`,
      payload: { retry_of: op.id },
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar card ou handle"
          className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os estágios</option>
          {[
            "db",
            "preselected",
            "contacted",
            "remarketing_pool",
            "service",
            "closing",
            "onboarding",
            "do_not_contact",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={triagem}
          onChange={(e) => setTriagem(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todas as triagens</option>
          {[
            "principal",
            "semente",
            "nao_classificado",
            "remocao_confirmada",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">Telefone: todos</option>
          <option value="with">Com telefone</option>
          <option value="without">Sem telefone</option>
        </select>
        <select
          value={suppression}
          onChange={(e) => setSuppression(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">Supressão: todas</option>
          <option value="yes">Suprimidos</option>
          <option value="no">Não suprimidos</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={selectCurrentFilter}>
          {selectedFilter
            ? "Filtro selecionado"
            : `Selecionar filtro (${filtered.length})`}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSelected([]);
            setSelectedFilter(null);
          }}
          disabled={!selected.length && !selectedFilter}
        >
          Limpar seleção
        </Button>
        <Button
          onClick={() => preselect(selected)}
          disabled={!selected.length || operation.isPending}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          Pré-selecionar {selected.length || ""}
        </Button>
        <Button
          variant="outline"
          onClick={() => enrich(selected)}
          disabled={!selected.length || operation.isPending}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Enviar ao enriquecimento
        </Button>
        <select
          value={targetTriage}
          onChange={(e) => setTargetTriage(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="principal">Reclassificar: principal</option>
          <option value="semente">Reclassificar: semente</option>
          <option value="nao_classificado">
            Reclassificar: não classificado
          </option>
          <option value="remocao_confirmada">
            Confirmar remoção (restaurável)
          </option>
        </select>
        <Button
          variant="outline"
          onClick={reclassifySelection}
          disabled={(!selected.length && !selectedFilter) || triage.isPending}
        >
          Aplicar triagem
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          {selectedFilter
            ? "Todos os cards que correspondem ao filtro estão selecionados"
            : `${filtered.length} cards visíveis · ${selected.length} selecionados`}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {filtered.slice(0, 100).map((row) => (
          <div
            key={row.lead_id}
            className="border-b border-border last:border-0"
          >
            <div
              className="flex cursor-pointer items-center gap-3 p-4"
              onClick={() =>
                setExpanded(expanded === row.lead_id ? null : row.lead_id)
              }
            >
              <input
                type="checkbox"
                checked={selected.includes(row.lead_id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(row.lead_id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <span>{row.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {row.triagem_summary}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {row.derived_stage ?? "sem estágio"}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {row.profiles
                    .map((p) => `@${p.handle ?? "sem handle"}`)
                    .join(" · ") || "sem perfil vinculado"}{" "}
                  · {row.phone ?? "sem telefone"}
                </div>
              </div>
              {row.is_suppressed ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : row.active_operation_count ? (
                <RefreshCw className="h-4 w-4 text-primary" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            {expanded === row.lead_id && (
              <div className="grid gap-3 bg-muted/20 px-12 pb-4 pt-1 text-sm sm:grid-cols-2">
                <div>
                  <div className="font-medium">Perfis e triagem</div>
                  {row.profiles.map((profile, index) => (
                    <div
                      key={`${row.lead_id}-${index}`}
                      className="mt-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      @{profile.handle ?? "sem handle"}{" "}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {profile.triagem ?? "nao_classificado"}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-medium">Operação</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["principal", "Mover para principal"],
                      ["semente", "Mover para semente"],
                      ["nao_classificado", "Mover para não classificados"],
                      ["remocao_confirmada", "Mover para remoção"],
                    ].map(([value, label]) => (
                      <Button
                        key={value}
                        size="sm"
                        variant="outline"
                        disabled={triage.isPending}
                        onClick={() =>
                          triage.mutate({
                            lead_ids: [row.lead_id],
                            triagem: value,
                          })
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {row.active_operation_count
                      ? `${row.active_operation_count} operação(ões) ativa(s)`
                      : "Nenhuma operação ativa"}
                  </div>
                  {row.active_operations?.map((op) =>
                    op.id ? (
                      <Button
                        key={op.id}
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => cancelOperation.mutate(op.id!)}
                      >
                        Cancelar {op.type ?? "operação"}
                      </Button>
                    ) : null,
                  )}
                  <OperationHistoryPanel
                    productId={productId}
                    leadId={row.lead_id}
                    retry={retry}
                  />
                  <div className="mt-1 text-muted-foreground">
                    {row.is_suppressed
                      ? "Bloqueado por supressão"
                      : "Elegibilidade depende do estágio e da triagem"}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length > 100 && (
          <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
            Mostrando 100 cards; refine os filtros para operar o restante com
            segurança.
          </div>
        )}
        {!filtered.length && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum card nesta amostra.
          </div>
        )}
      </div>
    </div>
  );
}

function OperationView({
  productId,
  rows,
  type,
}: {
  productId: string;
  rows: SnapshotRow[];
  type: "enrichment" | "handoff";
}) {
  const operation = useOperation(productId);
  const candidates = rows.filter((r) =>
    type === "enrichment"
      ? !r.phone
      : r.derived_stage === "preselected" && !!r.phone,
  );
  const [campaignId, setCampaignId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignStatus, setCampaignStatus] = useState("draft");
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const createCampaign = async () => {
    if (!campaignName.trim()) {
      setCampaignError("Informe o nome da campanha.");
      return;
    }
    setCampaignError(null);
    setCampaignBusy(true);
    const { data, error } = await supabase.functions.invoke(
      "nova-campaign-create",
      {
        body: {
          product_id: productId,
          name: campaignName.trim(),
          description: "Campanha criada pela Nova Prospecção Ativa.",
        },
      },
    );
    setCampaignBusy(false);
    if (error) setCampaignError(error.message);
    else {
      setCampaignId(data?.campaign?.id ?? "");
      setCampaignStatus(data?.campaign?.status ?? "draft");
      setCampaignError(`Rascunho criado: ${data?.campaign?.id ?? ""}`);
    }
  };
  const prepareCampaign = async () => {
    if (type !== "handoff") return;
    if (!campaignId.trim()) {
      setCampaignError("Informe o ID da campanha existente.");
      return;
    }
    setCampaignError(null);
    setCampaignBusy(true);
    const { error } = await supabase.functions.invoke("nova-campaign-prepare", {
      body: {
        product_id: productId,
        campaign_id: campaignId.trim(),
        lead_ids: candidates.slice(0, 200).map((r) => r.lead_id),
      },
    });
    setCampaignBusy(false);
    if (error) setCampaignError(error.message);
    else setCampaignError("Targets preparados com sucesso.");
  };
  const controlCampaign = async (action: "arm" | "pause" | "resume") => {
    setCampaignError(null);
    setCampaignBusy(true);
    const { data, error } = await supabase.functions.invoke(
      "nova-campaign-control",
      {
        body: { product_id: productId, campaign_id: campaignId.trim(), action },
      },
    );
    setCampaignBusy(false);
    if (error) setCampaignError(error.message);
    else {
      setCampaignStatus(data?.campaign?.status ?? campaignStatus);
      setCampaignError(
        `Campanha ${data?.campaign?.status === "active" ? "armada" : "desarmada"} com sucesso.`,
      );
    }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">
              Elegíveis nesta amostra
            </div>
            <div className="text-3xl font-semibold">{candidates.length}</div>
          </div>
          {type === "handoff" && (
            <div className="flex flex-wrap gap-2">
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Nome do rascunho"
                className="h-10 w-56 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <Button
                variant="outline"
                disabled={campaignBusy}
                onClick={() => void createCampaign()}
              >
                Criar rascunho
              </Button>
              <input
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="campaign_id"
                className="h-10 w-72 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
          )}
          <Button
            disabled={
              !candidates.length ||
              operation.isPending ||
              campaignBusy ||
              (type === "handoff" && !campaignId.trim())
            }
            onClick={() =>
              type === "handoff"
                ? void prepareCampaign()
                : candidates.slice(0, 200).forEach((r) =>
                    operation.mutate({
                      operation_type: type,
                      lead_id: r.lead_id,
                      idempotency_key: `nova-${type}:${r.lead_id}`,
                    }),
                  )
            }
          >
            {operation.isPending || campaignBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {type === "enrichment"
              ? "Enriquecer selecionados"
              : "Preparar campanha"}
          </Button>
        </div>
        {type === "handoff" && campaignId && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
            <span>
              Status: <b>{campaignStatus}</b>
            </span>
            <Button
              size="sm"
              disabled={campaignBusy || campaignStatus === "active"}
              onClick={() =>
                void controlCampaign(
                  campaignStatus === "paused" ? "resume" : "arm",
                )
              }
            >
              Armar campanha
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={campaignBusy || campaignStatus !== "active"}
              onClick={() => void controlCampaign("pause")}
            >
              Desarmar
            </Button>
          </div>
        )}
        {campaignError && (
          <p className="mt-3 text-sm text-muted-foreground">{campaignError}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          A preparação valida `derived_stage = preselected`, supressão e
          deduplicação em `campaign_targets`. Armar é uma ação explícita e o
          dispatcher só lê campanhas `active`.
        </p>
      </div>
    </div>
  );
}

export function NovaProspeccaoWorkspace({ mode }: { mode: Mode }) {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const meta = TITLES[mode];
  const Icon = meta.icon;
  const {
    data: snapshot,
    isLoading,
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useSnapshot(productId, mode !== "ingestao");
  const rows = snapshot?.rows ?? [];
  const summary = snapshot?.summary ?? ({} as SnapshotSummary);
  const persistedRefreshAt = snapshot?.audit?.completed_at;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
          </div>
          {meta.subtitle && (
            <p className="mt-1 text-muted-foreground">{meta.subtitle}</p>
          )}
        </div>
        {productId && mode !== "ingestao" && (
          <div className="flex shrink-0 items-center gap-3">
            {(persistedRefreshAt || dataUpdatedAt > 0) && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Atualizado às {new Date(
                  persistedRefreshAt ?? dataUpdatedAt,
                ).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
              aria-label="Atualizar dados do dashboard"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>
        )}
      </div>
      {!productId ? (
        <EmptyProduct />
      ) : mode === "ingestao" ? (
        <Ingestao productId={productId} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando snapshot operacional...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : (
        <>
          {mode === "dashboard" && <Dashboard summary={summary} />}
          {mode === "base" && <Base productId={productId} rows={rows} />}
          {mode === "enriquecimento" && (
            <OperationView
              productId={productId}
              rows={rows}
              type="enrichment"
            />
          )}
          {mode === "campanhas" && (
            <>
              <OperationView productId={productId} rows={rows} type="handoff" />
              <CampaignHistory productId={productId} />
            </>
          )}
        </>
      )}
    </div>
  );
}
function CampaignHistory({ productId }: { productId: string }) {
  const history = useQuery({
    queryKey: ["nova-prospeccao-campaign-summary", productId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "nova-campaign-summary",
        { body: { product_id: productId } },
      );
      if (error) throw error;
      return data?.campaigns ?? [];
    },
  });
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">Histórico de campanhas</h2>
      {history.isLoading ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin" />
      ) : (
        <div className="mt-3 space-y-2">
          {(history.data as any[]).map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-lg bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{campaign.name}</b>
                <span className="rounded-full bg-background px-2 py-0.5">
                  {campaign.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {campaign.target_count ?? 0} targets · enviados{" "}
                {campaign.target_counts?.sent ?? 0} · respondidos{" "}
                {campaign.target_counts?.responded ?? 0} · falhas{" "}
                {campaign.target_counts?.failed ?? 0}
              </div>
            </div>
          ))}
          {!history.data?.length && (
            <span className="text-sm text-muted-foreground">
              Nenhuma campanha criada nesta nova operação.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
