import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LineChart } from 'lucide-react';

/**
 * Gráfico "Follow-ups enviados" (últimos 7 dias) da seção Follow-Up na anatomia
 * LUX. Restyle de FORMA sobre o porte 1:1 do CRM Vendus: contrato intacto; casca
 * `.surface-card` (não mais shadcn Card), série em `hsl(var(--chart-1))` (navy no
 * tema lux — SEMPRE por token de chart, §L2), tipografia §1.4 e estado vazio
 * anatômico (§3.1).
 */

interface Props {
  data: Array<{ day: string; count: number }>;
}

export function FollowupSentTrend({ data }: Props) {
  const chartData = data.map((d) => ({
    name: format(parseISO(d.day), "dd/MM\nEEE", { locale: ptBR }),
    value: d.count,
  }));
  const hasVolume = chartData.some((d) => d.value > 0);
  return (
    <div className="surface-card p-5">
      <div className="pb-2">
        <h3 className="text-sm font-semibold">Follow-ups enviados</h3>
        <p className="text-[11px] text-muted-foreground">Últimos 7 dias</p>
      </div>
      <div className="h-[260px]">
        {chartData.length === 0 || !hasVolume ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <LineChart className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="mt-2 text-xs text-muted-foreground">Nenhum envio nos últimos 7 dias</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="platform-ftrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#platform-ftrend)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
