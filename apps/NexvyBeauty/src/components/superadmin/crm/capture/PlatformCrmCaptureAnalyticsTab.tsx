import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  Eye,
  CheckCircle2,
  TrendingUp,
  Flame,
  Tag as TagIcon,
  Activity,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  usePlatformCrmFunnelLeads,
  usePlatformCrmAllFunnelAnalytics,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureInsights';
import { usePlatformCrmCaptureFunnels } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — ANALYTICS de captação (porte 1:1 do
 * `CaptureAnalyticsSection` do CRM original), desacoplado do tenant.
 *
 * Fontes: `platform_crm_capture_funnels` (total_views), `platform_crm_leads`
 * (lead_origin='funnel': temperatura, score/tags via metadata, série diária) e
 * `platform_crm_funnel_analytics` (conversão por canal).
 *
 * Adaptações vs original:
 * - `leads` do tenant (organization_id) → `platform_crm_leads` global.
 * - Seletor de funil abrange TODOS os canais de captação (o original era quiz-only).
 * - Card extra "Conversão por canal" agregando `platform_crm_funnel_analytics`
 *   (tabela que só existe no schema platform — atende "conversão por funil/form/canal").
 */

const PERIODS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

const TIER_COLORS: Record<string, string> = {
  hot: '#ef4444',
  warm: '#f97316',
  cold: '#0ea5e9',
};

const CHANNEL_LABELS: Record<string, string> = {
  chat: 'Chat',
  chatbot: 'ChatBot',
  quiz: 'Quiz',
  widget: 'Widget',
  form: 'Formulário',
  whatsapp: 'WhatsApp',
};

export function PlatformCrmCaptureAnalyticsTab() {
  const [days, setDays] = useState('30');
  const [funnelId, setFunnelId] = useState('all');

  const { data: funnels } = usePlatformCrmCaptureFunnels();
  const { data: leads, isLoading } = usePlatformCrmFunnelLeads({
    days: Number(days),
    limit: 2000,
  });
  const { data: channelRows } = usePlatformCrmAllFunnelAnalytics(Number(days));

  const rows = useMemo(() => {
    let list = leads ?? [];
    if (funnelId !== 'all') {
      list = list.filter(
        (l) => ((l.metadata as Record<string, unknown> | null) ?? {}).funnel_id === funnelId,
      );
    }
    return list;
  }, [leads, funnelId]);

  const totalViews = useMemo(() => {
    const fs = funnels ?? [];
    const list = funnelId === 'all' ? fs : fs.filter((f) => f.id === funnelId);
    return list.reduce((s, f) => s + (f.total_views ?? 0), 0);
  }, [funnels, funnelId]);

  const stats = useMemo(() => {
    const total = rows.length;
    const tempCount = { hot: 0, warm: 0, cold: 0 };
    const scores: number[] = [];
    const tagCount: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};

    rows.forEach((l) => {
      const m = ((l.metadata as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
      if (l.temperature && l.temperature in tempCount) {
        tempCount[l.temperature as keyof typeof tempCount]++;
      }
      if (typeof m.score === 'number') scores.push(m.score);
      ((m.tags as string[]) ?? []).forEach((t) => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
      const day = String(l.created_at).slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });

    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    const conversionRate = totalViews > 0 ? (total / totalViews) * 100 : 0;

    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const scoreDist = [
      { range: '0-20', count: scores.filter((s) => s <= 20).length },
      { range: '21-40', count: scores.filter((s) => s > 20 && s <= 40).length },
      { range: '41-60', count: scores.filter((s) => s > 40 && s <= 60).length },
      { range: '61-80', count: scores.filter((s) => s > 60 && s <= 80).length },
      { range: '81+', count: scores.filter((s) => s > 80).length },
    ];

    const temperatureData = [
      { name: 'Quente', value: tempCount.hot, color: TIER_COLORS.hot },
      { name: 'Morno', value: tempCount.warm, color: TIER_COLORS.warm },
      { name: 'Frio', value: tempCount.cold, color: TIER_COLORS.cold },
    ].filter((d) => d.value > 0);

    const daily = Object.entries(dailyMap)
      .sort()
      .map(([date, count]) => ({ date: date.slice(5), count }));

    return { total, avgScore, conversionRate, topTags, scoreDist, temperatureData, daily };
  }, [rows, totalViews]);

  /** Conversão por canal, agregada de platform_crm_funnel_analytics (janela do período). */
  const channelStats = useMemo(() => {
    const agg: Record<string, { views: number; leads: number }> = {};
    (channelRows ?? [])
      .filter((r) => funnelId === 'all' || r.funnel_id === funnelId)
      .forEach((r) => {
        const cur = (agg[r.channel] ??= { views: 0, leads: 0 });
        cur.views += r.views ?? 0;
        cur.leads += r.leads_created ?? 0;
      });
    return Object.entries(agg)
      .map(([channel, v]) => ({
        channel: CHANNEL_LABELS[channel] ?? channel,
        views: v.views,
        leads: v.leads,
        rate: v.views > 0 ? (v.leads / v.views) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [channelRows, funnelId]);

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Analytics de Captação</h1>
            <p className="text-sm text-muted-foreground">
              Performance dos funis de captação da plataforma em tempo real.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Select value={funnelId} onValueChange={setFunnelId}>
            <SelectTrigger className="w-56">
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
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI
              icon={<Eye className="h-4 w-4" />}
              label="Visualizações"
              value={totalViews}
              color="text-primary"
            />
            <KPI
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Conclusões"
              value={stats.total}
              color="text-primary"
            />
            <KPI
              icon={<TrendingUp className="h-4 w-4" />}
              label="Conversão"
              value={`${stats.conversionRate.toFixed(1)}%`}
              color="text-primary"
            />
            <KPI
              icon={<Activity className="h-4 w-4" />}
              label="Score médio"
              value={stats.avgScore}
              color="text-primary"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Conclusões por dia</CardTitle>
                <CardDescription>Tendência diária de leads gerados.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.daily.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={stats.daily}>
                      <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" /> Temperatura
                </CardTitle>
                <CardDescription>Qualificação automática dos leads.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.temperatureData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={stats.temperatureData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {stats.temperatureData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="flex justify-center gap-3 mt-2 text-xs flex-wrap">
                  {stats.temperatureData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">
                        {d.name}: {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição de Score</CardTitle>
                <CardDescription>Como seus leads se distribuem por faixa.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.scoreDist.every((s) => s.count === 0) ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.scoreDist}>
                      <XAxis
                        dataKey="range"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TagIcon className="h-4 w-4 text-primary" /> Top tags dinâmicas
                </CardTitle>
                <CardDescription>Tags mais aplicadas pelas respostas.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topTags.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-2">
                    {stats.topTags.map((t) => {
                      const pct = (t.count / stats.topTags[0].count) * 100;
                      return (
                        <div key={t.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{t.name}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {t.count}
                            </Badge>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Conversão por canal (platform_crm_funnel_analytics) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Conversão por canal
              </CardTitle>
              <CardDescription>
                Visualizações e leads por canal no período (fonte: analytics diários dos funis).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {channelStats.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {channelStats.map((c) => (
                    <div key={c.channel} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.channel}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.rate.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.views} visualizações · {c.leads} leads
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(c.rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className={`h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center ${color}`}>
            {icon}
          </div>
        </div>
        <div className="text-2xl font-bold tabular-nums mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      Sem dados no período selecionado.
    </div>
  );
}
