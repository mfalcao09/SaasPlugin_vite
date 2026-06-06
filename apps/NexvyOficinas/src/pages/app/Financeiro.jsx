import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Clock, CheckCircle2, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";

const CATEGORIAS_ENTRADA = ["Serviço / OS", "Orçamento", "Peças", "Revisão", "Outros"];
const CATEGORIAS_SAIDA   = ["Peças / Material", "Aluguel", "Pessoal", "Utilitários", "Impostos", "Outros"];
const FORMAS = ["PIX", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Transferência", "Boleto", "A definir"];

const emptyForm = {
  descricao: "", tipo: "entrada", valor: "", data: new Date().toISOString().split("T")[0],
  status: "confirmado", forma: "PIX", categoria: "", observacoes: "",
};

const fmt = (v) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtK = (v) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmt(v);

// Group lancamentos by month for chart
function buildMonthChart(lancamentos) {
  const map = {};
  lancamentos.filter(l => l.tipo === "entrada" && l.status === "confirmado").forEach(l => {
    const m = l.data?.slice(0, 7) || "?";
    map[m] = (map[m] || 0) + (l.valor || 0);
  });
  return Object.entries(map).sort().slice(-6).map(([k, v]) => ({
    mes: k.slice(5) + "/" + k.slice(2, 4),
    valor: v,
  }));
}

export default function Financeiro() {
  useDocumentTitle("Financeiro | AutoFlow AI");
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  const [lancamentos, setLancamentos] = useState([]);
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [l, o] = await Promise.all([
      base44.entities.Lancamento.filter({ empresa_id: empresaId }, "-data"),
      base44.entities.OrdemServico.filter({ empresa_id: empresaId }),
    ]);
    setLancamentos(l);
    setOrdens(o);
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId]);

  // KPIs
  const entradas     = lancamentos.filter(l => l.tipo === "entrada" && l.status === "confirmado").reduce((s, l) => s + (l.valor || 0), 0);
  const saidas       = lancamentos.filter(l => l.tipo === "saida"   && l.status === "confirmado").reduce((s, l) => s + (l.valor || 0), 0);
  const aReceber     = lancamentos.filter(l => l.tipo === "entrada" && l.status === "pendente").reduce((s, l) => s + (l.valor || 0), 0);
  const lucroBruto   = entradas - saidas;
  const osConcluidas = ordens.filter(o => o.status === "concluida");
  const ticketMedio  = osConcluidas.length > 0 ? osConcluidas.reduce((s, o) => s + (o.total || 0), 0) / osConcluidas.length : 0;
  const chartData    = buildMonthChart(lancamentos);

  const openNew = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (l) => {
    setForm({ descricao: l.descricao, tipo: l.tipo, valor: l.valor, data: l.data, status: l.status, forma: l.forma || "PIX", categoria: l.categoria || "", observacoes: l.observacoes || "" });
    setEditId(l.id); setModal(true);
  };
  const save = async () => {
    if (!form.descricao.trim() || !form.valor) return;
    setSaving(true);
    const payload = { ...form, valor: Number(form.valor), empresa_id: empresaId };
    if (editId) { await base44.entities.Lancamento.update(editId, payload); }
    else { await base44.entities.Lancamento.create(payload); }
    setSaving(false); setModal(false); load();
  };
  const remove = async (id) => {
    if (!confirm("Remover lançamento?")) return;
    await base44.entities.Lancamento.delete(id); load();
  };

  // Auto-register: mark concluded OS as revenue lancamento if not yet
  const registrarOSComoConcluida = async (os) => {
    await base44.entities.Lancamento.create({
      descricao: `Serviço concluído — ${os.cliente_nome}`,
      tipo: "entrada", valor: os.total || 0,
      data: os.data_conclusao || new Date().toISOString().split("T")[0],
      status: "confirmado", forma: "A definir",
      categoria: "Serviço / OS",
      empresa_id: empresaId,
      os_id: os.id,
    });
    load();
  };

  // OS concluídas sem lançamento vinculado
  const osIdsCobertos = new Set(lancamentos.map(l => l.os_id).filter(Boolean));
  const osParaRegistrar = osConcluidas.filter(o => !osIdsCobertos.has(o.id) && (o.total || 0) > 0);

  if (loadingEmpresa || loading) return <Spinner />;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Financeiro</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{lancamentos.length} lançamentos registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo lançamento
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Receita confirmada", value: fmtK(entradas), icon: CheckCircle2, color: "var(--status-green-fg)" },
          { label: "Despesas",           value: fmtK(saidas),   icon: TrendingDown, color: "var(--status-red-fg)" },
          { label: "A receber",          value: fmtK(aReceber), icon: Clock,        color: "var(--status-amber-fg)" },
          { label: "Lucro bruto est.",   value: fmtK(lucroBruto), icon: TrendingUp, color: lucroBruto >= 0 ? "var(--brand)" : "var(--status-red-fg)" },
        ].map(s => (
          <div key={s.label} className="rounded-sm border p-4"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center mb-3"
              style={{ backgroundColor: "var(--brand-subtle)" }}>
              <s.icon className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
            </div>
            <div className="text-[20px] font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Extra KPIs row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sm border p-4" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ink-muted)" }}>Ticket médio (OS concluídas)</div>
          <div className="text-[20px] font-black" style={{ color: "var(--brand)" }}>
            {ticketMedio > 0 ? fmt(ticketMedio) : "—"}
          </div>
          <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{osConcluidas.length} OS concluídas</div>
        </div>
        <div className="rounded-sm border p-4" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ink-muted)" }}>Total de lançamentos</div>
          <div className="text-[20px] font-black" style={{ color: "var(--ink)" }}>{lancamentos.length}</div>
          <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
            {lancamentos.filter(l => l.status === "pendente").length} pendentes
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: "var(--ink)" }}>Receita por mês (confirmada)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <XAxis dataKey="mes" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 2, fontSize: 11 }} formatter={v => [fmt(v), "Receita"]} cursor={{ fill: "var(--surface-sunken)" }} />
              <Bar dataKey="valor" fill="var(--brand)" radius={[2, 2, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OS para registrar como receita */}
      {osParaRegistrar.length > 0 && (
        <div className="rounded-sm border p-4"
          style={{ backgroundColor: "var(--status-amber-bg)", borderColor: "var(--status-amber-fg)40" }}>
          <p className="text-[12px] font-bold mb-2" style={{ color: "var(--status-amber-fg)" }}>
            {osParaRegistrar.length} OS concluída(s) sem receita registrada
          </p>
          <div className="space-y-2">
            {osParaRegistrar.slice(0, 3).map(os => (
              <div key={os.id} className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "var(--ink)" }}>{os.numero || os.id.slice(0, 8)} — {os.cliente_nome} — {fmt(os.total)}</span>
                <button onClick={() => registrarOSComoConcluida(os)}
                  className="text-[11px] font-bold px-3 py-1 rounded-sm text-white"
                  style={{ backgroundColor: "var(--brand)" }}>
                  Registrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista lançamentos */}
      <div className="rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <h2 className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>Lançamentos</h2>
        </div>
        {lancamentos.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>Nenhum lançamento ainda.</p>
            <button onClick={openNew} className="mt-3 text-[12px] font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: "var(--brand)" }}>
              Criar primeiro lançamento
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
            {lancamentos.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-5 py-3 transition-colors"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: l.tipo === "entrada" ? "var(--status-green-bg)" : "var(--status-red-bg)" }}>
                  {l.tipo === "entrada"
                    ? <TrendingUp className="w-4 h-4" style={{ color: "var(--status-green-fg)" }} />
                    : <TrendingDown className="w-4 h-4" style={{ color: "var(--status-red-fg)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{l.descricao}</p>
                  <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                    {l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"} · {l.forma || "—"} {l.categoria ? `· ${l.categoria}` : ""}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-[13px]" style={{ color: l.tipo === "entrada" ? "var(--status-green-fg)" : "var(--status-red-fg)" }}>
                    {l.tipo === "entrada" ? "+" : "−"}{fmt(l.valor)}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: l.status === "confirmado" ? "var(--status-green-fg)" : "var(--status-amber-fg)" }}>
                    {l.status === "confirmado" ? "Confirmado" : "Pendente"}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => openEdit(l)} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(l.id)} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar lançamento" : "Novo lançamento"}>
        <div className="space-y-4">
          <FormField label="Descrição" required>
            <Input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Pagamento OS-091 — João" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo">
              <Select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value, categoria: "" }))}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </Select>
            </FormField>
            <FormField label="Valor (R$)" required>
              <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" />
            </FormField>
            <FormField label="Data">
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="confirmado">Confirmado</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </FormField>
            <FormField label="Forma de pagamento">
              <Select value={form.forma} onChange={e => setForm(p => ({ ...p, forma: e.target.value }))}>
                {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </FormField>
            <FormField label="Categoria">
              <Select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                <option value="">Selecionar...</option>
                {(form.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 rounded-sm text-[13px] font-semibold border" style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>Cancelar</button>
            <button onClick={save} disabled={saving || !form.descricao.trim() || !form.valor}
              className="px-4 py-2 rounded-sm text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : editId ? "Salvar" : "Criar lançamento"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Spinner() { return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>; }