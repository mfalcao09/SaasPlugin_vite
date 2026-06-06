import { useState } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { demoFinancial } from "@/lib/demoData";
import StatusBadge from "@/components/ui/StatusBadge";

export default function DemoFinanceiro() {
  const [filter, setFilter] = useState("todos");

  const receitas = demoFinancial.filter(f => f.type === "receita").reduce((s, f) => s + (f.value || 0), 0);
  const despesas = demoFinancial.filter(f => f.type === "despesa").reduce((s, f) => s + (f.value || 0), 0);
  const saldo = receitas - despesas;
  const pendente = demoFinancial.filter(f => f.type === "receita" && f.status === "pendente").reduce((s, f) => s + (f.value || 0), 0);

  const filtered = filter === "todos" ? demoFinancial : demoFinancial.filter(f => f.type === filter);
  const fmt = (v) => `R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: "Receitas", value: receitas, color: "text-gym-green", bg: "bg-gym-green/10" },
          { icon: TrendingDown, label: "Despesas", value: despesas, color: "text-gym-red", bg: "bg-gym-red/10" },
          { icon: DollarSign, label: "Saldo", value: saldo, color: saldo >= 0 ? "text-gym-green" : "text-gym-red", bg: saldo >= 0 ? "bg-gym-green/10" : "bg-gym-red/10" },
          { icon: DollarSign, label: "A Receber", value: pendente, color: "text-gym-yellow", bg: "bg-gym-yellow/10" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-[#18181B] border border-gym-border rounded-xl p-5">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold text-tabular ${color}`}>{fmt(value)}</div>
            <div className="text-sm text-gym-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {["todos", "receita", "despesa"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${filter === f ? "bg-gym-orange text-white border-gym-orange" : "border-gym-border text-gym-muted hover:text-white"}`}>
            {f === "todos" ? "Todos" : f === "receita" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      <div className="bg-[#18181B] border border-gym-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-[#111114]">
                <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                <th className="text-left px-4 py-3 font-semibold">Categoria</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <tr key={i} className="border-b border-gym-border/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{f.description}</td>
                  <td className="px-4 py-3 text-gym-muted">{f.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${f.type === "receita" ? "text-gym-green" : "text-gym-red"}`}>
                      {f.type === "receita" ? "Receita" : "Despesa"}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className={`px-4 py-3 text-right font-bold text-tabular ${f.type === "receita" ? "text-gym-green" : "text-gym-red"}`}>
                    {f.type === "despesa" ? "- " : "+ "}{fmt(f.value || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}