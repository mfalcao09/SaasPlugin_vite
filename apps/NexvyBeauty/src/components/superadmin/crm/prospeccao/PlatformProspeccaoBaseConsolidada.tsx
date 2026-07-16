import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Layers, Download, Loader2, Sprout, BadgeCheck, ExternalLink, RefreshCw,
  Trash2, RotateCcw, Plus, Check, X, Phone, PhoneOff, Users2, DoorOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformLeadExtractions,
  usePlatformConsolidatedLeads,
  useReclassifyLeadByHandle,
  useSetLeadPhoneByHandle,
  useExcludeLeadByHandle,
  useRestoreLeadByHandle,
  type LeadSegment,
} from '@/components/superadmin/crm/data/usePlatformProspeccao';
import { SEG_META, SEG_KEYS, fmtNum, whyText, toCsv } from './_shared';

/**
 * BASE CONSOLIDADA (Prospecção Ativa) — a base ÚNICA de leads.
 *
 * Une TODAS as extrações numa lista dedup-por-@handle (a view
 * `platform_crm_consolidated_leads` faz o merge por COALESCE; nada se descarta —
 * campos se somam, e a linha com override/telefone vence o conflito). As ações
 * (reclassificar, WhatsApp manual, excluir/restaurar) são GLOBAIS: agem por handle
 * em TODAS as origens. As extrações originais ficam intactas na tela "Buscas".
 */
export function PlatformProspeccaoBaseConsolidada() {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;

  const [extractionId, setExtractionId] = useState<string | 'all'>('all');
  const [segment, setSegment] = useState<LeadSegment | 'all'>('all');
  const [withPhone, setWithPhone] = useState<'all' | 'with' | 'without'>('all');
  const [seedsOnly, setSeedsOnly] = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [editingPhone, setEditingPhone] = useState<{ handle: string; value: string } | null>(null);

  const { data: extractions = [] } = usePlatformLeadExtractions(productId);
  const { data: leads = [], isLoading } = usePlatformConsolidatedLeads(productId, {
    extractionId, segment, withPhone, seedsOnly, qualifiedOnly, excludedOnly: showExcluded,
  });

  const reclassify = useReclassifyLeadByHandle();
  const setPhone = useSetLeadPhoneByHandle();
  const exclude = useExcludeLeadByHandle();
  const restore = useRestoreLeadByHandle();
  const qc = useQueryClient();

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
    qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
  };

  const stats = useMemo(() => {
    const c: Record<string, number> = {
      salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, descarte: 0, acionamento_via_instagram: 0,
      seeds: 0, comTelefone: 0, origensSomadas: 0,
    };
    for (const l of leads) {
      if (l.segment) c[l.segment] = (c[l.segment] ?? 0) + 1;
      if (l.is_seed) c.seeds++;
      if (l.telefone) c.comTelefone++;
      c.origensSomadas += l.origin_count ?? 1;
    }
    return c;
  }, [leads]);

  const savePhone = () => {
    if (!editingPhone || !editingPhone.value.trim() || !productId) return;
    setPhone.mutate(
      { productId, handle: editingPhone.handle, telefone: editingPhone.value },
      { onSuccess: () => setEditingPhone(null) },
    );
  };

  const handleExport = () => {
    const qualified = leads.filter((l) => l.qualified);
    const blob = new Blob([toCsv(qualified)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prospeccao-base-consolidada-qualificados.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" /> Base consolidada
          </h1>
          <p className="text-muted-foreground mt-1">
            Uma linha por @handle — dedup + merge de todas as extrações (telefone/e-mail/categoria de quem tiver).
            As ações aqui são globais: valem para o handle em <b>todas</b> as origens. As extrações ficam intactas na aba Buscas.
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <DoorOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            Mostra apenas <b>bases aprovadas</b>: aprove a extração na aba <b>Buscas</b> (Portão da Base consolidada) para os leads dela aparecerem aqui.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={leads.length === 0}>
            <Download className="h-4 w-4" /> Exportar qualificados (CSV)
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={extractionId} onValueChange={(v) => setExtractionId(v as string | 'all')}>
          <SelectTrigger className="w-[280px]"><SelectValue placeholder="Origem (extração)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
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

        <Button variant={withPhone === 'with' ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setWithPhone((v) => (v === 'with' ? 'all' : 'with'))}>
          <Phone className="h-4 w-4" /> Com telefone
        </Button>
        <Button variant={withPhone === 'without' ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setWithPhone((v) => (v === 'without' ? 'all' : 'without'))}>
          <PhoneOff className="h-4 w-4" /> Sem telefone
        </Button>
        <Button variant={seedsOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setSeedsOnly((v) => !v)}><Sprout className="h-4 w-4" /> Sementes</Button>
        <Button variant={qualifiedOnly ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setQualifiedOnly((v) => !v)}><BadgeCheck className="h-4 w-4" /> Qualificados</Button>
        <Button variant={showExcluded ? 'destructive' : 'outline'} size="sm" className="gap-1" onClick={() => setShowExcluded((v) => !v)}><Trash2 className="h-4 w-4" /> Lixeira</Button>
      </div>

      {showExcluded && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          🗑️ <b>Lixeira</b> — handles excluídos de vez (em qualquer origem). A PII foi apagada e o @ arquivado. Restaurar reexibe o perfil nas buscas (a PII não volta).
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="bg-muted text-foreground border-border"><Users2 className="h-3 w-3 mr-1" /> {leads.length} handles · {stats.origensSomadas} origens somadas</Badge>
        <Badge variant="outline" className={SEG_META.salao_cliente.cls}>🟢 {stats.salao_cliente} salão</Badge>
        <Badge variant="outline" className={SEG_META.acionamento_via_instagram.cls}>🟣 {stats.acionamento_via_instagram} DM</Badge>
        <Badge variant="outline" className={SEG_META.afiliado_infoproduto.cls}>🔵 {stats.afiliado_infoproduto} afiliado</Badge>
        <Badge variant="outline" className={SEG_META.revisao.cls}>🟡 {stats.revisao} revisão</Badge>
        <Badge variant="outline" className={SEG_META.descarte.cls}>⚪ {stats.descarte} descarte</Badge>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">🌱 {stats.seeds} sementes</Badge>
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">📞 {stats.comTelefone} c/ telefone</Badge>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Segmento (clique p/ mudar — global)</th>
                <th className="text-left p-2 font-medium">Perfil</th>
                <th className="text-center p-2 font-medium">Origens</th>
                <th className="text-right p-2 font-medium">Seguidores</th>
                <th className="text-left p-2 font-medium">Telefone</th>
                <th className="text-left p-2 font-medium">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!isLoading && leads.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{showExcluded ? 'Lixeira vazia.' : 'Nenhum handle com esses filtros. As extrações da aba Buscas alimentam esta base.'}</td></tr>
              )}
              {leads.map((l) => (
                <tr key={l.handle_key} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2" title={whyText(l)}>
                    <div className="flex items-center gap-1">
                      <select
                        className={`text-xs rounded border px-1 py-0.5 bg-transparent ${l.segment ? SEG_META[l.segment]?.cls ?? '' : ''}`}
                        value={l.segment ?? 'descarte'}
                        onChange={(e) => productId && reclassify.mutate({ productId, handle: l.handle_key, segment: e.target.value as LeadSegment })}
                        disabled={showExcluded}
                      >
                        {SEG_KEYS.map((k) => <option key={k} value={k}>{SEG_META[k].dot} {SEG_META[k].label}</option>)}
                      </select>
                      <button
                        title={l.is_seed ? 'Desmarcar semente (global)' : 'Marcar semente (global)'}
                        className={`text-sm ${l.is_seed ? '' : 'opacity-30'}`}
                        onClick={() => productId && reclassify.mutate({ productId, handle: l.handle_key, is_seed: !l.is_seed })}
                      >🌱</button>
                      {showExcluded ? (
                        <button
                          title="Restaurar da lixeira (global)"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => productId && restore.mutate({ productId, handle: l.handle_key })}
                        ><RotateCcw className="h-3.5 w-3.5" /></button>
                      ) : (
                        <button
                          title="Excluir de vez (apaga PII + arquiva, em todas as origens)"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => productId && exclude.mutate({ productId, handle: l.handle_key })}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <a href={l.instagram_url ?? `https://instagram.com/${l.handle}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">@{l.handle} <ExternalLink className="h-3 w-3" /></a>
                    {l.name && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{l.name}</div>}
                  </td>
                  <td className="p-2 text-center">
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] rounded-full bg-muted px-1.5 text-xs tabular-nums" title={`Aparece em ${l.origin_count ?? 1} extração(ões)`}>
                      {l.origin_count ?? 1}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(l.seguidores)}</td>
                  <td className="p-2">
                    {l.whatsapp_link ? (
                      <a href={l.whatsapp_link} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">WhatsApp</a>
                    ) : l.telefone ? (
                      l.telefone
                    ) : editingPhone?.handle === l.handle_key ? (
                      <span className="inline-flex items-center gap-1">
                        <Input
                          autoFocus
                          className="h-7 w-32 text-xs"
                          placeholder="(11) 91234-5678"
                          value={editingPhone.value}
                          onChange={(e) => setEditingPhone({ handle: l.handle_key, value: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(null); }}
                        />
                        <button title="Salvar" className="text-green-600" onClick={savePhone} disabled={setPhone.isPending}><Check className="h-3.5 w-3.5" /></button>
                        <button title="Cancelar" className="text-muted-foreground" onClick={() => setEditingPhone(null)}><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ) : showExcluded ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <button className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline" title="Preencher WhatsApp manualmente → vira qualificado (global)" onClick={() => setEditingPhone({ handle: l.handle_key, value: '' })}>
                        <Plus className="h-3 w-3" /> WhatsApp
                      </button>
                    )}
                  </td>
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

export default PlatformProspeccaoBaseConsolidada;
