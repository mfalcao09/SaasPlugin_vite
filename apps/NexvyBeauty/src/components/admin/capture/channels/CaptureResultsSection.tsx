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

const tempIcon = (t: string) => {
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

function originKey(l: CaptureLead): string {
  const m = (l.metadata || {}) as any;
  return String(m.funnel_channel || l.lead_channel || l.lead_origin || 'outro').toLowerCase();
}
function originLabel(l: CaptureLead): string {
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
  const [selected, setSelected] = useState<CaptureLead | null>(null);

  const { data: leads, isLoading } = useQuery({
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

  // Origens distintas presentes → monta o filtro dinamicamente.
  const origins = useMemo(() => {
    const map = new Map<string, string>();
    (leads || []).forEach((l) => map.set(originKey(l), originLabel(l)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const filtered = useMemo(() => {
    let rows = leads || [];
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
  }, [leads, origin, search]);

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
                        <Badge variant="secondary" className="gap-1 capitalize">
                          {tempIcon(l.temperature)} {l.temperature}
                        </Badge>
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
                      {tempIcon(selected.temperature)} {selected.temperature}
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
