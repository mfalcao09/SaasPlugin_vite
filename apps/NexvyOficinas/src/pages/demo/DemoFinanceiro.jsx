import { demoFinanceiro } from "@/data/demoData";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Clock, CheckCircle2 } from "lucide-react";

export default function DemoFinanceiro() {
  const f = demoFinanceiro;

  return (
    <div className="p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Financeiro</h1>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Resumo financeiro — Abril 2026</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Faturamento", value: `R$ ${(f.faturamento_mes / 1000).toFixed(1)}k`, icon: DollarSign },
          { label: "Recebido", value: `R$ ${(f.total_recebido_mes / 1000).toFixed(1)}k`, icon: CheckCircle2 },
          { label: "A Receber", value: `R$ ${(f.total_receber / 1000).toFixed(1)}k`, icon: Clock },
          { label: "Lucro Bruto", value: `R$ ${(f.lucro_bruto_estimado / 1000).toFixed(1)}k`, icon: TrendingUp },
        ].map((s) => (
          <div key={s.label} className="rounded border p-4"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="w-8 h-8 rounded flex items-center justify-center mb-3"
              style={{ backgroundColor: "var(--brand-subtle)" }}>
              <s.icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
            </div>
            <div className="text-xl font-black" style={{ color: "var(--ink)" }}>{s.value}</div>
            <div className="text-xs font-medium mt-1" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <h2 className="font-bold text-sm mb-4" style={{ color: "var(--ink)" }}>Faturamento Semanal</h2>
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

      <div className="rounded border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Lançamentos</h2>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {f.lancamentos.map((l) => (
            <div key={l.id} className="flex items-center gap-4 p-3 rounded"
              style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line-soft)" }}>
              <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: l.tipo === "entrada" ? "#D1FAE5" : "#FEE2E2" }}>
                {l.tipo === "entrada"
                  ? <TrendingUp className="w-4 h-4" style={{ color: "#065F46" }} />
                  : <TrendingDown className="w-4 h-4" style={{ color: "#991B1B" }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{l.descricao}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>
                  {new Date(l.data).toLocaleDateString("pt-BR")} · {l.forma}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-sm"
                  style={{ color: l.tipo === "entrada" ? "#065F46" : "#991B1B" }}>
                  {l.tipo === "entrada" ? "+" : "-"}R$ {l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs mt-0.5 font-medium"
                  style={{ color: l.status === "confirmado" ? "#059669" : "#D97706" }}>
                  {l.status === "confirmado" ? "Confirmado" : "Pendente"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}