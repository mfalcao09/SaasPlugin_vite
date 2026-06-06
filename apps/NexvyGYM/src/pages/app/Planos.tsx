import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Plan, type Student } from "@/lib/db";
import StatusBadge from "@/components/ui/StatusBadge";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const emptyForm = {
  nome: "",
  descricao: "",
  preco: "",
  duracao_dias: "30",
  modalidades: [] as string[],
  recorrencia: "mensal" as Plan["recorrencia"],
  ativo: true,
};

const MODALIDADES = [
  "Musculação", "Funcional", "Pilates", "Yoga", "Spinning",
  "Natação", "Crossfit", "Dança", "Artes Marciais", "Studio",
];
const RECORRENCIAS: { value: Plan["recorrencia"]; label: string }[] = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
  { value: "avulso", label: "Avulso" },
];

export default function Planos() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      db.plans.list(aid, false),
      db.students.list(aid),
    ]);
    setPlans((pRes.data as Plan[]) ?? []);
    setStudents((sRes.data as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  const countByPlan = (planId: string) =>
    students.filter((s) => s.plano_id === planId && s.status === "ativo").length;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      nome: p.nome,
      descricao: p.descricao || "",
      preco: String(p.preco),
      duracao_dias: String(p.duracao_dias),
      modalidades: p.modalidades || [],
      recorrencia: p.recorrencia || "mensal",
      ativo: p.ativo,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const data = {
      ...form,
      preco: parseFloat(form.preco) || 0,
      duracao_dias: parseInt(form.duracao_dias) || 30,
      academia_id: aid,
    };
    if (editing) {
      await db.plans.update(editing.id, data);
    } else {
      await db.plans.create(data as Omit<Plan, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover plano?")) return;
    await db.plans.delete(id);
    load();
  }

  async function toggleAtivo(p: Plan) {
    await db.plans.update(p.id, { ativo: !p.ativo });
    load();
  }

  function toggleModalidade(mod: string) {
    setForm((f) => ({
      ...f,
      modalidades: f.modalidades.includes(mod)
        ? f.modalidades.filter((m) => m !== mod)
        : [...f.modalidades, mod],
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.length === 0 ? (
          <div className="col-span-3 text-center py-16 text-gym-subtle">
            Nenhum plano cadastrado ainda
          </div>
        ) : (
          plans.map((p) => {
            const qtd = countByPlan(p.id);
            const recLabel = RECORRENCIAS.find((r) => r.value === p.recorrencia)?.label ?? p.recorrencia;
            return (
              <div
                key={p.id}
                className={`bg-white border rounded-xl p-5 flex flex-col gap-4 shadow-sm transition-all hover:shadow-md ${
                  p.ativo ? "border-gym-border" : "border-gym-border/40 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-gym-text text-lg">{p.nome}</div>
                    <div className="text-xs text-gym-subtle mt-0.5">
                      {recLabel} • {p.duracao_dias}d
                    </div>
                  </div>
                  <StatusBadge status={p.ativo ? "ativo" : "inativo"} />
                </div>

                <div className="text-3xl font-bold text-gym-orange text-tabular">
                  R$ {(p.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>

                {p.modalidades && p.modalidades.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.modalidades.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 text-[11px] bg-gym-orange/10 text-gym-orange px-2 py-0.5 rounded-full"
                      >
                        <Tag className="w-2.5 h-2.5" /> {m}
                      </span>
                    ))}
                  </div>
                )}

                {p.descricao && (
                  <p className="text-xs text-gym-muted leading-relaxed">{p.descricao}</p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gym-border/30 mt-auto">
                  <span className="text-xs text-gym-muted">
                    <span className="font-semibold text-gym-text">{qtd}</span>{" "}
                    aluno{qtd !== 1 ? "s" : ""} ativo{qtd !== 1 ? "s" : ""}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleAtivo(p)}
                      title={p.ativo ? "Desativar" : "Ativar"}
                      className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all"
                    >
                      {p.ativo
                        ? <ToggleRight className="w-3.5 h-3.5 text-gym-green" />
                        : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      title="Editar"
                      className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      title="Remover"
                      className="text-gym-red/70 hover:text-gym-red border border-gym-red/20 p-1.5 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border sticky top-0 bg-[#18181B]">
              <h2 className="font-semibold text-gym-text">
                {editing ? "Editar Plano" : "Novo Plano"}
              </h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gym-subtle hover:text-gym-text" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Nome do Plano *</label>
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className={inputCls}
                  placeholder="Ex: Mensal Musculação"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Preço (R$) *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.preco}
                    onChange={(e) => setForm({ ...form, preco: e.target.value })}
                    className={inputCls}
                    placeholder="149.90"
                  />
                </div>
                <div>
                  <label className={labelCls}>Duração (dias) *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.duracao_dias}
                    onChange={(e) => setForm({ ...form, duracao_dias: e.target.value })}
                    className={inputCls}
                    placeholder="30"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Recorrência</label>
                <select
                  value={form.recorrencia}
                  onChange={(e) => setForm({ ...form, recorrencia: e.target.value as Plan["recorrencia"] })}
                  className={inputCls}
                >
                  {RECORRENCIAS.map((r) => (
                    <option key={r.value as string} value={r.value as string}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Modalidades incluídas</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {MODALIDADES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleModalidade(m)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        form.modalidades.includes(m)
                          ? "bg-gym-orange/15 border-gym-orange/40 text-gym-orange"
                          : "border-gym-border text-gym-muted hover:border-gym-orange/40"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className={inputCls + " resize-none"}
                  rows={2}
                  placeholder="Detalhe o que está incluído no plano..."
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ativo-plan"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 accent-gym-orange"
                />
                <label htmlFor="ativo-plan" className="text-sm text-gym-muted cursor-pointer">
                  Plano ativo (visível para novos alunos)
                </label>
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
                  {editing ? "Salvar" : "Criar Plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
