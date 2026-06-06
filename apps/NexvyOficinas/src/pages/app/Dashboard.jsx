import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ClipboardList, DollarSign, FileText, Car, Users, Brain, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";

const statusConfig = {
  aberta:          { label: "Aberta",        bg: "#F3F4F6", fg: "#6B7280" },
  em_andamento:    { label: "Em andamento",  bg: "var(--status-blue-bg)",  fg: "var(--status-blue-fg)" },
  aguardando_peca: { label: "Aguard. peça",  bg: "var(--status-amber-bg)", fg: "var(--status-amber-fg)" },
  concluida:       { label: "Concluída",     bg: "var(--status-green-bg)", fg: "var(--status-green-fg)" },
  cancelada:       { label: "Cancelada",     bg: "var(--status-red-bg)",   fg: "var(--status-red-fg)" },
};

export default function Dashboard() {
  const { empresa, empresaId, loading: contextLoading } = useTenantEmpresa();
  useDocumentTitle(empresa ? `${empresa.nome} | AutoFlow AI` : "Dashboard | AutoFlow AI");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId || contextLoading) return;
    const load = async () => {
      setLoading(true);
      const [clientes, veiculos, orcamentos, ordens] = await Promise.all([
        base44.entities.Cliente.filter({ empresa_id: empresaId }),
        base44.entities.Veiculo.filter({ empresa_id: empresaId }),
        base44.entities.Orcamento.filter({ empresa_id: empresaId }),
        base44.entities.OrdemServico.filter({ empresa_id: empresaId }),
      ]);

      // KPIs
      const osAbertas = ordens.filter(o => o.status !== "concluida" && o.status !== "cancelada");
      const osConcluidas = ordens.filter(o => o.status === "concluida");
      const orcamentosPendentes = orcamentos.filter(o => o.status === "pendente");
      const faturamento = osConcluidas.reduce((s, o) => s + (o.total || 0), 0);
      const ticketMedio = osConcluidas.length > 0 ? faturamento / osConcluidas.length : 0;

      // OS por status (para mini-bar chart)
      const osPorStatus = Object.entries(statusConfig).map(([k, v]) => ({
        label: v.label,
        qtd: ordens.filter(o => o.status === k).length,
      })).filter(s => s.qtd > 0);

      // Alertas simples de AI
      const alertas = [];
      orcamentosPendentes.slice(0, 2).forEach(o => {
        const dias = Math.floor((Date.now() - new Date(o.created_date)) / 86400000);
        if (dias >= 2) alertas.push({ id: o.id, tipo: "orc", titulo: `Orçamento pendente há ${dias} dias`, cliente: o.cliente_nome });
      });
      clientes.filter(c => c.status === "inativo").slice(0, 1).forEach(c => {
        alertas.push({ id: c.id, tipo: "inativo", titulo: `Cliente ${c.nome} está inativo`, cliente: c.nome });
      });

      // Últimas OS
      const ultimasOS = [...ordens].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

      setData({ clientes: clientes.length, veiculos: veiculos.length, osAbertas: osAbertas.length, osConcluidas: osConcluidas.length, orcamentosPendentes: orcamentosPendentes.length, faturamento, ticketMedio, osPorStatus, alertas, ultimasOS });
      setLoading(false);
    };
    load();
  }, [empresaId]);

  if (!data || loading) return (
    <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>
  );

  const kpis = [
    { icon: ClipboardList, label: "OS em Aberto",     value: data.osAbertas,          link: "/ordens" },
    { icon: FileText,      label: "Orç. Pendentes",   value: data.orcamentosPendentes, link: "/orcamentos" },
    { icon: DollarSign,    label: "Faturamento (OS concl.)", value: `R$ ${data.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, link: "/financeiro" },
    { icon: TrendingUp,    label: "Ticket Médio",     value: data.ticketMedio > 0 ? `R$ ${data.ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—", link: "/relatorios" },
    { icon: Users,         label: "Clientes",          value: data.clientes,           link: "/clientes" },
    { icon: Car,           label: "Veículos",          value: data.veiculos,           link: "/veiculos" },
  ];

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Dashboard</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>Visão operacional em tempo real</p>
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

      {/* Row 2: chart + alertas */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* OS por status */}
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>OS por status</h2>
          {data.osPorStatus.length === 0 ? (
            <p className="text-[12px] py-8 text-center" style={{ color: "var(--ink-muted)" }}>Nenhuma OS ainda</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.osPorStatus} barGap={4}>
                <XAxis dataKey="label" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 2, color: "var(--ink)", fontSize: 11 }} cursor={{ fill: "var(--surface-sunken)" }} />
                <Bar dataKey="qtd" fill="var(--brand)" radius={[2, 2, 0, 0]} name="OS" maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Alertas IA */}
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold flex items-center gap-2" style={{ color: "var(--ink)" }}>
              <Brain className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
              AI Growth
            </h2>
            <Link to="/ai-growth" className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>Ver todos →</Link>
          </div>
          {data.alertas.length === 0 ? (
            <div className="rounded-sm border p-4 text-center" style={{ backgroundColor: "var(--status-green-bg)", borderColor: "var(--status-green-fg)40" }}>
              <p className="text-[12px] font-semibold" style={{ color: "var(--status-green-fg)" }}>✅ Tudo em ordem por enquanto</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.alertas.map((a, i) => (
                <div key={i} className="rounded-sm border p-3"
                  style={{ backgroundColor: "var(--surface-sunken)", borderColor: "#FCA5A5" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3 h-3" style={{ color: "#DC2626" }} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: "#DC2626" }}>ATENÇÃO</span>
                  </div>
                  <p className="text-[12px] font-medium" style={{ color: "var(--ink)" }}>{a.titulo}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{a.cliente}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabela últimas OS */}
      <div className="rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <h2 className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>Ordens Recentes</h2>
          <Link to="/ordens" className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>Ver todas →</Link>
        </div>
        {data.ultimasOS.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>Nenhuma OS registrada ainda.</p>
            <Link to="/ordens" className="inline-block mt-3 text-[12px] font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: "var(--brand)" }}>Criar primeira OS</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  {["OS", "Cliente", "Status", "Valor"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-left text-[11px] font-semibold tracking-wide ${i === 3 ? "text-right" : ""} ${i === 1 ? "hidden sm:table-cell" : ""}`}
                      style={{ color: "var(--ink-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.ultimasOS.map(os => {
                  const sc = statusConfig[os.status] || statusConfig.aberta;
                  return (
                    <tr key={os.id} style={{ borderBottom: "1px solid var(--line-soft)" }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                      <td className="px-5 py-3 font-mono text-[11px]" style={{ color: "var(--ink-muted)" }}>{os.numero || os.id.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-[13px] font-semibold hidden sm:table-cell" style={{ color: "var(--ink)" }}>{os.cliente_nome}</td>
                      <td className="px-5 py-3">
                        <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold"
                          style={{ backgroundColor: sc.bg, color: sc.fg }}>{sc.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] font-bold" style={{ color: "var(--brand)" }}>
                        R$ {(os.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}