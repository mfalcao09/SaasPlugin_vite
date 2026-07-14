import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Radar, Search, Download, Loader2, Sprout, BadgeCheck, ExternalLink, RefreshCw, HelpCircle, Columns3, ClipboardPaste, Trash2, RotateCcw, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformLeadExtractions,
  usePlatformExtractedLeads,
  useStartExtraction,
  useReclassifyLead,
  useImportHandles,
  useExcludeLead,
  useRestoreLead,
  useSetLeadPhone,
  type LeadSegment,
  type ExtractedLead,
} from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * PROSPECÇÃO (C9) — cockpit do motor de extração de leads (super_admin, product-scoped).
 * Dispara a Porta A (keyword search OU colar @handles), classifica por segmento, permite
 * RECLASSIFICAR manualmente (override humano), preencher WhatsApp na mão, EXCLUIR de vez
 * (lixeira LGPD-safe), mostra o PORQUÊ (veredito por camada), colunas mostrar/ocultar, e
 * exporta os qualificados p/ ads.
 */

const SEG_META: Record<LeadSegment, { label: string; dot: string; cls: string }> = {
  salao_cliente: { label: 'Espaço-cliente', dot: '🟢', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
  afiliado_infoproduto: { label: 'Afiliado', dot: '🔵', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  revisao: { label: 'Revisão', dot: '🟡', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  descarte: { label: 'Descarte', dot: '⚪', cls: 'bg-muted text-muted-foreground border-border' },
  acionamento_via_instagram: { label: 'Instagram (DM)', dot: '🟣', cls: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
};
const SEG_KEYS: LeadSegment[] = ['salao_cliente', 'afiliado_infoproduto', 'revisao', 'descarte', 'acionamento_via_instagram'];

const SUGGESTED = 'cabeleireira, escova progressiva, alongamento de unhas, design de sobrancelhas, esmalteria, micropigmentação, salão de beleza';

// Colunas opcionais (mostrar/ocultar). As 5 base (segmento, perfil, seguidores, telefone, categoria) são fixas.
const OPT_COLS: { key: string; label: string }[] = [
  { key: 'seguindo', label: 'Seguindo' },
  { key: 'posts', label: 'Posts' },
  { key: 'email', label: 'E-mail' },
  { key: 'website', label: 'Site' },
  { key: 'verified', label: 'Verificado' },
  { key: 'pais', label: 'País' },
  { key: 'idioma', label: 'Idioma' },
];

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Resume o veredito por camada (o "por quê") num texto pra tooltip. */
function whyText(l: ExtractedLead): string {
  const v = l.filter_verdicts;
  if (!v) return 'Sem veredito registrado.';
  const icp = v.icp ? `ICP ${v.icp.pass ? '✓' : '✗'} (${v.icp.reason})` : '';
  const lang = v.lang ? `Idioma ${v.lang.pass ? '✓' : '✗'} (${v.lang.verdict})` : '';
  const geo = v.geo ? `GEO ${v.geo.is_brazil ? '✓ BR' : v.geo.explicit_foreign ? '✗ estrangeiro' : '✗ indef'} [${(v.geo.signals || []).join(',')}]` : '';
  const phone = v.phone ? `Telefone ${v.phone.has_br_phone ? '✓' : '✗'}` : '';
  return [icp, lang, geo, phone].filter(Boolean).join('  ·  ');
}

function toCsv(rows: ExtractedLead[]): string {
  const head = ['handle', 'name', 'telefone', 'whatsapp_link', 'instagram_url', 'seguidores', 'categoria', 'email', 'website'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.handle, r.name, r.telefone, r.whatsapp_link, r.instagram_url, r.seguidores, r.categoria, r.email, r.website].map(esc).join(','),
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
  const [showExcluded, setShowExcluded] = useState(false);
  const [cols, setCols] = useState<Set<string>>(new Set());
  const [showRules, setShowRules] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingPhone, setEditingPhone] = useState<{ id: string; value: string } | null>(null);

  const { data: extractions = [] } = usePlatformLeadExtractions(productId);
  const activeExtraction =
    selectedExtractionId ?? extractions.find((e) => e.status === 'done')?.id ?? extractions[0]?.id ?? null;
  const { data: leads = [], isLoading: leadsLoading } = usePlatformExtractedLeads(activeExtraction, { segment, seedsOnly, qualifiedOnly, excludedOnly: showExcluded });
  const start = useStartExtraction();
  const reclassify = useReclassifyLead();
  const importHandles = useImportHandles();
  const exclude = useExcludeLead();
  const restore = useRestoreLead();
  const setPhone = useSetLeadPhone();
  const qc = useQueryClient();

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
    qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, descarte: 0, acionamento_via_instagram: 0, seeds: 0 };
    for (const l of leads) {
      if (l.segment) c[l.segment] = (c[l.segment] ?? 0) + 1;
      if (l.is_seed) c.seeds++;
    }
    return c;
  }, [leads]);

  // Handles colados → tokens limpos (o edge re-sanitiza @/URL e capa em 200).
  const pastedHandles = useMemo(
    () => pasteText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
    [pasteText],
  );

  const toggleCol = (k: string) => setCols((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const has = (k: string) => cols.has(k);

  const handleStart = () => {
    const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20);
    if (!productId || kws.length === 0) return;
    start.mutate({ product_id: productId, keywords: kws, limit });
  };

  const handleImportHandles = () => {
    if (!productId || pastedHandles.length === 0) return;
    importHandles.mutate(
      { product_id: productId, handles: pastedHandles.slice(0, 200) },
      { onSuccess: () => { setPasteText(''); setShowPaste(false); } },
    );
  };

  const savePhone = () => {
    if (!editingPhone || !editingPhone.value.trim()) return;
    setPhone.mutate({ id: editingPhone.id, telefone: editingPhone.value }, { onSuccess: () => setEditingPhone(null) });
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
            <Radar className="h-6 w-6 text-primary" /> Prospecção
          </h1>
          <p className="text-muted-foreground mt-1">
            Motor de extração de leads (Instagram). Busque por palavra-chave ou cole @handles; os perfis vêm classificados por segmento.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant={showPaste ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setShowPaste((v) => !v)}>
            <ClipboardPaste className="h-4 w-4" /> Colar handles
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowRules((v) => !v)}>
            <HelpCircle className="h-4 w-4" /> Regras
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {showRules && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
          <p>🟢 <b>Espaço-cliente (Qualificado):</b> beleza + Brasil + <b>telefone BR presente</b>. É o que entra no export/ads.</p>
          <p>🟣 <b>Instagram (DM):</b> beleza/BR sem telefone mesmo após enriquecimento — acionamento via direct do Instagram (o @ basta).</p>
          <p>🔵 <b>Afiliado:</b> curso/mentoria de beleza (kiwify/hotmart, "X alunas formadas"). Guardado p/ recrutamento futuro.</p>
          <p>🟡 <b>Revisão:</b> é beleza mas faltou confirmar Brasil e/ou contato — triagem manual.</p>
          <p>⚪ <b>Descarte:</b> fora do mercado (idioma não-PT, geografia estrangeira, ou sem sinal de beleza). Passe o mouse no segmento pra ver <b>por qual camada</b> caiu.</p>
          <p>🗑️ <b>Excluir de vez:</b> apaga a PII do lead e arquiva o @ pra nunca mais voltar num scrap (lixeira LGPD-safe). Use nos descartes confirmados.</p>
          <p>➕ <b>WhatsApp manual:</b> achou o telefone numa imagem do perfil? Preencha na coluna Telefone → o lead vira qualificado (espaço-cliente).</p>
          <p>🌱 <b>Semente:</b> perfil de beleza com ≥ 50k seguidores (hub p/ minerar). Você pode marcar/desmarcar manualmente.</p>
        </div>
      )}

      {showPaste && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="text-sm font-medium text-foreground">
            Colar @handles — um por linha, vírgula ou espaço (aceita @perfil, link do Instagram ou usuário cru)
          </label>
          <textarea
            className="w-full h-28 rounded-md border border-border bg-background p-2 text-sm font-mono resize-y"
            placeholder={'@salaobelo\ninstagram.com/estudio.rosa\nmanicure.sp'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {pastedHandles.length} handle(s){pastedHandles.length > 200 ? ' · só os 200 primeiros' : ''} · usa a conta Apify do projeto (~US$0,0026/perfil)
            </span>
            <Button onClick={handleImportHandles} disabled={importHandles.isPending || !productId || pastedHandles.length === 0} className="gap-2 ml-auto">
              {importHandles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Importar handles
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <label className="text-sm font-medium text-foreground">Palavras-chave (separadas por vírgula)</label>
        <Input placeholder={SUGGESTED} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-xs text-primary underline" onClick={() => setKeywords(SUGGESTED)}>usar conjunto-ouro</button>
          <span className="text-xs text-muted-foreground">·</span>
          <label className="text-xs text-muted-foreground">perfis/keyword:</label>
          <Input type="number" className="w-20 h-8" min={5} max={100} value={limit} onChange={(e) => setLimit(Math.max(5, Math.min(100, Number(e.target.value) || 30)))} />
          <Button onClick={handleStart} disabled={start.isPending || !productId || !keywords.trim()} className="gap-2 ml-auto">
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar leads
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={activeExtraction ?? ''} onValueChange={setSelectedExtractionId}>
          <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecione uma extração" /></SelectTrigger>
          <SelectContent>
            {extractions.map((ex) => (
              <SelectItem key={ex.id} value={ex.id}>
                {(ex.keywords ?? []).slice(0, 3).join(', ')}{(ex.keywords?.length ?? 0) > 3 ? '…' : ''} · {ex.status}{ex.total_found != null ? ` · ${ex.total_found}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={segment} onValueChange={(v) => setSegment(v as LeadSegment | 'all')}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os segmentos</SelectItem>
            <SelectItem value="salao_cliente">🟢 Espaço-cliente</SelectItem>
            <SelectItem value="acionamento_via_instagram">🟣 Instagram (DM)</SelectItem>
            <SelectItem value="afiliado_infoproduto">🔵 Afiliado</SelectItem>
            <SelectItem value="revisao">🟡 Revisão</SelectItem>
            <SelectItem value="descarte">⚪ Descarte</SelectItem>
          </SelectContent>
        </Select>

        <Button variant={seedsOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setSeedsOnly((v) => !v)}><Sprout className="h-4 w-4" /> Sementes</Button>
        <Button variant={qualifiedOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setQualifiedOnly((v) => !v)}><BadgeCheck className="h-4 w-4" /> Qualificados</Button>
        <Button variant={showExcluded ? 'destructive' : 'outline'} size="sm" className="gap-1" onClick={() => setShowExcluded((v) => !v)}><Trash2 className="h-4 w-4" /> Lixeira</Button>

        <div className="relative">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowColMenu((v) => !v)}><Columns3 className="h-4 w-4" /> Colunas</Button>
          {showColMenu && (
            <div className="absolute z-20 mt-1 w-44 rounded-md border border-border bg-popover p-2 shadow-md">
              {OPT_COLS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded">
                  <input type="checkbox" checked={has(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" className="gap-1 ml-auto" onClick={handleExport} disabled={leads.length === 0}><Download className="h-4 w-4" /> Exportar qualificados (CSV)</Button>
      </div>

      {showExcluded && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          🗑️ <b>Lixeira</b> — perfis excluídos de vez. A PII foi apagada; o @ fica arquivado pra não voltar em buscas. Você pode restaurar (a PII não volta, mas o perfil reaparece nas buscas).
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={SEG_META.salao_cliente.cls}>🟢 {counts.salao_cliente} salão</Badge>
        <Badge variant="outline" className={SEG_META.afiliado_infoproduto.cls}>🔵 {counts.afiliado_infoproduto} afiliado</Badge>
        <Badge variant="outline" className={SEG_META.revisao.cls}>🟡 {counts.revisao} revisão</Badge>
        <Badge variant="outline" className={SEG_META.descarte.cls}>⚪ {counts.descarte} descarte</Badge>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">🌱 {counts.seeds} sementes</Badge>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Segmento (clique p/ mudar)</th>
                <th className="text-left p-2 font-medium">Perfil</th>
                <th className="text-right p-2 font-medium">Seguidores</th>
                {has('seguindo') && <th className="text-right p-2 font-medium">Seguindo</th>}
                {has('posts') && <th className="text-right p-2 font-medium">Posts</th>}
                <th className="text-left p-2 font-medium">Telefone</th>
                {has('email') && <th className="text-left p-2 font-medium">E-mail</th>}
                {has('website') && <th className="text-left p-2 font-medium">Site</th>}
                {has('verified') && <th className="text-center p-2 font-medium">✔</th>}
                {has('pais') && <th className="text-left p-2 font-medium">País</th>}
                {has('idioma') && <th className="text-left p-2 font-medium">Idioma</th>}
                <th className="text-left p-2 font-medium">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {leadsLoading && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!leadsLoading && leads.length === 0 && (
                <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">{showExcluded ? 'Lixeira vazia.' : activeExtraction ? 'Nenhum lead com esses filtros.' : 'Dispare uma busca acima para começar.'}</td></tr>
              )}
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2" title={whyText(l)}>
                    <div className="flex items-center gap-1">
                      <select
                        className={`text-xs rounded border px-1 py-0.5 bg-transparent ${l.segment ? SEG_META[l.segment]?.cls ?? '' : ''}`}
                        value={l.segment ?? 'descarte'}
                        onChange={(e) => reclassify.mutate({ id: l.id, segment: e.target.value as LeadSegment })}
                        disabled={showExcluded}
                      >
                        {SEG_KEYS.map((k) => <option key={k} value={k}>{SEG_META[k].dot} {SEG_META[k].label}</option>)}
                      </select>
                      <button
                        title={l.is_seed ? 'Desmarcar semente' : 'Marcar semente'}
                        className={`text-sm ${l.is_seed ? '' : 'opacity-30'}`}
                        onClick={() => reclassify.mutate({ id: l.id, is_seed: !l.is_seed })}
                      >🌱</button>
                      {showExcluded ? (
                        <button
                          title="Restaurar da lixeira"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => productId && restore.mutate({ id: l.id, handle: l.handle, productId })}
                        ><RotateCcw className="h-3.5 w-3.5" /></button>
                      ) : (
                        <button
                          title="Excluir de vez (apaga PII + arquiva)"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => productId && exclude.mutate({ id: l.id, handle: l.handle, productId })}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <a href={l.instagram_url ?? `https://instagram.com/${l.handle}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">@{l.handle} <ExternalLink className="h-3 w-3" /></a>
                    {l.name && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{l.name}</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(l.seguidores)}</td>
                  {has('seguindo') && <td className="p-2 text-right tabular-nums">{fmtNum(l.seguindo)}</td>}
                  {has('posts') && <td className="p-2 text-right tabular-nums">{fmtNum(l.posts)}</td>}
                  <td className="p-2">
                    {l.whatsapp_link ? (
                      <a href={l.whatsapp_link} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">WhatsApp</a>
                    ) : l.telefone ? (
                      l.telefone
                    ) : editingPhone?.id === l.id ? (
                      <span className="inline-flex items-center gap-1">
                        <Input
                          autoFocus
                          className="h-7 w-32 text-xs"
                          placeholder="(11) 91234-5678"
                          value={editingPhone.value}
                          onChange={(e) => setEditingPhone({ id: l.id, value: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(null); }}
                        />
                        <button title="Salvar" className="text-green-600" onClick={savePhone} disabled={setPhone.isPending}><Check className="h-3.5 w-3.5" /></button>
                        <button title="Cancelar" className="text-muted-foreground" onClick={() => setEditingPhone(null)}><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ) : showExcluded ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <button className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline" title="Preencher WhatsApp manualmente → vira qualificado" onClick={() => setEditingPhone({ id: l.id, value: '' })}>
                        <Plus className="h-3 w-3" /> WhatsApp
                      </button>
                    )}
                  </td>
                  {has('email') && <td className="p-2 text-muted-foreground truncate max-w-[160px]">{l.email ?? '—'}</td>}
                  {has('website') && <td className="p-2 truncate max-w-[160px]">{l.website ? <a href={l.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.website.replace(/^https?:\/\//, '')}</a> : '—'}</td>}
                  {has('verified') && <td className="p-2 text-center">{l.is_verified ? '✔' : ''}</td>}
                  {has('pais') && <td className="p-2 text-muted-foreground">{l.geo_country ?? '—'}</td>}
                  {has('idioma') && <td className="p-2 text-muted-foreground">{l.bio_lang ?? '—'}</td>}
                  <td className="p-2 text-muted-foreground truncate max-w-[160px]">{l.categoria ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
