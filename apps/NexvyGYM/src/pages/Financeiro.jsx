import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Pencil, Trash2 } from "lucide-react";
import { demoFinancial } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/ui/StatusBadge";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelClass = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";
const emptyForm = { type: "receita", category: "Mensalidade", description: "", value: "", date: new Date().toISOString().slice(0, 10), status: "pago" };

export default function Financeiro() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realFinancial, reload } = useRealData("Financial", academyId, {}, "-date");
  const financial = demo ? demoFinancial : realFinancial;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [form, setForm] = useState(emptyForm);

  const receitas = financial.filter(f => f.type === "receita").reduce((s, f) => s + (f.value || 0), 0);
  const despesas = financial.filter(f => f.type === "despesa").reduce((s, f) => s + (f.value || 0), 0);
  const saldo = receitas - despesas;
  const pendente = financial.filter(f => f.type === "receita" && f.status === "pendente").reduce((s, f) => s + (f.value || 0), 0);

  const filtered = filter === "todos" ? financial : financial.filter(f => f.type === filter);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(f) {
    setEditing(f);
    setForm({ type: f.type, category: f.category, description: f.description, value: f.value, date: f.date, status: f.status });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setShowForm(false); return; }
    const data = { ...form, value: parseFloat(form.value), academy_id: academyId };
    if (editing) {
      await base44.entities.Financial.update(editing.id, data);
    } else {
      await base44.entities.Financial.create(data);
    }
    reload();
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (demo || !window.confirm("Remover lançamento?")) return;
    await base44.entities.Financial.delete(id);
    reload();
  }

  const fmt = (v) => `R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: "Receitas", value: receitas, color: "text-gym-green", bg: "bg-gym-green/15" },
          { icon: TrendingDown, label: "Despesas", value: despesas, color: "text-gym-red", bg: "bg-gym-red/15" },
          { icon: DollarSign, label: "Saldo", value: saldo, color: saldo >= 0 ? "text-gym-green" : "text-gym-red", bg: saldo >= 0 ? "bg-gym-green/15" : "bg-gym-red/15" },
          { icon: DollarSign, label: "A Receber", value: pendente, color: "text-gym-yellow", bg: "bg-gym-yellow/15" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold text-tabular ${color}`}>{fmt(value)}</div>
            <div className="text-sm text-gym-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div className="flex gap-3 flex-wrap">
        {["todos", "receita", "despesa"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${filter === f ? "bg-gym-orange text-white border-gym-orange" : "border-gym-border text-gym-muted hover:text-white"}`}>
            {f === "todos" ? "Todos" : f === "receita" ? "Receitas" : "Despesas"}
          </button>
        ))}
        <button onClick={openNew} className="ml-auto flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Novo Lançamento
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                <th className="text-left px-4 py-3 font-semibold">Categoria</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gym-subtle">Nenhum lançamento</td></tr>
              ) : filtered.map((f, i) => (
                <tr key={f.id || i} className="border-b border-gym-border/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{f.description}</td>
                  <td className="px-4 py-3 text-gym-muted">{f.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${f.type === "receita" ? "text-gym-green" : "text-gym-red"}`}>
                      {f.type === "receita" ? "Receita" : "Despesa"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{f.date ? new Date(f.date).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className={`px-4 py-3 text-right font-bold text-tabular ${f.type === "receita" ? "text-gym-green" : "text-gym-red"}`}>
                    {f.type === "despesa" ? "- " : "+ "}{fmt(f.value || 0)}
                  </td>
                  <td className="px-4 py-3">
                    {!demo && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(f)} className="text-gym-subtle hover:text-white p-1 rounded transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(f.id)} className="text-gym-red/50 hover:text-gym-red p-1 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gym-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? "Editar Lançamento" : "Novo Lançamento"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gym-subtle hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className={labelClass}>Tipo</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className={inputClass}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className={inputClass}>
                  {["Mensalidade","Matrícula","Avulso","Aluguel","Equipe","Marketing","Manutenção","Despesas Gerais","Outro"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Descrição *</label><input required value={form.description} onChange={e => setForm({...form, description: e.target.value})} className={inputClass} /></div>
              <div><label className={labelClass}>Valor (R$) *</label><input required type="number" step="0.01" value={form.value} onChange={e => setForm({...form, value: e.target.value})} className={inputClass} /></div>
              <div><label className={labelClass}>Data *</label><input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className={inputClass} /></div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className={inputClass}>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas.</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold">{editing ? "Salvar" : "Criar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}