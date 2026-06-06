import { useEffect, useState } from "react";
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Pencil, Trash2, AlertCircle } from "lucide-react";
import { useAcademy } from "@/lib/AcademyContext";
import { db, type Financial, type Student } from "@/lib/db";
import StatusBadge from "@/components/ui/StatusBadge";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const CATEGORIAS_RECEITA = ["Mensalidade", "Matrícula", "Avaliação", "Personal", "Produto", "Outros"];
const CATEGORIAS_DESPESA = ["Aluguel", "Equipe", "Marketing", "Manutenção", "Energia", "Despesas Gerais", "Outros"];

const emptyForm = {
  tipo: "receita" as Financial["tipo"],
  descricao: "",
  valor: "",
  data: new Date().toISOString().slice(0, 10),
  categoria: "Mensalidade",
  status_pagamento: "pago" as Financial["status_pagamento"],
  student_id: "",
};

export default function Financeiro() {
  const { academy } = useAcademy();
  const aid = academy?.id ?? "";

  const [financial, setFinancial] = useState<Financial[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Financial | null>(null);
  const [filter, setFilter] = useState<"todos" | "receita" | "despesa" | "pendente">("todos");
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [fRes, sRes] = await Promise.all([
      db.financial.list(aid),
      db.students.list(aid),
    ]);
    setFinancial((fRes.data as Financial[]) ?? []);
    setStudents((sRes.data as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  const totalReceitas = financial
    .filter((f) => f.tipo === "receita")
    .reduce((s, f) => s + (f.valor || 0), 0);
  const totalDespesas = financial
    .filter((f) => f.tipo === "despesa")
    .reduce((s, f) => s + (f.valor || 0), 0);
  const saldo = totalReceitas - totalDespesas;
  const pendente = financial
    .filter((f) => f.tipo === "receita" && f.status_pagamento === "pendente")
    .reduce((s, f) => s + (f.valor || 0), 0);

  const inadimplentes = students.filter(
    (s) =>
      s.status === "ativo" &&
      financial.some(
        (f) => f.student_id === s.id && f.tipo === "receita" && f.status_pagamento === "pendente"
      )
  );

  const filtered = financial.filter((f) => {
    if (filter === "receita") return f.tipo === "receita";
    if (filter === "despesa") return f.tipo === "despesa";
    if (filter === "pendente") return f.status_pagamento === "pendente";
    return true;
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(f: Financial) {
    setEditing(f);
    setForm({
      tipo: f.tipo,
      descricao: f.descricao,
      valor: String(f.valor),
      data: f.data,
      categoria: f.categoria || "Mensalidade",
      status_pagamento: f.status_pagamento,
      student_id: f.student_id || "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const data = {
      ...form,
      valor: parseFloat(form.valor) || 0,
      academia_id: aid,
      student_id: form.student_id || undefined,
    };
    if (editing) {
      await db.financial.update(editing.id, data);
    } else {
      await db.financial.create(data as Omit<Financial, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover lançamento?")) return;
    await db.financial.delete(id);
    load();
  }

  async function marcarPago(id: string) {
    await db.financial.update(id, { status_pagamento: "pago" });
    load();
  }

  const fmt = (v: number) =>
    `R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const categorias = form.tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: "Receitas", value: totalReceitas, color: "text-gym-green", bg: "bg-gym-green/12" },
          { icon: TrendingDown, label: "Despesas", value: totalDespesas, color: "text-gym-red", bg: "bg-gym-red/12" },
          {
            icon: DollarSign,
            label: "Saldo",
            value: saldo,
            color: saldo >= 0 ? "text-gym-green" : "text-gym-red",
            bg: saldo >= 0 ? "bg-gym-green/12" : "bg-gym-red/12",
          },
          { icon: AlertCircle, label: "A Receber", value: pendente, color: "text-gym-yellow", bg: "bg-gym-yellow/12" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-xl font-bold text-tabular ${color}`}>{fmt(value)}</div>
            <div className="text-sm text-gym-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Alerta de inadimplência */}
      {inadimplentes.length > 0 && (
        <div className="bg-gym-yellow/5 border border-gym-yellow/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-gym-yellow" />
            <h3 className="font-semibold text-gym-text text-sm">
              Inadimplência — {inadimplentes.length} aluno{inadimplentes.length !== 1 ? "s" : ""} com pagamento pendente
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {inadimplentes.map((s) => (
              <span
                key={s.id}
                className="text-xs bg-gym-yellow/15 text-gym-yellow border border-gym-yellow/30 px-2.5 py-1 rounded-full"
              >
                {s.nome}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["todos", "receita", "despesa", "pendente"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === v
                  ? "bg-gym-orange text-white"
                  : "border border-gym-border text-gym-muted hover:text-gym-text"
              }`}
            >
              {v === "todos" ? "Todos" : v === "receita" ? "Receitas" : v === "despesa" ? "Despesas" : "Pendentes"}
            </button>
          ))}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Lançamento
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                <th className="text-left px-4 py-3 font-semibold">Categoria</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-left px-4 py-3 font-semibold">Valor</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gym-subtle">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((f, i) => (
                  <tr
                    key={f.id}
                    className={`border-b border-gym-border/30 hover:bg-gym-surface/30 ${i % 2 !== 0 ? "bg-gym-surface/10" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.tipo === "receita" ? "bg-gym-green" : "bg-gym-red"}`} />
                        <span className="font-medium text-gym-text truncate max-w-[200px]">{f.descricao}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gym-muted">{f.categoria || "—"}</td>
                    <td className="px-4 py-3 text-gym-muted text-tabular">
                      {f.data ? new Date(f.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className={`px-4 py-3 font-semibold text-tabular ${f.tipo === "receita" ? "text-gym-green" : "text-gym-red"}`}>
                      {f.tipo === "despesa" ? "−" : "+"}{fmt(f.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status_pagamento} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {f.status_pagamento === "pendente" && (
                          <button
                            onClick={() => marcarPago(f.id)}
                            className="text-xs text-gym-green border border-gym-green/30 px-2 py-1 rounded hover:bg-gym-green/10 transition-all"
                          >
                            Pago
                          </button>
                        )}
                        <button onClick={() => openEdit(f)} className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="text-gym-red/70 hover:text-gym-red border border-gym-red/20 p-1.5 rounded transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border sticky top-0 bg-[#18181B]">
              <h2 className="font-semibold text-gym-text">{editing ? "Editar Lançamento" : "Novo Lançamento"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gym-subtle hover:text-gym-text" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="flex gap-2">
                {(["receita", "despesa"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t, categoria: t === "receita" ? "Mensalidade" : "Aluguel" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      form.tipo === t
                        ? t === "receita"
                          ? "bg-gym-green/15 border border-gym-green/40 text-gym-green"
                          : "bg-gym-red/15 border border-gym-red/40 text-gym-red"
                        : "border border-gym-border text-gym-muted"
                    }`}
                  >
                    {t === "receita" ? "Receita" : "Despesa"}
                  </button>
                ))}
              </div>
              <div>
                <label className={labelCls}>Descrição *</label>
                <input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className={inputCls} placeholder="Ex: Mensalidade Lucas Ferreira" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Valor (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inputCls} placeholder="149.90" />
                </div>
                <div>
                  <label className={labelCls}>Data *</label>
                  <input required type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className={inputCls}>
                  {categorias.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              {form.tipo === "receita" && (
                <div>
                  <label className={labelCls}>Aluno (opcional)</label>
                  <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className={inputCls}>
                    <option value="">Selecione o aluno</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status_pagamento} onChange={(e) => setForm({ ...form, status_pagamento: e.target.value as Financial["status_pagamento"] })} className={inputCls}>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all">{editing ? "Salvar" : "Lançar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
