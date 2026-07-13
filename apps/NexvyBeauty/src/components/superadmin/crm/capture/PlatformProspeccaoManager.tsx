import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Radar, Search, Download, Loader2, Sprout, BadgeCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformLeadExtractions,
  usePlatformExtractedLeads,
  useStartExtraction,
  type LeadSegment,
  type ExtractedLead,
} from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * PROSPECÇÃO (C9) — cockpit do motor de extração de leads (super_admin, product-scoped).
 * Dispara a Porta A (keyword search), lista as extrações e mostra os leads
 * classificados por segmento (🟢 salão / 🔵 afiliado / 🟡 revisão / ⚪ descarte),
 * marcando 🌱 sementes. Exporta os `salao_cliente` qualificados p/ audiência de ads.
 */

const SEG_META: Record<LeadSegment, { label: string; dot: string; cls: string }> = {
  salao_cliente: { label: 'Salão-cliente', dot: '🟢', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
  afiliado_infoproduto: { label: 'Afiliado', dot: '🔵', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  revisao: { label: 'Revisão', dot: '🟡', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  descarte: { label: 'Descarte', dot: '⚪', cls: 'bg-muted text-muted-foreground border-border' },
};

// Keywords afiadas BR-específicas (o "conjunto-ouro" validado nos probes).
const SUGGESTED = 'cabeleireira, escova progressiva, alongamento de unhas, design de sobrancelhas, esmalteria, micropigmentação, salão de beleza';

function fmtNum(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function toCsv(rows: ExtractedLead[]): string {
  const head = ['handle', 'name', 'telefone', 'whatsapp_link', 'instagram_url', 'seguidores', 'categoria'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.handle, r.name, r.telefone, r.whatsapp_link, r.instagram_url, r.seguidores, r.categoria].map(esc).join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function PlatformProspeccaoManager() {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;

  const [keywords, setKeywords] = useState('');
  const [limit, setLimit] = useState(30);
  const [selectedExtractionId, setSelectedExtractionId] = useState<string | null>(null);
  const [segment, setSegment] = useState<LeadSegment | 'all'>('all');
  const [seedsOnly, setSeedsOnly] = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);

  const { data: extractions = [] } = usePlatformLeadExtractions(productId);
  // Default: a extração escolhida pelo usuário; senão a última CONCLUÍDA (que já
  // tem leads); senão a mais recente. Evita abrir numa 'running' vazia.
  const activeExtraction =
    selectedExtractionId ??
    extractions.find((e) => e.status === 'done')?.id ??
    extractions[0]?.id ??
    null;
  const { data: leads = [], isLoading: leadsLoading } = usePlatformExtractedLeads(activeExtraction, {
    segment,
    seedsOnly,
    qualifiedOnly,
  });
  const start = useStartExtraction();
  const qc = useQueryClient();

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
    qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, descarte: 0, seeds: 0 };
    for (const l of leads) {
      if (l.segment) c[l.segment] = (c[l.segment] ?? 0) + 1;
      if (l.is_seed) c.seeds++;
    }
    return c;
  }, [leads]);

  const handleStart = () => {
    const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20);
    if (!productId || kws.length === 0) return;
    start.mutate({ product_id: productId, keywords: kws, limit });
  };

  const handleExport = () => {
    const qualified = leads.filter((l) => l.qualified);
    const blob = new Blob([toCsv(qualified)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospeccao-qualificados-${activeExtraction?.slice(0, 8) ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            Prospecção
          </h1>
          <p className="text-muted-foreground mt-1">
            Motor de extração de leads (Instagram). Busque por palavra-chave; os perfis vêm classificados por segmento.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Disparo (Porta A — keyword search) */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <label className="text-sm font-medium text-foreground">Palavras-chave (separadas por vírgula)</label>
        <Input
          placeholder={SUGGESTED}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-xs text-primary underline" onClick={() => setKeywords(SUGGESTED)}>
            usar conjunto-ouro
          </button>
          <span className="text-xs text-muted-foreground">·</span>
          <label className="text-xs text-muted-foreground">perfis/keyword:</label>
          <Input
            type="number"
            className="w-20 h-8"
            min={5}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Math.max(5, Math.min(100, Number(e.target.value) || 30)))}
          />
          <Button onClick={handleStart} disabled={start.isPending || !productId || !keywords.trim()} className="gap-2 ml-auto">
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar leads
          </Button>
        </div>
      </div>

      {/* Seletor de extração + filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={activeExtraction ?? ''} onValueChange={setSelectedExtractionId}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Selecione uma extração" />
          </SelectTrigger>
          <SelectContent>
            {extractions.map((ex) => (
              <SelectItem key={ex.id} value={ex.id}>
                {(ex.keywords ?? []).slice(0, 3).join(', ')}
                {(ex.keywords?.length ?? 0) > 3 ? '…' : ''} · {ex.status}
                {ex.total_found != null ? ` · ${ex.total_found} perfis` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={segment} onValueChange={(v) => setSegment(v as LeadSegment | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os segmentos</SelectItem>
            <SelectItem value="salao_cliente">🟢 Salão-cliente</SelectItem>
            <SelectItem value="afiliado_infoproduto">🔵 Afiliado</SelectItem>
            <SelectItem value="revisao">🟡 Revisão</SelectItem>
            <SelectItem value="descarte">⚪ Descarte</SelectItem>
          </SelectContent>
        </Select>

        <Button variant={seedsOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setSeedsOnly((v) => !v)}>
          <Sprout className="h-4 w-4" /> Sementes
        </Button>
        <Button variant={qualifiedOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setQualifiedOnly((v) => !v)}>
          <BadgeCheck className="h-4 w-4" /> Qualificados
        </Button>

        <Button variant="outline" size="sm" className="gap-1 ml-auto" onClick={handleExport} disabled={leads.length === 0}>
          <Download className="h-4 w-4" /> Exportar qualificados (CSV)
        </Button>
      </div>

      {/* Resumo por segmento */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={SEG_META.salao_cliente.cls}>🟢 {counts.salao_cliente} salão</Badge>
        <Badge variant="outline" className={SEG_META.afiliado_infoproduto.cls}>🔵 {counts.afiliado_infoproduto} afiliado</Badge>
        <Badge variant="outline" className={SEG_META.revisao.cls}>🟡 {counts.revisao} revisão</Badge>
        <Badge variant="outline" className={SEG_META.descarte.cls}>⚪ {counts.descarte} descarte</Badge>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">🌱 {counts.seeds} sementes</Badge>
      </div>

      {/* Tabela de leads */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Segmento</th>
                <th className="text-left p-2 font-medium">Perfil</th>
                <th className="text-right p-2 font-medium">Seguidores</th>
                <th className="text-left p-2 font-medium">Telefone</th>
                <th className="text-left p-2 font-medium">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {leadsLoading && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              )}
              {!leadsLoading && leads.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {activeExtraction ? 'Nenhum lead com esses filtros.' : 'Dispare uma busca acima para começar.'}
                </td></tr>
              )}
              {leads.map((l) => {
                const meta = l.segment ? SEG_META[l.segment] : null;
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-2">
                      {meta && <Badge variant="outline" className={meta.cls}>{meta.dot} {meta.label}</Badge>}
                      {l.is_seed && <span title="Semente" className="ml-1">🌱</span>}
                    </td>
                    <td className="p-2">
                      <a href={l.instagram_url ?? `https://instagram.com/${l.handle}`} target="_blank" rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1">
                        @{l.handle} <ExternalLink className="h-3 w-3" />
                      </a>
                      {l.name && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{l.name}</div>}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtNum(l.seguidores)}</td>
                    <td className="p-2">
                      {l.whatsapp_link ? (
                        <a href={l.whatsapp_link} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">WhatsApp</a>
                      ) : l.telefone ? l.telefone : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-muted-foreground truncate max-w-[160px]">{l.categoria ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
