import { demoDashboardStats, demoFinanceiro, demoEquipe } from "@/data/demoData";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#1B3A5C", "#2A5280", "#3B6BA5", "#6B8DB5", "#A8BDD4"];

export default function DemoRelatorios() {
  const s = demoDashboardStats;
  const f = demoFinanceiro;

  return (
    <div className="p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Relatórios</h1>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Desempenho operacional — Abril 2026</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "OS no mês", value: f.os_concluidas_mes },
          { label: "Faturamento", value: `R$ ${(f.faturamento_mes / 1000).toFixed(1)}k` },
          { label: "Ticket médio", value: `R$ ${f.ticket_medio.toLocaleString("pt-BR")}` },
          { label: "Taxa aprovação", value: `${s.taxa_aprovacao}%` },
        ].map((k) => (
          <div key={k.label} className="rounded border p-4 text-center"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="text-2xl font-black" style={{ color: "var(--brand)" }}>{k.value}</div>
            <div className="text-xs font-medium mt-1" style={{ color: "var(--ink-muted)" }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
          <h2 className="font-bold text-sm mb-4" style={{ color: "var(--ink)" }}>Faturamento semanal</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={f.faturamento_semanal}>
              <XAxis dataKey="semana" tick={{ fill: "#6B6B6B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line-soft)", borderRadius: 4, color: "var(--ink)", fontSize: 12 }}
                formatter={(v) => [`R$ ${v.toLocaleString("pt-BR")}`, "Faturamento"]}
              />
              <Bar dataKey="valor" fill="#1B3A5C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
          <h2 className="font-bold text-sm mb-4" style={{ color: "var(--ink)" }}>Serviços mais realizados</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie data={s.servicos_top} dataKey="quantidade" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                  {s.servicos_top.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {s.servicos_top.map((sv, i) => (
                <div key={sv.servico} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-xs flex-1" style={{ color: "var(--ink-muted)" }}>{sv.servico}</span>
                  <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>{sv.quantidade}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <h2 className="font-bold text-sm mb-4" style={{ color: "var(--ink)" }}>OS por dia da semana</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={s.os_semana}>
            <XAxis dataKey="dia" tick={{ fill: "#6B6B6B", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line-soft)", borderRadius: 4, color: "var(--ink)", fontSize: 12 }} />
            <Bar dataKey="concluidas" fill="#1B3A5C" radius={[3, 3, 0, 0]} name="Concluídas" />
            <Bar dataKey="abertas" fill="#D4D0C8" radius={[3, 3, 0, 0]} name="Abertas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <h2 className="font-bold text-sm mb-4" style={{ color: "var(--ink)" }}>Desempenho da equipe técnica</h2>
        <div className="space-y-4">
          {demoEquipe.filter(t => t.os_concluidas_mes > 0).map((t) => (
            <div key={t.id} className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ backgroundColor: "var(--brand)" }}>
                {t.nome.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1.5">
                  <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{t.nome.split(" ")[0]}</span>
                  <span className="font-bold text-sm" style={{ color: "var(--brand)" }}>{t.os_concluidas_mes} OS</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(t.os_concluidas_mes / 12) * 100}%`, backgroundColor: "var(--brand)" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}