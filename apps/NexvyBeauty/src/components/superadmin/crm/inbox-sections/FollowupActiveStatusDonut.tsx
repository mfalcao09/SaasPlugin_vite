import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

/**
 * Donut "Status das réguas ativas" da seção Follow-Up (família F3). Restyle de
 * FORMA sobre o porte 1:1 do CRM Vendus: contrato intacto; cores das fatias
 * agora por TOKEN semântico (§1.3/§1.2 — proibido hsl() de marca hardcoded).
 * As fatias codificam SIGNIFICADO de status: aguardando=success (verde),
 * aguardando-resposta=primary (azul institucional), pausa=warning (âmbar),
 * outros=muted-foreground.
 */

interface Props {
  data?: { waiting_next: number; waiting_reply: number; paused: number; others: number };
}

// Sempre via token — o hue troca sozinho com o tema (azul no gestao, rosa no app).
const COLORS = [
  'hsl(var(--success))',
  'hsl(var(--primary))',
  'hsl(var(--warning))',
  'hsl(var(--muted-foreground))',
];

export function FollowupActiveStatusDonut({ data }: Props) {
  const slices = [
    { name: 'Aguardando próxima tentativa', value: data?.waiting_next ?? 0 },
    { name: 'Aguardando resposta', value: data?.waiting_reply ?? 0 },
    { name: 'Em pausa', value: data?.paused ?? 0 },
    { name: 'Outros', value: data?.others ?? 0 },
  ];
  const total = slices.reduce((a, b) => a + b.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Status das réguas ativas</CardTitle>
      </CardHeader>
      <CardContent className="h-[260px]">
        <div className="flex items-center h-full gap-4">
          <div className="relative h-full flex-shrink-0" style={{ width: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {slices.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-2xl font-bold tabular-nums">{total}</div>
              <div className="text-[10px] text-muted-foreground">Leads</div>
            </div>
          </div>
          <div className="flex-1 space-y-2 text-xs">
            {slices.map((s, i) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <div key={s.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                    <span className="truncate text-muted-foreground">{s.name}</span>
                  </div>
                  <div className="font-medium whitespace-nowrap">
                    {s.value} <span className="text-muted-foreground">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
