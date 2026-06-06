import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, X, Search, CheckSquare, BarChart3 } from "lucide-react";
import { demoCheckins, demoStudents } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";

export default function Checkins() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realCheckins, reload } = useRealData("Checkin", academyId, {}, "-date");
  const { data: students } = useRealData("Student", academyId);
  const checkins = demo ? demoCheckins : realCheckins;

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ student_id: "", student_name: "", modality: "Musculação", professor: "", notes: "" });

  const today = new Date().toISOString().slice(0, 10);
  const filtered = checkins.filter(c =>
    (c.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.date || "").includes(search)
  );

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setShowForm(false); return; }
    await base44.entities.Checkin.create({
      ...form,
      academy_id: academyId,
      date: today,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
    reload();
    setShowForm(false);
    setForm({ student_id: "", student_name: "", modality: "Musculação", professor: "", notes: "" });
  }

  const todayCount = checkins.filter(c => c.date === today).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por aluno ou data..."
            className="w-full bg-[#18181B] border border-gym-border text-white rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Registrar Check-in
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="text-3xl font-bold text-gym-green text-tabular">{todayCount}</div>
              <div className="text-sm text-gym-muted mt-1">Check-ins hoje</div>
            </div>
            <div className="w-9 h-9 bg-gym-green/12 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckSquare className="w-4 h-4 text-gym-green" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="text-3xl font-bold text-gym-orange text-tabular">{checkins.length}</div>
              <div className="text-sm text-gym-muted mt-1">Total registrados</div>
            </div>
            <div className="w-9 h-9 bg-gym-orange/12 rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 text-gym-orange" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-left px-4 py-3 font-semibold">Horário</th>
                <th className="text-left px-4 py-3 font-semibold">Modalidade</th>
                <th className="text-left px-4 py-3 font-semibold">Professor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gym-subtle">Nenhum check-in encontrado</td></tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id || i} className="border-b border-gym-border/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gym-green/12 flex items-center justify-center text-gym-green text-xs font-bold">{(c.student_name || "?")[0]}</div>
                      <span className="font-medium text-white">{c.student_name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{c.date ? new Date(c.date).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{c.time || "—"}</td>
                  <td className="px-4 py-3 text-gym-muted">{c.modality || "—"}</td>
                  <td className="px-4 py-3 text-gym-muted">{c.professor || "—"}</td>
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
              <h2 className="text-lg font-bold text-white">Registrar Check-in</h2>
              <button onClick={() => setShowForm(false)} className="text-gym-subtle hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Aluno *</label>
                {!demo && students.length > 0 ? (
                  <select required value={form.student_id} onChange={e => {
                    const s = students.find(x => x.id === e.target.value);
                    setForm({...form, student_id: e.target.value, student_name: s?.name || ""});
                  }} className={inputClass}>
                    <option value="">Selecionar aluno...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input required value={form.student_name} onChange={e => setForm({...form, student_name: e.target.value})} className={inputClass} placeholder="Nome do aluno" />
                )}
              </div>
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Modalidade</label>
                <select value={form.modality} onChange={e => setForm({...form, modality: e.target.value})} className={inputClass}>
                  {["Musculação","Funcional","Pilates","Yoga","Studio","CrossFit","Natação","Outro"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Professor</label>
                <input value={form.professor} onChange={e => setForm({...form, professor: e.target.value})} className={inputClass} />
              </div>
              {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas.</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}