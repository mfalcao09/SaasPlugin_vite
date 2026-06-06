import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Loader2, Calendar } from "lucide-react";

const COLORS = ["#1C3F5E", "#2A5280", "#3B6BA5", "#6B8DB5", "#A8BDD4"];
const fmt = (v) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const PERIODOS = [
  { label: "Este mês",     days: 30 },
  { label: "3 meses",      days: 90 },
  { label: "6 meses",      days: 180 },
  { label: "Este ano",     days: 365 },
  { label: "Tudo",         days: 9999 },
];

function filterByPeriod(items, days, dateField = "created_date") {
  if (days >= 9999) return items;
  const cutoff = Date.now() - days * 86400000;
  return items.filter(i => i[dateField] && new Date(i[dateField]).getTime() >= cutoff);
}

export default function Relatorios() {
  useDocumentTitle("Relatórios | AutoFlow AI");
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  const [clientes,  setClientes]  = useState([]);
  const [veiculos,  setVeiculos]  = useState([]);
  const [orcamentos,setOrcamentos]= useState([]);
  const [ordens,    setOrdens]    = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [periodo,   setPeriodo]   = useState(30);

  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      setLoading(true);
      const [c, v, o, os, l] = await Promise.all([
        base44.entities.Cliente.filter({ empresa_id: empresaId }),
        base44.entities.Veiculo.filter({ empresa_id: empresaId }),
        base44.entities.Orcamento.filter({ empresa_id: empresaId }),
        base44.entities.OrdemServico.filter({ empresa_id: empresaId }),
        base44.entities.Lancamento.filter({ empresa_id: empresaId }),
      ]);
      setClientes(c); setVeiculos(v); setOrcamentos(o); setOrdens(os); setLancamentos(l);
      setLoading(false);
    };
    load();
  }, [empresaId]);

  if (loadingEmpresa || loading) return (
    <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>
  );

  // Filtered by period
  const fOrdens     = filterByPeriod(ordens, periodo);
  const fOrcamentos = filterByPeriod(orcamentos, periodo);
  const fLancs      = filterByPeriod(lancamentos, periodo, "data");

  // KPIs
  const osConcluidas = fOrdens.filter(o => o.status === "concluida");
  const faturamento  = osConcluidas.reduce((s, o) => s + (o.total || 0), 0);
  const ticketMedio  = osConcluidas.length > 0 ? faturamento / osConcluidas.length : 0;
  const orcAprov     = fOrcamentos.filter(o => o.status === "aprovado").length;
  const taxaAprov    = fOrcamentos.length > 0 ? Math.round((orcAprov / fOrcamentos.length) * 100) : 0;

  // Receita vs Despesa por mês
  const monthMap = {};
  fLancs.filter(l => l.status === "confirmado").forEach(l => {
    const m = (l.data || "").slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { mes: m.slice(5) + "/" + m.slice(2, 4), entrada: 0, saida: 0 };
    if (l.tipo === "entrada") monthMap[m].entrada += l.valor || 0;
    else monthMap[m].saida += l.valor || 0;
  });
  const chartRecDesp = Object.values(monthMap).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6);

  // OS por status
  const statusCounts = {};
  fOrdens.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const chartStatus = Object.entries(statusCounts).map(([k, v]) => ({ label: k.replace("_", " "), qtd: v }));

  // Serviços mais executados (from OS itens)
  const servicoMap = {};
  fOrdens.forEach(os => (os.itens || []).forEach(i => {
    const k = i.descricao?.trim();
    if (k) servicoMap[k] = (servicoMap[k] || 0) + 1;
  }));
  const topServicos = Object.entries(servicoMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, q]) => ({ servico: s, quantidade: q }));

  // Técnicos mais ativos
  const tecMap = {};
  fOrdens.filter(o => o.tecnico).forEach(o => { tecMap[o.tecnico] = (tecMap[o.tecnico] || 0) + 1; });
  const topTecnicos = Object.entries(tecMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Clientes recorrentes (mais de 1 OS)
  const clienteMap = {};
  fOrdens.forEach(o => { if (o.cliente_nome) clienteMap[o.cliente_nome] = (clienteMap[o.cliente_nome] || 0) + 1; });
  const recorrentes = Object.entries(clienteMap).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header + filtro de período */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Relatórios</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>Dados reais da operação</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PERIODOS.map(p => (
            <button key={p.days} onClick={() => setPeriodo(p.days)}
              className="px-3 py-1.5 rounded-sm text-[11px] font-semibold transition-all"
              style={periodo === p.days
                ? { backgroundColor: "var(--brand)", color: "white" }
                : { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)", color: "var(--ink-muted)" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "OS concluídas",    value: osConcluidas.length },
          { label: "Faturamento",      value: faturamento >= 1000 ? `R$ ${(faturamento/1000).toFixed(1)}k` : fmt(faturamento) },
          { label: "Ticket médio",     value: ticketMedio > 0 ? fmt(ticketMedio) : "—" },
          { label: "Taxa aprovação",   value: `${taxaAprov}%` },
        ].map(k => (
          <div key={k.label} className="rounded-sm border p-4 text-center"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <div className="text-[22px] font-black" style={{ color: "var(--brand)" }}>{k.value}</div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Receita vs Despesa */}
      {chartRecDesp.length > 0 && (
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Receita vs Despesa por mês</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartRecDesp}>
              <XAxis dataKey="mes" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 2, fontSize: 11 }}
                formatter={(v, n) => [fmt(v), n === "entrada" ? "Receita" : "Despesa"]}
                cursor={{ fill: "var(--surface-sunken)" }} />
              <Bar dataKey="entrada" fill="var(--brand)" radius={[2, 2, 0, 0]} name="Receita" maxBarSize={28} />
              <Bar dataKey="saida"   fill="#FCA5A5"      radius={[2, 2, 0, 0]} name="Despesa" maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OS por status + Serviços */}
      <div className="grid lg:grid-cols-2 gap-4">
        {chartStatus.length > 0 && (
          <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>OS por status</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartStatus}>
                <XAxis dataKey="label" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 2, fontSize: 11 }} cursor={{ fill: "var(--surface-sunken)" }} />
                <Bar dataKey="qtd" fill="var(--brand)" radius={[2, 2, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {topServicos.length > 0 && (
          <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Serviços mais executados</h2>
            <div className="flex items-center gap-5">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={topServicos} dataKey="quantidade" cx="50%" cy="50%" outerRadius={50} innerRadius={24}>
                    {topServicos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {topServicos.map((sv, i) => (
                  <div key={sv.servico} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[11px] flex-1 truncate" style={{ color: "var(--ink-muted)" }}>{sv.servico}</span>
                    <span className="font-bold text-[12px]" style={{ color: "var(--ink)" }}>{sv.quantidade}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Técnicos ativos + Clientes recorrentes */}
      <div className="grid lg:grid-cols-2 gap-4">
        {topTecnicos.length > 0 && (
          <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Técnicos mais ativos</h2>
            <div className="space-y-3">
              {topTecnicos.map(([nome, qtd]) => (
                <div key={nome} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                    style={{ backgroundColor: "var(--brand)" }}>{nome.charAt(0)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] font-semibold" style={{ color: "var(--ink)" }}>{nome.split(" ").slice(0, 2).join(" ")}</span>
                      <span className="text-[12px] font-bold" style={{ color: "var(--brand)" }}>{qtd} OS</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(qtd / topTecnicos[0][1]) * 100}%`, backgroundColor: "var(--brand)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recorrentes.length > 0 && (
          <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Clientes recorrentes</h2>
            <div className="space-y-3">
              {recorrentes.map(([nome, qtd]) => (
                <div key={nome} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                    style={{ backgroundColor: "var(--brand)" }}>{nome.charAt(0)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-[12px] font-semibold" style={{ color: "var(--ink)" }}>{nome.split(" ").slice(0, 2).join(" ")}</span>
                      <span className="text-[12px] font-bold" style={{ color: "var(--brand)" }}>{qtd}× atendimentos</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Totais gerais */}
      <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Resumo geral do período</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: "Clientes",    value: clientes.length },
            { label: "Veículos",    value: veiculos.length },
            { label: "Orçamentos",  value: fOrcamentos.length },
            { label: "OS totais",   value: fOrdens.length },
          ].map(k => (
            <div key={k.label} className="rounded-sm p-3" style={{ backgroundColor: "var(--surface-sunken)" }}>
              <div className="text-[18px] font-black" style={{ color: "var(--ink)" }}>{k.value}</div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {fOrdens.length === 0 && fOrcamentos.length === 0 && (
        <div className="text-center py-12 rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>Ainda sem dados no período selecionado.</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--ink-muted)" }}>Crie ordens de serviço e orçamentos para ver relatórios aqui.</p>
        </div>
      )}
    </div>
  );
}