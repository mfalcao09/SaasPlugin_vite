import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

/**
 * Donut "Status das réguas ativas" da seção Follow-Up na anatomia LUX. Restyle
 * de FORMA sobre o porte 1:1 do CRM Vendus: contrato intacto; casca
 * `.surface-card`; fatias SEMPRE por token de chart (`--chart-1..4` = navy / gold
 * / bronze / warm no tema lux — §L2). A ordem preserva a leitura do status
 * (aguardando · aguardando-resposta · pausa · outros).
 */

interface Props {
  data?: { waiting_next: number; waiting_reply: number; paused: number; others: number };
}

// Sempre via token de chart — o hue troca sozinho com o tema (lux: navy/gold/bronze/warm).
const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
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
    <div className="surface-card p-5">
      {/* Header simétrico aos cards irmãos (título + subtítulo de 1 linha): mesma
          altura de cabeçalho → rodapé dos 3 cards alinha na linha do grid. */}
      <div className="pb-2">
        <h3 className="text-sm font-semibold">Status das réguas ativas</h3>
        <p className="text-[11px] text-muted-foreground">Distribuição dos leads em régua</p>
      </div>
      {/* Layout EMPILHADO (fix Marcelo 07-12 v3): o card é estreito (~360px) — donut
          + legenda LADO A LADO estouravam a legenda na horizontal (o "0%" cortava na
          borda direita). Donut em cima, legenda em largura TOTAL embaixo → nomes
          longos cabem inteiros, sem corte. */}
      <div className="h-[260px] flex flex-col items-center justify-center gap-3">
        <div className="relative flex-shrink-0" style={{ width: 150, height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* Trilho sempre visível: garante o anel mesmo com total 0. */}
              <Pie
                data={[{ value: 1 }]}
                dataKey="value"
                innerRadius={50}
                outerRadius={72}
                fill="hsl(var(--muted))"
                stroke="none"
                isAnimationActive={false}
              />
              {total > 0 && (
                <Pie data={slices} dataKey="value" innerRadius={50} outerRadius={72} paddingAngle={2}>
                  {slices.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold tabular-nums leading-none">{total}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Leads</span>
          </div>
        </div>
        {/* Legenda em largura TOTAL (dot · nome · valor · %) — sem estouro horizontal. */}
        <ul className="w-full space-y-1.5 text-xs">
          {slices.map((s, i) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <li key={s.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
                <span className="shrink-0 font-medium tabular-nums">{s.value}</span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
