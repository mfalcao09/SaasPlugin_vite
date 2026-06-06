import { useEffect, useState } from "react";
import { Users, Plus, Search, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Student, type Plan } from "@/lib/db";
import StatusBadge from "@/components/ui/StatusBadge";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const emptyForm = {
  nome: "",
  email: "",
  telefone: "",
  plano_id: "",
  status: "ativo" as Student["status"],
  data_vencimento: "",
  data_inicio: "",
};

export default function Alunos() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterPlan, setFilterPlan] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [sRes, pRes] = await Promise.all([
      db.students.list(aid),
      db.plans.list(aid),
    ]);
    setStudents((sRes.data as Student[]) ?? []);
    setPlans((pRes.data as Plan[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      s.nome.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.telefone || "").includes(search);
    const matchStatus = filterStatus === "todos" || s.status === filterStatus;
    const matchPlan = filterPlan === "todos" || s.plano_id === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      nome: s.nome,
      email: s.email || "",
      telefone: s.telefone || "",
      plano_id: s.plano_id || "",
      status: s.status,
      data_vencimento: s.data_vencimento || "",
      data_inicio: s.data_inicio || "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const selectedPlan = plans.find((p) => p.id === form.plano_id);
    const data = {
      ...form,
      academia_id: aid,
      plano_nome: selectedPlan?.nome || "",
    };
    if (editing) {
      await db.students.update(editing.id, data);
    } else {
      await db.students.create(data as Omit<Student, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover aluno?")) return;
    await db.students.delete(id);
    load();
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="w-full bg-[#18181B] border border-gym-border text-gym-text rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#18181B] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange"
        >
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="bloqueado">Bloqueados</option>
        </select>
        <select
          value={filterPlan}
          onChange={(e) => setFilterPlan(e.target.value)}
          className="bg-[#18181B] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange"
        >
          <option value="todos">Todos os planos</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Aluno
        </button>
      </div>

      <div className="text-sm text-gym-subtle">
        {filtered.length} aluno{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                  <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                  <th className="text-left px-4 py-3 font-semibold">Plano</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gym-subtle">
                      Nenhum aluno encontrado
                    </td>
                  </tr>
                ) : (
                  filtered.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-b border-gym-border/30 hover:bg-gym-surface/40 ${i % 2 !== 0 ? "bg-gym-surface/20" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gym-orange/12 flex items-center justify-center text-gym-orange font-bold text-xs">
                            {s.nome[0]}
                          </div>
                          <div>
                            <div className="font-medium text-gym-text">{s.nome}</div>
                            <div className="text-xs text-gym-subtle">{s.telefone || s.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gym-muted">{s.plano_nome || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-gym-muted text-tabular">
                        {s.data_vencimento
                          ? new Date(s.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(s)}
                            title="Editar"
                            className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            title="Remover"
                            className="text-gym-red/70 hover:text-gym-red border border-gym-red/20 p-1.5 rounded transition-all"
                          >
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
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gym-orange" />
                <h2 className="font-semibold text-gym-text">
                  {editing ? "Editar Aluno" : "Novo Aluno"}
                </h2>
              </div>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gym-subtle hover:text-gym-text" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Nome *</label>
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className={inputCls}
                  placeholder="Nome completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputCls}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    className={inputCls}
                    placeholder="(11) 99999-0000"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Plano</label>
                <select
                  value={form.plano_id}
                  onChange={(e) => setForm({ ...form, plano_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Selecione o plano</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data de Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Vencimento</label>
                  <input
                    type="date"
                    value={form.data_vencimento}
                    onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Student["status"] })}
                  className={inputCls}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all"
                >
                  {editing ? "Salvar" : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
