import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { demoDashboardStats, demoOrdens, demoAIInsights } from "@/data/demoData";
import { ClipboardList, DollarSign, FileText, Car, Users, Brain, TrendingUp, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const StatusBadge = ({ status }) => {
  const map = {
    em_andamento:    { label: "Em andamento", bg: "var(--status-blue-bg)",  fg: "var(--status-blue-fg)" },
    aguardando_peca: { label: "Aguard. peça", bg: "var(--status-amber-bg)", fg: "var(--status-amber-fg)" },
    concluida:       { label: "Concluída",     bg: "var(--status-green-bg)", fg: "var(--status-green-fg)" },
    pendente:        { label: "Pendente",      bg: "#F3F4F6",                fg: "#6B7280" },
  };
  const s = map[status] || { label: status, bg: "#F3F4F6", fg: "#6B7280" };
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
};

export default function DemoDashboard() {
  const s = demoDashboardStats;
  const alertas = demoAIInsights.filter(i => i.prioridade === "alta").slice(0, 2);

  const kpis = [
    { icon: ClipboardList, label: "OS em Aberto",       value: s.os_abertas,                                  link: "/demo/ordens" },
    { icon: FileText,      label: "Orç. Pendentes",     value: s.orcamentos_pendentes,                         link: "/demo/orcamentos" },
    { icon: DollarSign,    label: "Faturamento",        value: `R$ ${(s.faturamento_mes/1000).toFixed(1)}k`,   link: "/demo/financeiro" },
    { icon: TrendingUp,    label: "Ticket Médio",       value: `R$ ${s.ticket_medio.toLocaleString("pt-BR")}`, link: "/demo/relatorios" },
    { icon: Car,           label: "Veículos em Atend.", value: s.veiculos_em_atendimento,                       link: "/demo/veiculos" },
    { icon: Users,         label: "Clientes Inativos",  value: s.clientes_inativos,                            link: "/demo/clientes" },
  ];

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Dashboard</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>Auto Center Supremo — Abril 2026</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map(({ icon: Icon, label, value, link }) => (
          <Link key={label} to={link}
            className="block rounded-sm border p-4 transition-all"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--brand-line)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center mb-3"
              style={{ backgroundColor: "var(--brand-subtle)" }}>
              <Icon className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
            </div>
            <div className="text-[22px] font-black leading-none mb-1" style={{ color: "var(--ink)" }}>{value}</div>
            <div className="text-[12px] font-medium" style={{ color: "var(--ink-muted)" }}>{label}</div>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>OS por dia da semana</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={s.os_semana} barGap={2}>
              <XAxis dataKey="dia" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 2, color: "var(--ink)", fontSize: 11 }} cursor={{ fill: "var(--surface-sunken)" }} />
              <Bar dataKey="concluidas" fill="var(--brand)" radius={[2, 2, 0, 0]} name="Concluídas" maxBarSize={28} />
              <Bar dataKey="abertas"    fill="var(--line)"  radius={[2, 2, 0, 0]} name="Abertas"    maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold flex items-center gap-2" style={{ color: "var(--ink)" }}>
              <Brain className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
              AI Growth
            </h2>
            <Link to="/demo/ai-growth" className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div key={a.id} className="rounded-sm border p-3"
                style={{ backgroundColor: "var(--surface-sunken)", borderColor: "#FCA5A5" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3 h-3" style={{ color: "#DC2626" }} />
                  <span className="text-[10px] font-bold tracking-wider" style={{ color: "#DC2626" }}>URGENTE</span>
                </div>
                <p className="text-[12px] font-medium" style={{ color: "var(--ink)" }}>{a.titulo}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{a.cliente}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OS table */}
      <div className="rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <h2 className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>Ordens Recentes</h2>
          <Link to="/demo/ordens" className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>Ver todas →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                {["OS", "Cliente", "Status", "Valor"].map((h, i) => (
                  <th key={h}
                    className={`px-5 py-3 text-left text-[11px] font-semibold tracking-wide ${i === 3 ? "text-right" : ""} ${i === 1 ? "hidden sm:table-cell" : ""}`}
                    style={{ color: "var(--ink-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demoOrdens.map((os) => (
                <tr key={os.id} style={{ borderBottom: "1px solid var(--line-soft)" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <td className="px-5 py-3 font-mono text-[11px]" style={{ color: "var(--ink-muted)" }}>{os.numero}</td>
                  <td className="px-5 py-3 text-[13px] font-semibold hidden sm:table-cell" style={{ color: "var(--ink)" }}>{os.cliente_nome}</td>
                  <td className="px-5 py-3"><StatusBadge status={os.status} /></td>
                  <td className="px-5 py-3 text-right text-[13px] font-bold" style={{ color: "var(--brand)" }}>
                    R$ {os.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top serviços */}
      <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Serviços mais realizados</h2>
        <div className="space-y-3">
          {s.servicos_top.map((sv, i) => (
            <div key={sv.servico} className="flex items-center gap-3">
              <span className="w-5 text-[11px] font-bold text-right" style={{ color: "var(--ink-faint)" }}>{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>{sv.servico}</span>
                  <span className="text-[12px] font-bold" style={{ color: "var(--brand)" }}>{sv.quantidade}×</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(sv.quantidade / s.servicos_top[0].quantidade) * 100}%`, backgroundColor: "var(--brand)" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}