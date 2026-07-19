import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Radar, Download, Loader2, Sprout, BadgeCheck, ExternalLink, RefreshCw, HelpCircle, Columns3, ClipboardPaste, Trash2, RotateCcw, Plus, Check, X, DoorOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformLeadExtractions,
  usePlatformExtractedLeads,
  useReclassifyLead,
  useImportHandles,
  useExcludeLead,
  useRestoreLead,
  useSetLeadPhone,
  useSetLeadsApproval,
  useSetExtractionLeadsApproval,
  useExtractionApprovalCounts,
  type LeadSegment,
  type ExtractedLead,
  type WhatsappTab,
} from '@/components/superadmin/crm/data/usePlatformProspeccao';
import { SOURCE_META, leadSourceOf, type LeadSource } from '@/components/superadmin/crm/prospeccao/_shared';
import { KeywordSearchBlock } from '@/components/superadmin/crm/prospeccao/KeywordSearchBlock';

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
};
const SEG_KEYS: LeadSegment[] = ['salao_cliente', 'afiliado_infoproduto', 'revisao'];

// Abas de canal WhatsApp — DERIVADAS das colunas (telefone/whatsapp_link), nunca armazenadas.
// Preencheu o telefone → o lead muda de aba sozinho (mata o "lead preso na lista errada").
const WA_TABS: { val: WhatsappTab | 'all'; label: string; hint: string }[] = [
  { val: 'all',    label: 'Todos',  hint: 'Todos os leads da busca' },
  { val: 'numero', label: 'Número', hint: 'Número discável — pronto p/ disparo por WhatsApp' },
  { val: 'link',   label: 'Link',   hint: 'Só link-código (wa.me/message) — acionável no clique, sem número' },
  { val: 'nenhum', label: 'Sem',    hint: 'Sem WhatsApp — esta aba É a fila de enriquecimento' },
];

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

  const [selectedExtractionId, setSelectedExtractionId] = useState<string | null>(null);
  const [segment, setSegment] = useState<LeadSegment | 'all'>('all');
  const [waFilter, setWaFilter] = useState<WhatsappTab | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
  const [seedsOnly, setSeedsOnly] = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [cols, setCols] = useState<Set<string>>(new Set());
  const [showRules, setShowRules] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingPhone, setEditingPhone] = useState<{ id: string; value: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: extractions = [] } = usePlatformLeadExtractions(productId);

  // FONTE: a coluna `source` do banco é sempre 'instagram' (não discrimina); quem discrimina
  // é o PREFIXO do rótulo (keywords[0]) — ver leadSourceOf. Os chips refletem o que a base
  // REALMENTE tem hoje: importações (Prospectagram · Server API · Vídeo) + keyword-search.
  const sourceCounts = useMemo(() => {
    const c = { prospectagram: 0, video: 0, serper: 0, keyword: 0 } as Record<LeadSource, number>;
    for (const ex of extractions) c[leadSourceOf(ex)]++;
    return c;
  }, [extractions]);
  const shownExtractions = useMemo(
    () => (sourceFilter === 'all' ? extractions : extractions.filter((ex) => leadSourceOf(ex) === sourceFilter)),
    [extractions, sourceFilter],
  );
  const activeExtraction =
    (selectedExtractionId && shownExtractions.some((e) => e.id === selectedExtractionId) ? selectedExtractionId : null)
    ?? shownExtractions.find((e) => e.status === 'done')?.id ?? shownExtractions[0]?.id ?? null;
  const { data: leads = [], isLoading: leadsLoading } = usePlatformExtractedLeads(activeExtraction, { segment, waTab: waFilter, seedsOnly, qualifiedOnly, excludedOnly: showExcluded });
  const reclassify = useReclassifyLead();
  const importHandles = useImportHandles();
  const exclude = useExcludeLead();
  const restore = useRestoreLead();
  const setPhone = useSetLeadPhone();
  const approveLeads = useSetLeadsApproval();      // por IDs selecionados
  const approveBulk = useSetExtractionLeadsApproval(); // por extração + filtros / base
  const { data: approvalCounts } = useExtractionApprovalCounts(activeExtraction);
  const qc = useQueryClient();

  // Portão por-LEAD: a seleção (checkboxes) é de IDs da extração/visão atual. Limpa
  // ao trocar de extração ou alternar a lixeira (não faz sentido carregar entre elas).
  useEffect(() => { setSelectedIds(new Set()); }, [activeExtraction, showExcluded]);

  const allVisibleSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  const toggleSelect = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAllVisible = () =>
    setSelectedIds((s) => (leads.length > 0 && leads.every((l) => s.has(l.id)) ? new Set() : new Set(leads.map((l) => l.id))));

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
    qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, seeds: 0 };
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

  // Portão por-LEAD — ações de aprovação/reabertura.
  const clearSelection = () => setSelectedIds(new Set());
  const approveSelected = () => {
    if (!productId || selectedIds.size === 0) return;
    approveLeads.mutate({ ids: [...selectedIds], approved: true, productId }, { onSuccess: clearSelection });
  };
  const reopenSelected = () => {
    if (!productId || selectedIds.size === 0) return;
    approveLeads.mutate({ ids: [...selectedIds], approved: false, productId }, { onSuccess: clearSelection });
  };
  const approveFiltered = () => {
    if (!productId || !activeExtraction) return;
    approveBulk.mutate({ extractionId: activeExtraction, approved: true, productId, filters: { segment, seedsOnly, qualifiedOnly } });
  };
  const approveWholeBase = () => {
    if (!productId || !activeExtraction) return;
    approveBulk.mutate({ extractionId: activeExtraction, approved: true, productId });
  };
  const reopenWholeBase = () => {
    if (!productId || !activeExtraction) return;
    approveBulk.mutate({ extractionId: activeExtraction, approved: false, productId });
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
            Base de leads do Instagram organizada por <b>fonte</b>. Hoje a maior parte entra por <b>importação</b>
            {' '}(Prospectagram · Server API · Vídeo, rodadas nas sessões) — a busca por palavra-chave é só mais uma fonte.
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
          <p className="text-foreground font-medium">SEGMENTO = posicionamento do lead (quem ele é). Não tem relação com ter ou não WhatsApp.</p>
          <p>🟢 <b>Espaço-cliente:</b> beleza + Brasil. <b>Independe de telefone</b> — sem telefone continua cliente.</p>
          <p>🔵 <b>Afiliado:</b> curso/mentoria de beleza (kiwify/hotmart, "X alunas formadas"). Guardado p/ recrutamento futuro.</p>
          <p>🟡 <b>Revisão:</b> não confirmou beleza e/ou Brasil, ou está fora do mercado — triagem manual. Passe o mouse no segmento pra ver <b>por qual camada</b> caiu.</p>
          <p className="pt-2 text-foreground font-medium">ABAS DE WHATSAPP = como falar com ele. São derivadas, não são listas separadas.</p>
          <p><b>Número</b> = telefone discável (disparo) · <b>Link</b> = só link-código wa.me/message (clica e fala, sem número) · <b>Sem</b> = nada acionável — <b>esta aba É a fila de enriquecimento</b>.</p>
          <p>🗑️ <b>Excluir de vez:</b> apaga a PII do lead e arquiva o @ pra nunca mais voltar num scrap (lixeira LGPD-safe).</p>
          <p>➕ <b>WhatsApp manual:</b> achou o telefone numa imagem do perfil? Preencha na coluna Telefone → vira qualificado e <b>pula pra aba Número sozinho</b> (não precisa mover de lista).</p>
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

      {/* ══ ZONA 1 — FONTE & BUSCA: o que a base REALMENTE tem hoje, por fonte ══ */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground mr-1">Fonte:</span>
          <button
            type="button"
            onClick={() => { setSourceFilter('all'); setSelectedExtractionId(null); }}
            className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
              sourceFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            🗂️ Todas ({extractions.length})
          </button>
          {(Object.keys(SOURCE_META) as LeadSource[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={sourceCounts[s] === 0}
              onClick={() => { setSourceFilter(s); setSelectedExtractionId(null); }}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-40 ${
                sourceFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {SOURCE_META[s].icon} {SOURCE_META[s].label} ({sourceCounts[s]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={activeExtraction ?? ''} onValueChange={setSelectedExtractionId}>
            <SelectTrigger className="w-[340px]"><SelectValue placeholder="Selecione uma busca" /></SelectTrigger>
            <SelectContent>
              {shownExtractions.map((ex) => (
                <SelectItem key={ex.id} value={ex.id}>
                  {SOURCE_META[leadSourceOf(ex)].icon} {(ex.keywords ?? []).slice(0, 3).join(', ')}{(ex.keywords?.length ?? 0) > 3 ? '…' : ''} · {ex.status}{ex.total_found != null ? ` · ${ex.total_found}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {shownExtractions.length} busca(s){sourceFilter !== 'all' ? ` em ${SOURCE_META[sourceFilter].label}` : ''}
          </span>
        </div>

        {/* Motor de keyword-search — EXTRAÍDO p/ componente reusável: a página "Nova
            Importação" monta o MESMO bloco em variant="card". Aqui fica recolhido, porque
            keyword é só mais uma fonte. Sai desta tela só quando a página nova estiver no
            ar E o Marcelo confirmar (senão ele fica sem lugar nenhum p/ disparar). */}
        <KeywordSearchBlock productId={productId} variant="collapsed" />
      </div>

      {/* ══ ZONA 2 — RECORTE: abas de WhatsApp (derivadas) + segmento + toggles ══ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-border overflow-hidden" role="tablist" aria-label="Aba WhatsApp">
          {WA_TABS.map((t) => (
            <button
              key={t.val}
              type="button"
              role="tab"
              aria-selected={waFilter === t.val}
              title={t.hint}
              className={`px-4 py-1.5 text-sm font-medium transition-colors border-r border-border last:border-r-0 ${
                waFilter === t.val ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setWaFilter(t.val)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Select value={segment} onValueChange={(v) => setSegment(v as LeadSegment | 'all')}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os segmentos</SelectItem>
            <SelectItem value="salao_cliente">🟢 Espaço-cliente</SelectItem>
            <SelectItem value="afiliado_infoproduto">🔵 Afiliado</SelectItem>
            <SelectItem value="revisao">🟡 Revisão</SelectItem>
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

      {/* Portão de aprovação Prospecção → Base consolidada. Unidade = o LEAD (não a extração).
          Só leads APROVADOS entram na Base consolidada (após o flip da view). Clean slate: tudo
          começa "em tratamento". Selecione leads (checkboxes) e aprove, ou use o bulk. Oculto na
          lixeira (não se aprova descarte). Aprovar em massa ignora a lixeira. */}
      {!showExcluded && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5 mr-1">
            <DoorOpen className="h-4 w-4 text-primary" /> Portão da Base consolidada
          </span>

          {selectedIds.size > 0 && (
            <>
              <Button size="sm" className="gap-1" disabled={approveLeads.isPending || !productId} onClick={approveSelected}>
                {approveLeads.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar selecionados ({selectedIds.size})
              </Button>
              <Button variant="outline" size="sm" className="gap-1" disabled={approveLeads.isPending || !productId} onClick={reopenSelected}>
                <RotateCcw className="h-4 w-4" /> Reabrir selecionados
              </Button>
              <span className="h-5 w-px bg-border mx-1" />
            </>
          )}

          <Button
            variant="outline" size="sm" className="gap-1"
            disabled={approveBulk.isPending || !productId || !activeExtraction || leads.length === 0}
            title="Aprova todos os leads que batem os filtros atuais (exceto lixeira)"
            onClick={approveFiltered}
          >
            <BadgeCheck className="h-4 w-4" /> Aprovar todos os filtrados
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1"
            disabled={approveBulk.isPending || !productId || !activeExtraction}
            title="Aprova a base inteira desta extração (exceto lixeira)"
            onClick={approveWholeBase}
          >
            <Check className="h-4 w-4" /> Aprovar base inteira
          </Button>
          <Button
            variant="ghost" size="sm" className="gap-1 text-muted-foreground"
            disabled={approveBulk.isPending || !productId || !activeExtraction}
            title="Reabre todos os leads desta extração (voltam a 'em tratamento')"
            onClick={reopenWholeBase}
          >
            <RotateCcw className="h-4 w-4" /> Reabrir base
          </Button>

          <span className="text-xs text-muted-foreground ml-auto">
            {approvalCounts ? `${approvalCounts.aprovados} aprovados · ${approvalCounts.emTratamento} em tratamento` : '…'} · só os aprovados entram na Base consolidada
          </span>
        </div>
      )}

      {showExcluded && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          🗑️ <b>Lixeira</b> — perfis excluídos de vez. A PII foi apagada; o @ fica arquivado pra não voltar em buscas. Você pode restaurar (a PII não volta, mas o perfil reaparece nas buscas).
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={SEG_META.salao_cliente.cls}>🟢 {counts.salao_cliente} salão</Badge>
        <Badge variant="outline" className={SEG_META.afiliado_infoproduto.cls}>🔵 {counts.afiliado_infoproduto} afiliado</Badge>
        <Badge variant="outline" className={SEG_META.revisao.cls}>🟡 {counts.revisao} revisão</Badge>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">🌱 {counts.seeds} sementes</Badge>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="w-8 p-2 text-center">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os visíveis"
                    className="align-middle"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={showExcluded || leads.length === 0}
                  />
                </th>
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
              {leadsLoading && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!leadsLoading && leads.length === 0 && (
                <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">{showExcluded ? 'Lixeira vazia.' : activeExtraction ? 'Nenhum lead com esses filtros.' : 'Dispare uma busca acima para começar.'}</td></tr>
              )}
              {leads.map((l) => (
                <tr key={l.id} className={`border-t border-border hover:bg-muted/30 ${l.approved_at ? 'bg-green-500/[0.06]' : ''}`}>
                  <td className="p-2 text-center align-top">
                    <div className="flex flex-col items-center gap-0.5 pt-0.5">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar @${l.handle ?? ''}`}
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelect(l.id)}
                        disabled={showExcluded}
                      />
                      {l.approved_at && (
                        <span title="Aprovado — entra na Base consolidada" className="text-[11px] leading-none text-green-600">✓</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2" title={whyText(l)}>
                    <div className="flex items-center gap-1">
                      <select
                        className={`text-xs rounded border px-1 py-0.5 bg-transparent ${l.segment ? SEG_META[l.segment]?.cls ?? '' : ''}`}
                        value={l.segment ?? 'revisao'}
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
