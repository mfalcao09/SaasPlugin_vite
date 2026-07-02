import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Target,
  Loader2,
  Search,
  Flame,
  Snowflake,
  ThermometerSun,
  Eye,
  FileText,
  Filter as FunnelIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  usePlatformCrmFunnelLeads,
  usePlatformCrmAllFormSubmissions,
  PlatformCrmCaptureLead,
  PlatformCrmFormSubmissionRow,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureInsights';
import { usePlatformCrmCaptureFunnels } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { usePlatformCrmForms } from '@/components/superadmin/crm/data/usePlatformCrmForms';

/**
 * CRM de PLATAFORMA (super_admin) — RESULTADOS de captação (porte 1:1 do
 * `CaptureResultsSection` do CRM original), desacoplado do tenant.
 *
 * Fontes: `platform_crm_leads` (lead_origin='funnel', vínculo via metadata.funnel_id)
 * e `platform_crm_form_submissions` (todas as submissões, nome do form resolvido
 * client-side).
 *
 * Adaptações vs original:
 * - `leads` do tenant (organization_id) → `platform_crm_leads` global (RLS super_admin).
 * - Original mostrava só resultados de QUIZ; aqui há um seletor de fonte
 *   "Funis" | "Formulários" — a visão Funis cobre todos os canais de funil
 *   (quiz/chat/chatbot/widget) e a visão Formulários exibe as submissions
 *   (pedido da frente: resultados dos forms/funis por origem).
 * - Filtro "Todos" em Funis mostra todo lead com lead_origin='funnel' (o original
 *   restringia aos funnel_ids de quiz da org; na plataforma o universo já é global).
 */

const tempIcon = (t: string | null) => {
  if (t === 'hot') return <Flame className="h-3 w-3 text-red-500" />;
  if (t === 'warm') return <ThermometerSun className="h-3 w-3 text-orange-500" />;
  return <Snowflake className="h-3 w-3 text-sky-500" />;
};

type ResultsSource = 'funnels' | 'forms';

export function PlatformCrmCaptureResultsTab() {
  const [source, setSource] = useState<ResultsSource>('funnels');

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Resultados de Captação</h1>
            <p className="text-sm text-muted-foreground">
              Respostas, score e tags dos leads captados por funis e formulários.
            </p>
          </div>
        </div>

        <Select value={source} onValueChange={(v) => setSource(v as ResultsSource)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="funnels">
              <span className="flex items-center gap-2">
                <FunnelIcon className="h-3.5 w-3.5" /> Funis (quiz/chat)
              </span>
            </SelectItem>
            <SelectItem value="forms">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Formulários
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {source === 'funnels' ? <FunnelResults /> : <FormResults />}
    </div>
  );
}

/* ───────────── Resultados de FUNIS (porte 1:1 do CaptureResultsSection) ───────────── */

function FunnelResults() {
  const [funnelId, setFunnelId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PlatformCrmCaptureLead | null>(null);

  const { data: funnels } = usePlatformCrmCaptureFunnels();
  const { data: leads, isLoading } = usePlatformCrmFunnelLeads();

  const funnelName = useMemo(() => {
    const map = new Map((funnels ?? []).map((f) => [f.id, f.name]));
    return (id: unknown) => (typeof id === 'string' ? map.get(id) : undefined);
  }, [funnels]);

  const filtered = useMemo(() => {
    let rows = leads ?? [];
    if (funnelId !== 'all') {
      rows = rows.filter(
        (l) => ((l.metadata as Record<string, unknown> | null) ?? {}).funnel_id === funnelId,
      );
    }
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (l) =>
        l.name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) ||
        l.phone?.includes(s),
    );
  }, [leads, funnelId, search]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Select value={funnelId} onValueChange={setFunnelId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {(funnels ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{filtered.length} respostas</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum resultado ainda. Compartilhe seus funis para começar a coletar respostas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Funil</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Temperatura</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const m = ((l.metadata as Record<string, unknown> | null) ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const tags = (m.tags as string[]) ?? [];
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.email || l.phone}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {(m.funnel_name as string) || funnelName(m.funnel_id) || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {(m.score as number) ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 capitalize">
                          {tempIcon(l.temperature)} {l.temperature ?? '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                          {tags.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(l.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(l)}
                          className="gap-1"
                        >
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drilldown */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.email || '—'} · {selected.phone || '—'} ·{' '}
                  {format(new Date(selected.created_at), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-2xl font-bold">
                      {((selected.metadata as Record<string, unknown> | null)?.score as number) ??
                        0}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Temperatura</div>
                    <div className="text-lg font-semibold capitalize flex items-center gap-1">
                      {tempIcon(selected.temperature)} {selected.temperature ?? '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Canal</div>
                    <div className="text-lg font-semibold capitalize">
                      {((selected.metadata as Record<string, unknown> | null)
                        ?.funnel_channel as string) || '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Respostas</h4>
                  <div className="space-y-2">
                    {Object.entries(
                      ((selected.metadata as Record<string, unknown> | null)?.responses as
                        | Record<string, unknown>
                        | undefined) ?? {},
                    ).map(([k, v]) => (
                      <div key={k} className="rounded border p-2 text-sm">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {(((selected.metadata as Record<string, unknown> | null)?.tags as string[]) ?? [])
                  .length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Tags aplicadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        ((selected.metadata as Record<string, unknown> | null)
                          ?.tags as string[]) ?? []
                      ).map((t, i) => (
                        <Badge key={i} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Submissões de FORMULÁRIOS (fonte platform_crm_form_submissions) ───────────── */

const submissionStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  completed: { label: 'Concluída', variant: 'default' },
  in_progress: { label: 'Em andamento', variant: 'secondary' },
  partial: { label: 'Parcial', variant: 'outline' },
  abandoned: { label: 'Abandonada', variant: 'destructive' },
};

function FormResults() {
  const [formId, setFormId] = useState<string>('all');
  const [selected, setSelected] = useState<PlatformCrmFormSubmissionRow | null>(null);

  const { data: forms } = usePlatformCrmForms();
  const { data: submissions, isLoading } = usePlatformCrmAllFormSubmissions();

  const formName = useMemo(() => {
    const map = new Map((forms ?? []).map((f) => [f.id, f.name]));
    return (id: string) => map.get(id) ?? '-';
  }, [forms]);

  const filtered = useMemo(() => {
    const rows = submissions ?? [];
    if (formId === 'all') return rows;
    return rows.filter((s) => s.form_id === formId);
  }, [submissions, formId]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os formulários</SelectItem>
                {(forms ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Badge variant="secondary">{filtered.length} submissões</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma submissão ainda. Compartilhe seus formulários para coletar respostas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formulário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const status =
                    submissionStatusConfig[s.status ?? ''] ?? {
                      label: s.status ?? '-',
                      variant: 'outline' as const,
                    };
                  const tags = s.tags ?? [];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">
                        {formName(s.form_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {s.total_score ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                          {tags.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.time_spent_seconds != null ? `${s.time_spent_seconds}s` : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.created_at
                          ? format(new Date(s.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(s)}
                          className="gap-1"
                        >
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drilldown */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{formName(selected.form_id)}</DialogTitle>
                <DialogDescription>
                  {selected.created_at
                    ? format(new Date(selected.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })
                    : '—'}
                  {selected.utm_source ? ` · UTM: ${selected.utm_source}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-2xl font-bold">{selected.total_score ?? 0}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="text-lg font-semibold capitalize">
                      {selected.status ?? '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Tempo</div>
                    <div className="text-lg font-semibold">
                      {selected.time_spent_seconds != null
                        ? `${selected.time_spent_seconds}s`
                        : '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Respostas</h4>
                  <div className="space-y-2">
                    {Object.entries(
                      ((selected.responses as Record<string, unknown> | null) ?? {}) as Record<
                        string,
                        unknown
                      >,
                    ).map(([k, v]) => (
                      <div key={k} className="rounded border p-2 text-sm">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {(selected.tags ?? []).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Tags aplicadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected.tags ?? []).map((t, i) => (
                        <Badge key={i} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
