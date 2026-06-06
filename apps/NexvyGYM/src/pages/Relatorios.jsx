import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Users, TrendingUp, TrendingDown, CheckSquare } from "lucide-react";
import { demoStudents, demoFinancial, demoCheckins } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";

const COLORS = ["#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EAB308", "#EF4444"];
const tooltipStyle = { background: "#1E1E24", border: "1px solid #2A2A35", borderRadius: 8, color: "#F4F4F5" };

const PERIODS = [
  { label: "7 dias", value: "7d", days: 7 },
  { label: "Mês", value: "1m", days: 30 },
  { label: "Trimestre", value: "3m", days: 90 },
  { label: "Tudo", value: "all", days: 99999 },
];

function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Relatorios() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: students } = useRealData("Student", academyId);
  const { data: financial } = useRealData("Financial", academyId);
  const { data: checkins } = useRealData("Checkin", academyId);

  const s = demo ? demoStudents : students;
  const f = demo ? demoFinancial : financial;
  const c = demo ? demoCheckins : checkins;

  const [period, setPeriod] = useState("1m");
  const periodDays = PERIODS.find(p => p.value === period)?.days || 30;
  const cutoff = getDaysAgo(periodDays);

  // Filter by period
  const fFiltered = useMemo(() => period === "all" ? f : f.filter(x => (x.date || "") >= cutoff), [f, period, cutoff]);
  const cFiltered = useMemo(() => period === "all" ? c : c.filter(x => (x.date || "") >= cutoff), [c, period, cutoff]);

  // KPIs
  const totalReceita = fFiltered.filter(x => x.type === "receita").reduce((acc, x) => acc + (x.value || 0), 0);
  const totalDespesa = fFiltered.filter(x => x.type === "despesa").reduce((acc, x) => acc + (x.value || 0), 0);
  const saldo = totalReceita - totalDespesa;

  // Status pie
  const statusData = [
    { name: "Ativo", value: s.filter(x => x.status === "ativo").length },
    { name: "Inativo", value: s.filter(x => x.status === "inativo").length },
    { name: "Bloqueado", value: s.filter(x => x.status === "bloqueado").length },
  ].filter(d => d.value > 0);

  // Revenue by category (filtered)
  const catMap = {};
  fFiltered.filter(x => x.type === "receita").forEach(x => {
    catMap[x.category] = (catMap[x.category] || 0) + (x.value || 0);
  });
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Checkins over time — build buckets based on period
  const checkinChartData = useMemo(() => {
    if (periodDays <= 7) {
      // daily last 7
      return [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().slice(0, 10);
        return { name: d.toLocaleDateString("pt-BR", { weekday: "short" }), checkins: cFiltered.filter(x => x.date === key).length };
      });
    } else if (periodDays <= 30) {
      // daily last 30
      return [...Array(30)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        return { name: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), checkins: cFiltered.filter(x => x.date === key).length };
      });
    } else {
      // weekly buckets
      const weeks = {};
      cFiltered.forEach(x => {
        if (!x.date) return;
        const d = new Date(x.date);
        const monday = new Date(d);
        monday.setDate(d.getDate() - d.getDay() + 1);
        const key = monday.toISOString().slice(0, 10);
        weeks[key] = (weeks[key] || 0) + 1;
      });
      return Object.entries(weeks).sort().map(([k, v]) => ({
        name: new Date(k).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        checkins: v
      }));
    }
  }, [cFiltered, periodDays]);

  // Revenue over time (monthly or weekly)
  const revenueChartData = useMemo(() => {
    if (periodDays <= 30) {
      // daily
      return [...Array(periodDays)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (periodDays - 1 - i));
        const key = d.toISOString().slice(0, 10);
        const receita = fFiltered.filter(x => x.type === "receita" && x.date === key).reduce((a, x) => a + (x.value || 0), 0);
        const despesa = fFiltered.filter(x => x.type === "despesa" && x.date === key).reduce((a, x) => a + (x.value || 0), 0);
        return { name: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), receita, despesa };
      }).filter(d => d.receita > 0 || d.despesa > 0);
    } else {
      // monthly buckets
      const months = {};
      fFiltered.forEach(x => {
        if (!x.date) return;
        const key = x.date.slice(0, 7);
        if (!months[key]) months[key] = { receita: 0, despesa: 0 };
        if (x.type === "receita") months[key].receita += (x.value || 0);
        else months[key].despesa += (x.value || 0);
      });
      return Object.entries(months).sort().map(([k, v]) => ({
        name: new Date(k + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        ...v
      }));
    }
  }, [fFiltered, periodDays]);

  const fmt = (v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gym-subtle mr-1">Período:</span>
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${period === p.value ? "bg-gym-orange text-white border-gym-orange" : "border-gym-border text-gym-muted hover:text-white"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: "Total de Alunos", value: s.length, sub: `${s.filter(x => x.status === "ativo").length} ativos`, color: "text-gym-blue", bg: "bg-gym-blue/12" },
          { icon: TrendingUp, label: "Receita no Período", value: fmt(totalReceita), sub: `${fFiltered.filter(x => x.type === "receita").length} lançamentos`, color: "text-gym-green", bg: "bg-gym-green/12" },
          { icon: TrendingDown, label: "Despesa no Período", value: fmt(totalDespesa), sub: saldo >= 0 ? `Saldo +${fmt(saldo)}` : `Saldo ${fmt(saldo)}`, color: "text-gym-red", bg: "bg-gym-red/12" },
          { icon: CheckSquare, label: "Check-ins no Período", value: cFiltered.length, sub: `${s.length > 0 ? (cFiltered.length / Math.max(s.filter(x => x.status === "ativo").length, 1)).toFixed(1) : 0} média/aluno`, color: "text-gym-orange", bg: "bg-gym-orange/12" },
        ].map(({ icon: Icon, label, value, sub, color, bg }) => (
          <div key={label} className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div />
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gym-text text-tabular">{value}</div>
            <div className="text-sm text-gym-muted mt-1">{label}</div>
            {sub && <div className="text-xs text-gym-subtle mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Check-ins chart */}
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gym-text mb-4">Frequência de Check-ins</h3>
          {checkinChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={checkinChartData}>
                <XAxis dataKey="name" tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="checkins" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-center text-gym-subtle py-16 text-sm">Sem check-ins no período</div>}
        </div>

        {/* Status pie */}
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gym-text text-base mb-4">Status dos Alunos</h3>
          {statusData.length > 0 ? (
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
          ) : <div className="text-center text-gym-subtle py-10 text-sm">Sem dados</div>}
        </div>

        {/* Revenue over time */}
        {revenueChartData.length > 0 && (
          <div className="bg-white border border-gym-border rounded-xl p-5 lg:col-span-2 shadow-sm">
            <h3 className="font-semibold text-gym-text text-base mb-4">Receita vs Despesa no Período</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueChartData}>
                <XAxis dataKey="name" tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmt(v)]} />
                <Bar dataKey="receita" fill="#22C55E" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="despesa" fill="#EF4444" radius={[4, 4, 0, 0]} name="Despesa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Revenue by category */}
        {catData.length > 0 && (
          <div className="bg-white border border-gym-border rounded-xl p-5 lg:col-span-2 shadow-sm">
            <h3 className="font-semibold text-gym-text text-base mb-4">Receita por Categoria</h3>
            <ResponsiveContainer width="100%" height={Math.max(150, catData.length * 40)}>
              <BarChart data={catData} layout="vertical">
                <XAxis type="number" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmt(v)]} />
                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}