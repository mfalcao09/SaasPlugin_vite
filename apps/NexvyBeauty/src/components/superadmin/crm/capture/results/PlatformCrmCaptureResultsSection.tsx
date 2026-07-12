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
import { Target, Loader2, Search, Flame, Snowflake, ThermometerSun, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  usePlatformCrmFunnelLeads,
  usePlatformCrmAllFormSubmissions,
  type PlatformCrmCaptureLead,
  type PlatformCrmFormSubmissionRow,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureInsights';
import { usePlatformCrmCaptureFunnels } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { usePlatformCrmForms } from '@/components/superadmin/crm/data/usePlatformCrmForms';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

/**
 * CRM de PLATAFORMA (super_admin) — RESULTADOS de captação, PORTE FIEL do
 * `CaptureResultsSection` do CRM tenant (admin/capture/channels), desacoplado do
 * tenant e PRODUCT-SCOPED (ZERO organization_id).
 *
 * Estrutura/UX 1:1 do original: uma tabela UNIFICADA com TODAS as respostas de
 * captação — leads que entraram por funil (quiz/chat/chatbot/widget) + respostas
 * de formulário que não viraram lead — com filtro de ORIGEM, busca, contador e
 * drilldown. O que muda é apenas o data-layer e o recorte por produto:
 *
 * - `leads` (tenant, `.eq('organization_id', ...)`) → `usePlatformCrmFunnelLeads`
 *   (platform_crm_leads, lead_origin='funnel'; RLS super_admin isola os dados).
 * - `form_submissions` (join forms.organization_id) → `usePlatformCrmAllFormSubmissions`
 *   (platform_crm_form_submissions); nome do form resolvido client-side.
 * - Recorte por PRODUTO ATIVO (D3 F2) via `useActivePlatformProduct`: como as
 *   linhas de lead/submission não carregam product_id direto na leitura, o produto
 *   é resolvido pelo FUNIL (metadata.funnel_id → funnel.product_id) e pelo FORM
 *   (form_id → form.product_id). "Todos" (activeProductId=null) mostra tudo, igual
 *   ao comportamento atual; um produto concreto mostra os dele + os ainda sem
 *   produto (nunca somem) — mesma semântica aditiva das abas Funis/Formulários.
 */

// Shape unificada usada pela tabela/drilldown — leads e submissions são mapeados
// para este formato. `kind` distingue a origem dos DADOS (não a "origem" de marketing).
interface CaptureRow {
  kind: 'lead' | 'form_submission';
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  temperature: string | null;
  created_at: string;
  // { funnel_channel?, funnel_name?, funnel_id?, score?, tags?, responses? }
  metadata: Record<string, unknown>;
}

// Só dígitos — telefones podem estar formatados como "(48) 99652-0589".
function phoneDigits(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}
function phoneKey(p?: string | null): string {
  const d = phoneDigits(p);
  return d.length >= 9 ? d.slice(-9) : d; // sufixo basta p/ casar formatos distintos
}
function emailKey(e?: string | null): string {
  return (e || '').trim().toLowerCase();
}

// Extrai name/email/phone das `responses` (objeto { [labelDoBloco]: valor }) quando
// a submission não tem lead. Procura por labels que contenham palavras-chave.
function pickFromResponses(
  responses: Record<string, unknown> | null,
  keywords: string[],
): string | null {
  if (!responses) return null;
  for (const [label, value] of Object.entries(responses)) {
    const l = label.toLowerCase();
    if (keywords.some((k) => l.includes(k))) {
      if (value == null || value === '') continue;
      return Array.isArray(value) ? value.map(String).join(', ') : String(value);
    }
  }
  return null;
}

const tempIcon = (t: string | null) => {
  if (t === 'hot') return <Flame className="h-3 w-3 text-red-500" />;
  if (t === 'warm') return <ThermometerSun className="h-3 w-3 text-orange-500" />;
  return <Snowflake className="h-3 w-3 text-sky-500" />;
};

const ORIGIN_LABELS: Record<string, string> = {
  quiz: 'Quiz',
  form: 'Formulário',
  forms: 'Formulário',
  formulario: 'Formulário',
  poll: 'Enquete',
  enquete: 'Enquete',
  chat: 'Chat',
  chatbot: 'ChatBot',
  widget: 'Widget',
  whatsapp: 'WhatsApp',
  webchat: 'Site (Chat)',
  web_chat: 'Site (Chat)',
  site: 'Site (Chat)',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  funnel: 'Funil',
};

function originKey(l: CaptureRow): string {
  const m = l.metadata;
  return String(m.funnel_channel || 'funnel').toLowerCase();
}
function originLabel(l: CaptureRow): string {
  const k = originKey(l);
  if (ORIGIN_LABELS[k]) return ORIGIN_LABELS[k];
  if (l.metadata.funnel_name) return 'Funil';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function PlatformCrmCaptureResultsSection() {
  const [origin, setOrigin] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CaptureRow | null>(null);

  // Produto ativo GLOBAL (D3 F2): recorta a lista pelo produto do funil/formulário.
  // `effectiveProductId` fica disponível para simetria com as abas de criação; o
  // filtro de leitura usa `activeProductId` (semântica "Todos" tolerante a null).
  const { activeProductId } = useActivePlatformProduct();

  // 1) LEADS de captação por funil (fonte rica: score, temperatura, tags).
  const { data: leads, isLoading: leadsLoading } = usePlatformCrmFunnelLeads();
  // 2) RESPOSTAS de formulário — inclui as que NÃO viraram lead.
  const { data: submissions, isLoading: subsLoading } = usePlatformCrmAllFormSubmissions();
  // 3) Catálogos p/ resolver nome + produto (recorte) de funis e formulários.
  const { data: funnels } = usePlatformCrmCaptureFunnels();
  const { data: forms } = usePlatformCrmForms();

  const isLoading = leadsLoading || subsLoading;

  // Mapas funil/form → product_id (recorte) e → nome (exibição).
  const funnelProduct = useMemo(
    () => new Map((funnels ?? []).map((f) => [f.id, f.product_id])),
    [funnels],
  );
  const funnelName = useMemo(
    () => new Map((funnels ?? []).map((f) => [f.id, f.name])),
    [funnels],
  );
  const formProduct = useMemo(
    () => new Map((forms ?? []).map((f) => [f.id, f.product_id])),
    [forms],
  );
  const formName = useMemo(
    () => new Map((forms ?? []).map((f) => [f.id, f.name])),
    [forms],
  );

  // "Todos" (null) mostra tudo; um produto concreto mostra os dele + os sem produto
  // (product_id == null) — nunca escondem. Mesma regra das abas Funis/Formulários.
  const matchesProduct = (pid: string | null | undefined) =>
    !activeProductId || pid === activeProductId || pid == null;

  // 4) Normaliza leads → shape unificada, já recortado por produto (via funil).
  const leadRows = useMemo<CaptureRow[]>(
    () =>
      (leads ?? [])
        .filter((l) => {
          const m = (l.metadata as Record<string, unknown> | null) ?? {};
          const fid = typeof m.funnel_id === 'string' ? m.funnel_id : undefined;
          return matchesProduct(fid ? funnelProduct.get(fid) : undefined);
        })
        .map((l: PlatformCrmCaptureLead): CaptureRow => {
          const m = (l.metadata as Record<string, unknown> | null) ?? {};
          const fid = typeof m.funnel_id === 'string' ? m.funnel_id : undefined;
          return {
            kind: 'lead',
            id: l.id,
            name: l.name,
            email: l.email,
            phone: l.phone,
            temperature: (l.temperature as string | null) ?? null,
            created_at: l.created_at,
            metadata: {
              ...m,
              funnel_name: m.funnel_name || (fid ? funnelName.get(fid) : undefined),
            },
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, funnelProduct, funnelName, activeProductId],
  );

  // 5) Normaliza form_submissions → mesma shape, recortado por produto (via form).
  //    Dedup: descarta submission cujo telefone/e-mail já casa com um lead listado.
  const submissionRows = useMemo<CaptureRow[]>(() => {
    const leadPhoneKeys = new Set<string>();
    const leadEmailKeys = new Set<string>();
    leadRows.forEach((l) => {
      const pk = phoneKey(l.phone);
      if (pk) leadPhoneKeys.add(pk);
      const ek = emailKey(l.email);
      if (ek) leadEmailKeys.add(ek);
    });

    return (submissions ?? [])
      .filter((s: PlatformCrmFormSubmissionRow) => matchesProduct(formProduct.get(s.form_id)))
      .map((s: PlatformCrmFormSubmissionRow): CaptureRow => {
        const responses = (s.responses as Record<string, unknown> | null) ?? {};
        const name = pickFromResponses(responses, ['nome', 'name']) || 'Resposta de formulário';
        const email = pickFromResponses(responses, ['e-mail', 'email']);
        const phone = pickFromResponses(responses, ['telefone', 'phone', 'whatsapp', 'celular']);
        return {
          kind: 'form_submission',
          id: `fs_${s.id}`,
          name,
          email,
          phone,
          temperature: null,
          created_at: s.created_at ?? new Date().toISOString(),
          metadata: {
            funnel_channel: 'form',
            funnel_name: formName.get(s.form_id) || 'Formulário',
            score: s.total_score ?? 0,
            tags: s.tags ?? [],
            responses,
          },
        };
      })
      .filter((row) => {
        const pk = phoneKey(row.phone);
        const ek = emailKey(row.email);
        const dupByPhone = !!pk && leadPhoneKeys.has(pk);
        const dupByEmail = !!ek && leadEmailKeys.has(ek);
        return !(dupByPhone || dupByEmail);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, leadRows, formProduct, formName, activeProductId]);

  // 6) MERGE leads + submissions, ordenado por created_at desc.
  const allRows = useMemo<CaptureRow[]>(
    () =>
      [...leadRows, ...submissionRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [leadRows, submissionRows],
  );

  // Origens distintas presentes → monta o filtro dinamicamente.
  const origins = useMemo(() => {
    const map = new Map<string, string>();
    allRows.forEach((l) => map.set(originKey(l), originLabel(l)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (origin !== 'all') rows = rows.filter((l) => originKey(l) === origin);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.name?.toLowerCase().includes(s) ||
          l.email?.toLowerCase().includes(s) ||
          l.phone?.includes(s),
      );
    }
    return rows;
  }, [allRows, origin, search]);

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Target className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Resultados</h1>
          <p className="text-sm text-muted-foreground">
            Todas as respostas e leads das suas ferramentas de captação — quiz, formulários,
            WhatsApp, chat e mais.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {origins.map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
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
              Nenhum resultado ainda. Compartilhe seus quizzes, formulários e link de WhatsApp para
              começar a coletar respostas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Temperatura</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Tags</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Quando</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const m = l.metadata;
                  const tags = (m.tags as string[]) ?? [];
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.email || l.phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {originLabel(l)}
                        </Badge>
                        {typeof m.funnel_name === 'string' && m.funnel_name && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {m.funnel_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {(m.score as number) ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {l.temperature ? (
                          <Badge variant="secondary" className="gap-1 capitalize">
                            {tempIcon(l.temperature)} {l.temperature}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
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
                  {selected.email || '—'} · {selected.phone || '—'} · {originLabel(selected)} ·{' '}
                  {format(new Date(selected.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-2xl font-bold tabular-nums">
                      {(selected.metadata.score as number) ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Temperatura</div>
                    <div className="text-lg font-semibold capitalize flex items-center gap-1">
                      {selected.temperature ? (
                        <>
                          {tempIcon(selected.temperature)} {selected.temperature}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Origem</div>
                    <div className="text-lg font-semibold">{originLabel(selected)}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Respostas</h4>
                  {Object.keys(
                    (selected.metadata.responses as Record<string, unknown> | undefined) ?? {},
                  ).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sem respostas estruturadas para esta origem.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(
                        (selected.metadata.responses as Record<string, unknown> | undefined) ?? {},
                      ).map(([k, v]) => (
                        <div key={k} className="rounded border p-2 text-sm">
                          <div className="text-xs text-muted-foreground">{k}</div>
                          <div>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {((selected.metadata.tags as string[]) ?? []).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Tags aplicadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {((selected.metadata.tags as string[]) ?? []).map((t, i) => (
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
    </div>
  );
}
