import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Campaign } from '../data/usePlatformCrmCampaigns';

/**
 * Relatórios de campanhas (super_admin) — porte 1:1 do `CampaignReports` de
 * tenant, tocando `platform_crm_campaign_targets`, `platform_crm_agent_configs`
 * e `platform_crm_campaign_contexts`. Sem organization_id (RLS isola).
 *
 * TODO(migration): o CRM de tenant tem um breakdown "Por Número" que depende de
 * `evolution_instances` (instâncias WhatsApp), tabela cross-módulo inexistente
 * no schema de plataforma. Removido aqui; mantidos os breakdowns Por Agente e
 * Por Contexto.
 */

type Row = {
  campaign_id: string;
  status: string;
  context_id: string | null;
};

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

export function CampaignReports({ campaigns }: { campaigns: Campaign[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [contexts, setContexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [t, a, c] = await Promise.all([
        supabase.from('platform_crm_campaign_targets')
          .select('campaign_id, status, context_id')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('platform_crm_agent_configs').select('id, name'),
        supabase.from('platform_crm_campaign_contexts').select('id, name'),
      ]);
      setRows((t.data as Row[]) ?? []);
      setAgents(Object.fromEntries(((a.data as any[]) ?? []).map((x) => [x.id, x.name])));
      setContexts(Object.fromEntries(((c.data as any[]) ?? []).map((x) => [x.id, x.name])));
      setLoading(false);
    })();
  }, [campaigns.length]);

  const summary = useMemo(() => {
    const sent = rows.filter((r) => ['sent', 'responded'].includes(r.status)).length;
    const responded = rows.filter((r) => r.status === 'responded').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const queued = rows.filter((r) => r.status === 'queued' || r.status === 'sending').length;
    return { sent, responded, failed, queued };
  }, [rows]);

  const byAgent = useMemo(() => {
    const map = new Map<string, { sent: number; responded: number }>();
    for (const c of campaigns) {
      if (!c.agent_id) continue;
      const targets = rows.filter((r) => r.campaign_id === c.id);
      const sent = targets.filter((t) => ['sent', 'responded'].includes(t.status)).length;
      const responded = targets.filter((t) => t.status === 'responded').length;
      const cur = map.get(c.agent_id) ?? { sent: 0, responded: 0 };
      cur.sent += sent; cur.responded += responded;
      map.set(c.agent_id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, name: agents[id] ?? '—', ...v }))
      .sort((a, b) => b.sent - a.sent);
  }, [rows, campaigns, agents]);

  const byContext = useMemo(() => {
    const map = new Map<string, { sent: number; responded: number }>();
    for (const r of rows) {
      if (!r.context_id) continue;
      const cur = map.get(r.context_id) ?? { sent: 0, responded: 0 };
      if (['sent', 'responded'].includes(r.status)) cur.sent++;
      if (r.status === 'responded') cur.responded++;
      map.set(r.context_id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, name: contexts[id] ?? '—', ...v }))
      .sort((a, b) => b.sent - a.sent);
  }, [rows, contexts]);

  const active = campaigns.filter((c) => c.status === 'active').length;
  const completed = campaigns.filter((c) => c.status === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Campanhas ativas" value={active} />
        <KPI label="Finalizadas" value={completed} />
        <KPI label="Mensagens enviadas" value={summary.sent} />
        <KPI label="Respostas recebidas" value={summary.responded} accent />
        <KPI label="Taxa de resposta" value={pct(summary.responded, summary.sent)} accent />
      </div>

      {loading ? (
        <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-3 text-muted-foreground text-sm">
            <BarChart3 className="h-8 w-8" />
            Nenhum dado ainda. Dispare uma campanha para popular os relatórios.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          <BreakdownCard title="Por Agente" rows={byAgent} />
          <BreakdownCard title="Por Contexto" rows={byContext} />
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${accent ? 'text-primary' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; name: string; sent: number; responded: number }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {!rows.length && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        {rows.slice(0, 8).map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-1 border-b last:border-0">
            <span className="flex-1 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.sent}</span>
            <span className="text-xs font-medium text-primary w-10 text-right">{pct(r.responded, r.sent)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
