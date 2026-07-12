import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Snowflake, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

/**
 * CRM de PLATAFORMA (super_admin) — Throughput de campanhas. Porte do
 * `CampaignThroughputPanel` de tenant, product-scoped e sem organization_id.
 *
 * Diferenças do original (schema de plataforma):
 *   - As views `v_campaign_throughput` / `v_provider_health` (org-scoped) não
 *     existem aqui. As séries são agregadas no cliente a partir das tabelas base:
 *     `platform_crm_campaign_targets` (throughput) e
 *     `platform_crm_evolution_instances` / `platform_crm_whatsapp_meta_connections`
 *     (cooldown de provedores).
 *   - Escopo por PRODUTO via `effectiveProductId` (migration 20260710 adicionou
 *     `product_id` às conexões; `campaign_targets` herda o produto da campanha).
 *     product_id NULL = grupo todo (aparece em qualquer produto), espelhando a
 *     visibilidade de campanhas do manager.
 *   - "Top 10 empresas" (org_id) não existe product-scoped → substituída por
 *     "Top 10 campanhas" (agrupando por `campaign_id`), mesma UI.
 *
 * Acesso defensivo a `product_id` (`as any`): a coluna existe em prod mas o
 * `types.ts` gerado ainda não foi regenerado.
 */

type TargetRow = {
  campaign_id: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};

type ProviderHealthRow = {
  provider: 'evolution' | 'meta_whatsapp';
  connection_id: string;
  connection_name: string;
  cooldown_until: string;
  last_failure_reason: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  sent: 'Enviadas',
  responded: 'Responderam',
  failed: 'Falhas',
  skipped: 'Puladas',
  queued: 'Na fila',
  sending: 'Enviando',
  cancelled: 'Canceladas',
};

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-emerald-500',
  responded: 'bg-teal-500',
  failed: 'bg-red-500',
  skipped: 'bg-amber-500',
  queued: 'bg-slate-400',
  sending: 'bg-sky-500',
  cancelled: 'bg-zinc-400',
};

export function PlatformCrmCampaignThroughputPanel() {
  const { effectiveProductId } = useActivePlatformProduct();
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [health, setHealth] = useState<ProviderHealthRow[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();

    // 1) Campanhas visíveis para o produto (mesma regra do manager: product_id
    //    NULL = grupo todo). Fornece nomes p/ "Top 10 campanhas" e escopa targets.
    const { data: campData, error: campErr } = await supabase
      .from('platform_crm_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (campErr) toast.error('Falha ao carregar campanhas: ' + campErr.message);
    const campaigns = ((campData ?? []) as any[]).filter(
      (c) => !c.product_id || c.product_id === effectiveProductId,
    );
    const nameMap: Record<string, string> = {};
    campaigns.forEach((c) => { nameMap[c.id] = c.name; });
    setCampaignNames(nameMap);
    const campaignIds = campaigns.map((c) => c.id);

    // 2) Targets das campanhas do produto (throughput + top campanhas).
    // 3) Provedores em cooldown agora, filtrados por produto (client-side, pois
    //    product_id ainda não está no types.ts gerado).
    const [tp, evo, meta] = await Promise.all([
      campaignIds.length
        ? supabase
            .from('platform_crm_campaign_targets')
            .select('campaign_id, status, sent_at, created_at')
            .in('campaign_id', campaignIds)
        : Promise.resolve({ data: [], error: null } as any),
      supabase
        .from('platform_crm_evolution_instances')
        .select('*')
        .gt('cooldown_until', nowIso),
      supabase
        .from('platform_crm_whatsapp_meta_connections')
        .select('*')
        .gt('cooldown_until', nowIso),
    ]);

    if (tp.error) toast.error('Falha ao carregar throughput: ' + tp.error.message);
    if (evo.error) toast.error('Falha ao carregar instâncias: ' + evo.error.message);
    if (meta.error) toast.error('Falha ao carregar conexões Meta: ' + meta.error.message);

    setRows(((tp.data ?? []) as unknown) as TargetRow[]);

    const inProduct = (row: any) => !row.product_id || row.product_id === effectiveProductId;
    const evoHealth: ProviderHealthRow[] = ((evo.data ?? []) as any[])
      .filter(inProduct)
      .map((r) => ({
        provider: 'evolution',
        connection_id: r.id,
        connection_name: r.name,
        cooldown_until: r.cooldown_until,
        last_failure_reason: r.last_failure_reason ?? null,
      }));
    const metaHealth: ProviderHealthRow[] = ((meta.data ?? []) as any[])
      .filter(inProduct)
      .map((r) => ({
        provider: 'meta_whatsapp',
        connection_id: r.id,
        connection_name: r.display_name,
        cooldown_until: r.cooldown_until,
        last_failure_reason: r.last_failure_reason ?? null,
      }));
    setHealth([...evoHealth, ...metaHealth]);

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveProductId]);

  // Janela de 24h. Cada target é bucketizado por sent_at (quando enviado) ou
  // created_at (fila/falha/pulado) — mesma leitura "atividade nas últimas 24h".
  const since24h = Date.now() - 24 * 3600 * 1000;
  const bucketTime = (r: TargetRow) => new Date(r.sent_at ?? r.created_at).getTime();
  const recent = useMemo(() => rows.filter((r) => bucketTime(r) >= since24h), [rows, since24h]);

  // Totais empilhados por hora.
  const hours = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of recent) {
      const d = new Date(bucketTime(r));
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      map[key] ??= {};
      map[key][r.status] = (map[key][r.status] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, statuses]) => ({ hour, statuses, total: Object.values(statuses).reduce((s, n) => s + n, 0) }));
  }, [recent]);

  const maxHourTotal = Math.max(1, ...hours.map((h) => h.total));

  // Top 10 campanhas nas últimas 24h.
  const topCampaigns = useMemo(() => {
    const map: Record<string, { sent: number; failed: number; skipped: number; total: number }> = {};
    for (const r of recent) {
      map[r.campaign_id] ??= { sent: 0, failed: 0, skipped: 0, total: 0 };
      map[r.campaign_id].total += 1;
      if (r.status === 'sent') map[r.campaign_id].sent += 1;
      else if (r.status === 'failed') map[r.campaign_id].failed += 1;
      else if (r.status === 'skipped') map[r.campaign_id].skipped += 1;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10);
  }, [recent]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Throughput de campanhas</h2>
          <p className="text-sm text-muted-foreground">Volume agregado das últimas 24h. Dados atualizam a cada refresh.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mensagens por hora (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {hours.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem atividade nas últimas 24h.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {hours.map(({ hour, statuses, total }) => {
                const heightPct = (total / maxHourTotal) * 100;
                const label = new Date(hour).toLocaleTimeString('pt-BR', { hour: '2-digit' });
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center gap-1" title={`${label}h — ${total} mensagens`}>
                    <div className="w-full flex flex-col-reverse" style={{ height: `${heightPct}%`, minHeight: total ? 4 : 0 }}>
                      {Object.entries(statuses).map(([st, n]) => {
                        const pct = (n / total) * 100;
                        return <div key={st} className={STATUS_COLOR[st] || 'bg-zinc-400'} style={{ height: `${pct}%` }} />;
                      })}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded ${STATUS_COLOR[k]}`} />
                <span className="text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top 10 campanhas (24h)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-3">Campanha</th>
                <th className="text-right p-3">Enviadas</th>
                <th className="text-right p-3">Falhas</th>
                <th className="text-right p-3">Puladas</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem dados.</td></tr>
              ) : topCampaigns.map(([campaignId, m]) => (
                <tr key={campaignId} className="border-b last:border-0">
                  <td className="p-3 truncate max-w-[300px]">{campaignNames[campaignId] || campaignId.slice(0, 8)}</td>
                  <td className="p-3 text-right">{m.sent}</td>
                  <td className="p-3 text-right">{m.failed > 0 ? <span className="text-red-600">{m.failed}</span> : m.failed}</td>
                  <td className="p-3 text-right">{m.skipped}</td>
                  <td className="p-3 text-right font-medium">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Snowflake className="h-4 w-4" />
            Provedores em cooldown agora
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhuma conexão em cooldown.</p>
          ) : (
            <div className="space-y-2">
              {health.map((h) => {
                const until = new Date(h.cooldown_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={`${h.provider}-${h.connection_id}`} className="flex items-center justify-between gap-2 p-3 rounded-md border">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{h.provider === 'evolution' ? 'Evolution' : 'API Oficial'}</Badge>
                        <span className="font-medium truncate">{h.connection_name}</span>
                      </div>
                      {h.last_failure_reason && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{h.last_failure_reason}</p>
                      )}
                    </div>
                    <Badge variant="destructive">até {until}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
