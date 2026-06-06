import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Schedule, type Student } from "@/lib/db";
import StatusBadge from "@/components/ui/StatusBadge";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// JS getDay(): 0=dom,1=seg,...,6=sab → índice do array DAYS (0=seg,...,6=dom)
const JS_DAY_TO_IDX: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

const emptyForm = {
  student_id: "",
  student_nome: "",
  type: "Avaliação Inicial" as Schedule["type"],
  date: "",
  time: "",
  professor: "",
  notes: "",
  status: "agendado" as Schedule["status"],
};

const STATUS_CARD: Record<string, string> = {
  agendado: "bg-gym-blue/10 border-gym-blue/30 text-gym-blue",
  "concluído": "bg-gym-green/10 border-gym-green/30 text-gym-green",
  cancelado: "bg-gym-red/10 border-gym-red/30 text-gym-red",
};

export default function Agenda() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewMode, setViewMode] = useState<"lista" | "semana">("lista");

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [sRes, stRes] = await Promise.all([
      db.schedules.list(aid),
      db.students.list(aid),
    ]);
    setSchedules((sRes.data as Schedule[]) ?? []);
    setStudents((stRes.data as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(s: Schedule) {
    setEditing(s);
    setForm({
      student_id: s.student_id,
      student_nome: s.student_nome || "",
      type: s.type,
      date: s.date,
      time: s.time,
      professor: s.professor || "",
      notes: s.notes || "",
      status: s.status,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const student = students.find((s) => s.id === form.student_id);
    const data = {
      ...form,
      student_nome: student?.nome || form.student_nome,
      academia_id: aid,
    };
    if (editing) {
      await db.schedules.update(editing.id, data);
    } else {
      await db.schedules.create(data as Omit<Schedule, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover agendamento?")) return;
    await db.schedules.delete(id);
    load();
  }

  async function markConcluido(id: string) {
    await db.schedules.update(id, { status: "concluído" });
    load();
  }

  const upcoming = [...schedules]
    .filter((s) => s.status === "agendado")
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.time > b.time ? 1 : -1));

  const past = [...schedules]
    .filter((s) => s.status !== "agendado")
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  const byDayIndex = (idx: number) =>
    schedules.filter((s) => {
      if (!s.date) return false;
      const jsDay = new Date(s.date + "T00:00:00").getDay();
      return JS_DAY_TO_IDX[jsDay] === idx;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["lista", "semana"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === v
                  ? "bg-gym-orange text-white"
                  : "border border-gym-border text-gym-muted hover:text-gym-text"
              }`}
            >
              {v === "lista" ? "Lista" : "Semana"}
            </button>
          ))}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      {viewMode === "semana" ? (
        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((day, idx) => {
            const items = byDayIndex(idx);
            return (
              <div key={day} className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm min-h-[180px]">
                <div className="px-2 py-2 border-b border-gym-border/30 bg-gym-surface">
                  <div className="text-xs font-semibold text-gym-text">{day}</div>
                  <div className="text-[10px] text-gym-subtle">{items.length} agend.</div>
                </div>
                <div className="p-1.5 space-y-1">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => openEdit(s)}
                      className={`rounded-lg border px-2 py-1.5 cursor-pointer hover:opacity-75 transition-opacity text-[10px] ${STATUS_CARD[s.status] ?? ""}`}
                    >
                      <div className="font-semibold truncate">{s.student_nome || "—"}</div>
                      <div className="opacity-80">{s.time} • {s.type}</div>
                      {s.professor && <div className="opacity-60 truncate">Prof. {s.professor}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Próximos */}
          <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gym-orange" />
              <h3 className="font-semibold text-gym-text">
                Próximos <span className="text-gym-subtle font-normal text-sm">({upcoming.length})</span>
              </h3>
            </div>
            <div className="divide-y divide-gym-border/30">
              {upcoming.length === 0 ? (
                <div className="p-6 text-center text-gym-subtle text-sm">Nenhum agendamento futuro</div>
              ) : (
                upcoming.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-4 hover:bg-gym-surface/40">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[44px]">
                        <div className="text-gym-orange font-bold text-lg text-tabular">
                          {new Date(s.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit" })}
                        </div>
                        <div className="text-gym-subtle text-[10px]">
                          {new Date(s.date + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" })}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-gym-text text-sm">{s.student_nome || "—"}</div>
                        <div className="text-xs text-gym-muted">
                          {s.type} • {s.time} • Prof. {s.professor || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <button
                        onClick={() => markConcluido(s.id)}
                        className="text-xs text-gym-green border border-gym-green/30 px-2 py-1 rounded hover:bg-gym-green/10 transition-all"
                      >
                        Concluir
                      </button>
                      <button onClick={() => openEdit(s)} className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="text-gym-red/70 hover:text-gym-red border border-gym-red/20 p-1.5 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {past.length > 0 && (
            <div className="bg-white border border-gym-border/40 rounded-xl overflow-hidden shadow-sm opacity-70">
              <div className="px-4 py-3 border-b border-gym-border/30">
                <h3 className="font-semibold text-gym-text text-sm">
                  Histórico <span className="text-gym-subtle font-normal">({past.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-gym-border/30">
                {past.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-medium text-gym-text text-sm">{s.student_nome || "—"}</div>
                      <div className="text-xs text-gym-muted">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("pt-BR")} • {s.time} • {s.type}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border">
              <h2 className="font-semibold text-gym-text">
                {editing ? "Editar Agendamento" : "Novo Agendamento"}
              </h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gym-subtle hover:text-gym-text" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Aluno *</label>
                <select
                  required
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Selecione o aluno</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tipo *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as Schedule["type"] })}
                  className={inputCls}
                >
                  <option>Avaliação Inicial</option>
                  <option>Retorno de Avaliação</option>
                  <option>Consulta</option>
                  <option>Aula Experimental</option>
                  <option>Outro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data *</label>
                  <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Horário *</label>
                  <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Professor</label>
                <input value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} className={inputCls} placeholder="Nome do professor" />
              </div>
              {editing && (
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Schedule["status"] })} className={inputCls}>
                    <option value="agendado">Agendado</option>
                    <option value="concluído">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls + " resize-none"} rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all">{editing ? "Salvar" : "Agendar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
