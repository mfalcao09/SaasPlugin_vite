import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { demoStudents, demoFinancial, demoCheckins } from "@/lib/demoData";

const COLORS = ["#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EAB308", "#EF4444"];
const tooltipStyle = { background: "#1E1E24", border: "1px solid #2A2A35", borderRadius: 8, color: "#F4F4F5" };

export default function DemoRelatorios() {
  const s = demoStudents;
  const f = demoFinancial;
  const c = demoCheckins;

  const statusData = [
    { name: "Ativo", value: s.filter(x => x.status === "ativo").length },
    { name: "Inativo", value: s.filter(x => x.status === "inativo").length },
    { name: "Bloqueado", value: s.filter(x => x.status === "bloqueado").length },
  ].filter(d => d.value > 0);

  const catMap = {};
  f.filter(x => x.type === "receita").forEach(x => {
    catMap[x.category] = (catMap[x.category] || 0) + (x.value || 0);
  });
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { name: d.toLocaleDateString("pt-BR", { weekday: "short" }), checkins: c.filter(x => x.date === key).length };
  });

  const totalReceita = f.filter(x => x.type === "receita").reduce((acc, x) => acc + (x.value || 0), 0);
  const totalDespesa = f.filter(x => x.type === "despesa").reduce((acc, x) => acc + (x.value || 0), 0);
  const fmt = (v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Alunos", value: s.length },
          { label: "Receita Total", value: fmt(totalReceita) },
          { label: "Despesa Total", value: fmt(totalDespesa) },
          { label: "Total Check-ins", value: c.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#18181B] border border-gym-border rounded-xl p-5">
            <div className="text-2xl font-bold text-white text-tabular">{value}</div>
            <div className="text-sm text-gym-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#18181B] border border-gym-border rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4">Check-ins — Últimos 7 dias</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last7}>
              <XAxis dataKey="name" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="checkins" fill="#F97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#18181B] border border-gym-border rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4">Status dos Alunos</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i] }} />
                  <span className="text-gym-muted">{d.name}:</span>
                  <span className="text-white font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {catData.length > 0 && (
          <div className="bg-[#18181B] border border-gym-border rounded-xl p-5 lg:col-span-2">
            <h3 className="font-semibold text-white mb-4">Receita por Categoria</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catData} layout="vertical">
                <XAxis type="number" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmt(v)]} />
                <Bar dataKey="value" fill="#22C55E" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}