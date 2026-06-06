import { useEffect, useState } from "react";
import { Plus, X, Search, CheckSquare, BarChart3, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Checkin, type Student } from "@/lib/db";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const MODALIDADES = [
  "Musculação", "Funcional", "Pilates", "Yoga", "Spinning",
  "Natação", "Crossfit", "Dança", "Artes Marciais", "Studio",
];

const emptyForm = { student_id: "", modality: "Musculação", professor: "", notes: "" };

export default function Checkins() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentError, setStudentError] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [cRes, sRes] = await Promise.all([
      db.checkins.list(aid),
      db.students.list(aid),
    ]);
    setCheckins((cRes.data as Checkin[]) ?? []);
    setStudents((sRes.data as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  const filtered = checkins.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.student_nome || "").toLowerCase().includes(q) ||
      (c.date || "").includes(search) ||
      (c.modality || "").toLowerCase().includes(q)
    );
  });

  const todayCheckins = checkins.filter((c) => c.date === today);

  const matchedStudents = studentSearch.length >= 2
    ? students.filter((s) =>
        s.nome.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (s.telefone || "").includes(studentSearch)
      )
    : [];

  function selectStudent(s: Student) {
    setStudentError("");
    setForm((f) => ({ ...f, student_id: s.id }));
    setStudentSearch(s.nome);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;

    const student = students.find((s) => s.id === form.student_id);
    if (!student) { setStudentError("Selecione um aluno válido da lista."); return; }
    if (student.status !== "ativo") {
      setStudentError(`Aluno "${student.nome}" está ${student.status}. Check-in não permitido.`);
      return;
    }

    const now = new Date();
    await db.checkins.create({
      ...form,
      academia_id: aid,
      student_nome: student.nome,
      date: today,
      time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    } as Omit<Checkin, "id" | "created_at">);

    load();
    setShowForm(false);
    setForm(emptyForm);
    setStudentSearch("");
    setStudentError("");
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
            placeholder="Buscar por aluno, data ou modalidade..."
            className="w-full bg-[#18181B] border border-gym-border text-gym-text rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors"
          />
        </div>
        <button
          onClick={() => { setForm(emptyForm); setStudentSearch(""); setStudentError(""); setShowForm(true); }}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Registrar Check-in
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-bold text-gym-green text-tabular">{todayCheckins.length}</div>
              <div className="text-sm text-gym-muted mt-1">Check-ins hoje</div>
            </div>
            <div className="w-9 h-9 bg-gym-green/12 rounded-lg flex items-center justify-center">
              <CheckSquare className="w-4 h-4 text-gym-green" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-bold text-gym-orange text-tabular">{checkins.length}</div>
              <div className="text-sm text-gym-muted mt-1">Total registrados</div>
            </div>
            <div className="w-9 h-9 bg-gym-orange/12 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-gym-orange" />
            </div>
          </div>
        </div>
      </div>

      {/* Check-ins de hoje */}
      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-gym-orange" />
          <h3 className="font-semibold text-gym-text">
            Hoje —{" "}
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
        </div>
        <div className="divide-y divide-gym-border/30">
          {todayCheckins.length === 0 ? (
            <div className="p-6 text-center text-gym-subtle text-sm">Nenhum check-in registrado hoje</div>
          ) : (
            todayCheckins.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gym-surface/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gym-green/12 flex items-center justify-center text-gym-green text-xs font-bold">
                    {(c.student_nome || "?")[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gym-text">{c.student_nome}</div>
                    <div className="text-xs text-gym-muted">{c.modality || "—"} • Prof. {c.professor || "—"}</div>
                  </div>
                </div>
                <div className="text-xs text-gym-muted text-tabular">{c.time || "—"}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Histórico */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30">
            <h3 className="font-semibold text-gym-text text-sm">
              Histórico{search ? ` — "${search}"` : ""}{" "}
              <span className="text-gym-subtle font-normal">({filtered.length})</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                  <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                  <th className="text-left px-4 py-3 font-semibold">Data</th>
                  <th className="text-left px-4 py-3 font-semibold">Hora</th>
                  <th className="text-left px-4 py-3 font-semibold">Modalidade</th>
                  <th className="text-left px-4 py-3 font-semibold">Professor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gym-subtle">Nenhum resultado</td></tr>
                ) : (
                  filtered.slice(0, 50).map((c, i) => (
                    <tr key={c.id} className={`border-b border-gym-border/30 hover:bg-gym-surface/30 ${i % 2 !== 0 ? "bg-gym-surface/10" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-gym-text">{c.student_nome || "—"}</td>
                      <td className="px-4 py-2.5 text-gym-muted text-tabular">
                        {c.date ? new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gym-muted text-tabular">{c.time || "—"}</td>
                      <td className="px-4 py-2.5 text-gym-muted">{c.modality || "—"}</td>
                      <td className="px-4 py-2.5 text-gym-muted">{c.professor || "—"}</td>
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
              <h2 className="font-semibold text-gym-text">Registrar Check-in</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gym-subtle hover:text-gym-text" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="relative">
                <label className={labelCls}>Buscar Aluno *</label>
                <input
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setForm((f) => ({ ...f, student_id: "" }));
                    setStudentError("");
                  }}
                  className={inputCls}
                  placeholder="Digite nome ou telefone (mín. 2 chars)"
                  autoComplete="off"
                />
                {matchedStudents.length > 0 && !form.student_id && (
                  <div className="absolute z-10 w-full mt-1 bg-[#1e1e21] border border-gym-border rounded-xl shadow-xl overflow-hidden">
                    {matchedStudents.slice(0, 6).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudent(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gym-surface/20 text-left transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-gym-orange/12 flex items-center justify-center text-gym-orange text-xs font-bold flex-shrink-0">
                          {s.nome[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gym-text">{s.nome}</div>
                          <div className="text-xs text-gym-muted">{s.telefone || s.email || "—"} • {s.status}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {studentError && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gym-red">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {studentError}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Modalidade</label>
                <select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} className={inputCls}>
                  {MODALIDADES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Professor</label>
                <input value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} className={inputCls} placeholder="Nome do professor" />
              </div>
              <div>
                <label className={labelCls}>Observações</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} placeholder="Opcional" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
