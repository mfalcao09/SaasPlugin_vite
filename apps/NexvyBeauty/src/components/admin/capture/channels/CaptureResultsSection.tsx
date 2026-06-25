import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Target, Loader2, Search, Flame, Snowflake, ThermometerSun, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Resultados UNIFICADOS de captação: todos os leads que entraram por QUALQUER
// ferramenta (quiz, formulário, WhatsApp, chat, etc.), não só quizzes. A origem é
// derivada de metadata.funnel_channel (funis: quiz/form/poll) ou de lead_origin/
// lead_channel (whatsapp/webchat/instagram/...).
//
// Além dos LEADS, incluímos também as respostas de `form_submissions` que NÃO
// geraram lead (auto_create_lead=false ou lead removido) — assim nenhuma resposta
// de formulário se perde. Ambos os tipos são normalizados para `CaptureRow`.
interface CaptureLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  temperature: string;
  created_at: string;
  lead_origin: string | null;
  lead_channel: string | null;
  metadata: any;
}

// Shape unificada usada pela tabela/drilldown. Leads e submissions são mapeados
// para este formato. `kind` distingue a origem dos dados (não a "origem" de marketing).
interface CaptureRow {
  kind: 'lead' | 'form_submission';
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  temperature: string | null;
  created_at: string;
  lead_origin: string | null;
  lead_channel: string | null;
  metadata: any; // { funnel_channel?, funnel_name?, score?, tags?, responses? }
}

// Linha JSONB bruta de form_submissions + join com forms (nome do formulário).
interface FormSubmissionRow {
  id: string;
  lead_id: string | null;
  total_score: number | null;
  tags: string[] | null;
  created_at: string;
  responses: Record<string, unknown> | null;
  forms: { name: string | null } | null;
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
  form: 'Formulário', forms: 'Formulário', formulario: 'Formulário',
  poll: 'Enquete', enquete: 'Enquete',
  whatsapp: 'WhatsApp',
  webchat: 'Site (Chat)', web_chat: 'Site (Chat)', site: 'Site (Chat)', chat: 'Site (Chat)',
  instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger',
  funnel: 'Funil',
};

function originKey(l: CaptureRow): string {
  const m = (l.metadata || {}) as any;
  return String(m.funnel_channel || l.lead_channel || l.lead_origin || 'outro').toLowerCase();
}
function originLabel(l: CaptureRow): string {
  const k = originKey(l);
  if (ORIGIN_LABELS[k]) return ORIGIN_LABELS[k];
  const m = (l.metadata || {}) as any;
  if (m.funnel_name) return 'Funil';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

// Considera "captação" o lead que veio de um funil (tem funnel_id) OU de um canal
// de entrada reconhecido — exclui cadastro manual puro.
const CAPTURE_ORIGINS = new Set([
  'funnel', 'quiz', 'form', 'forms', 'poll', 'whatsapp', 'webchat', 'web_chat',
  'site', 'chat', 'instagram', 'facebook', 'messenger',
]);
function isCaptureLead(l: CaptureLead): boolean {
  const m = (l.metadata || {}) as any;
  if (m.funnel_id) return true;
  return CAPTURE_ORIGINS.has(String(l.lead_origin || '').toLowerCase())
    || CAPTURE_ORIGINS.has(String(l.lead_channel || '').toLowerCase());
}

export function CaptureResultsSection() {
  const { profile } = useAuth();
  const [origin, setOrigin] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CaptureRow | null>(null);

  // 1) LEADS de captação (todas as origens) — fonte rica (score, temperatura, tags).
  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ['capture-results', profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, phone, temperature, created_at, lead_origin, lead_channel, metadata')
        .eq('organization_id', profile!.organization_id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data as CaptureLead[]) || []).filter(isCaptureLead);
    },
  });

  // 2) RESPOSTAS de formulário — inclui as que NÃO viraram lead. Filtra por org via
  // join `forms.organization_id` (form_submissions não tem organization_id direto).
  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ['capture-form-submissions', profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_submissions')
        .select('id, lead_id, total_score, tags, created_at, responses, forms!inner(name, organization_id)')
        .eq('forms.organization_id', profile!.organization_id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as FormSubmissionRow[];
    },
  });

  const isLoading = leadsLoading || subsLoading;

  // 3) Normaliza leads para a shape unificada.
  const leadRows = useMemo<CaptureRow[]>(
    () =>
      (leads || []).map((l) => ({
        kind: 'lead' as const,
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        temperature: l.temperature,
        created_at: l.created_at,
        lead_origin: l.lead_origin,
        lead_channel: l.lead_channel,
        metadata: l.metadata,
      })),
    [leads],
  );

  // 4) Normaliza form_submissions → mesma shape. Dedup: descarta submissions cujo
  // telefone/e-mail já casa com um lead listado (preferimos o lead, mais completo).
  const submissionRows = useMemo<CaptureRow[]>(() => {
    const leadPhoneKeys = new Set<string>();
    const leadEmailKeys = new Set<string>();
    leadRows.forEach((l) => {
      const pk = phoneKey(l.phone);
      if (pk) leadPhoneKeys.add(pk);
      const ek = emailKey(l.email);
      if (ek) leadEmailKeys.add(ek);
    });

    return (submissions || [])
      .map((s): CaptureRow => {
        const responses = s.responses || {};
        const name =
          pickFromResponses(responses, ['nome', 'name']) || 'Resposta de formulário';
        const email = pickFromResponses(responses, ['e-mail', 'email']);
        const phone = pickFromResponses(responses, ['telefone', 'phone', 'whatsapp', 'celular']);
        return {
          kind: 'form_submission',
          id: `fs_${s.id}`,
          name,
          email,
          phone,
          temperature: null,
          created_at: s.created_at,
          lead_origin: 'form',
          lead_channel: 'form',
          metadata: {
            funnel_channel: 'form',
            funnel_name: s.forms?.name || 'Formulário',
            score: s.total_score ?? 0,
            tags: s.tags || [],
            responses, // alimenta o drilldown
          },
        };
      })
      .filter((row) => {
        // Só dedup quando a submission NÃO tem lead_id próprio listado.
        const pk = phoneKey(row.phone);
        const ek = emailKey(row.email);
        const dupByPhone = !!pk && leadPhoneKeys.has(pk);
        const dupByEmail = !!ek && leadEmailKeys.has(ek);
        return !(dupByPhone || dupByEmail);
      });
  }, [submissions, leadRows]);

  // 5) MERGE leads + submissions, ordenado por created_at desc.
  const allRows = useMemo<CaptureRow[]>(
    () =>
      [...leadRows, ...submissionRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [leadRows, submissionRows],
  );

  // Origens distintas presentes → monta o filtro dinamicamente (inclui 'Formulário').
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
      rows = rows.filter((l) =>
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
            Todas as respostas e leads das suas ferramentas de captação — quiz, formulários, WhatsApp, chat e mais.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="sm:w-64"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {origins.map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
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
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum resultado ainda. Compartilhe seus quizzes, formulários e link de WhatsApp para começar a coletar respostas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Temperatura</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const m = (l.metadata || {}) as any;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.email || l.phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{originLabel(l)}</Badge>
                        {m.funnel_name && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{m.funnel_name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{m.score ?? 0}</Badge>
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
                          {((m.tags as string[]) || []).slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                          {((m.tags as string[]) || []).length > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{((m.tags as string[])).length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(l.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(l)} className="gap-1">
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
                    <div className="text-2xl font-bold">{(selected.metadata as any)?.score ?? 0}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Temperatura</div>
                    <div className="text-lg font-semibold capitalize flex items-center gap-1">
                      {selected.temperature ? (
                        <>{tempIcon(selected.temperature)} {selected.temperature}</>
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
                  {Object.keys(((selected.metadata as any)?.responses || {})).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem respostas estruturadas para esta origem.</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(((selected.metadata as any)?.responses || {})).map(([k, v]) => (
                        <div key={k} className="rounded border p-2 text-sm">
                          <div className="text-xs text-muted-foreground">{k}</div>
                          <div>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {((selected.metadata as any)?.tags || []).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Tags aplicadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {((selected.metadata as any).tags as string[]).map((t, i) => (
                        <Badge key={i} variant="secondary">{t}</Badge>
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
