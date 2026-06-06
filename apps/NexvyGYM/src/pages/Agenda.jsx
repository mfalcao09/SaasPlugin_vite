import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, X, Pencil } from "lucide-react";
import { demoSchedule } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/ui/StatusBadge";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const emptyForm = { student_id: "", student_name: "", type: "Avaliação Inicial", date: "", time: "", professor: "", notes: "" };

export default function Agenda() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realSchedule, reload } = useRealData("Schedule", academyId, {}, "date");
  const { data: students } = useRealData("Student", academyId);
  const schedule = demo ? demoSchedule : realSchedule;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(s) {
    setEditing(s);
    setForm({ student_id: s.student_id || "", student_name: s.student_name, type: s.type, date: s.date, time: s.time, professor: s.professor || "", notes: s.notes || "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setShowForm(false); return; }
    if (editing) {
      await base44.entities.Schedule.update(editing.id, form);
    } else {
      await base44.entities.Schedule.create({ ...form, academy_id: academyId, status: "agendado" });
    }
    reload();
    setShowForm(false);
  }

  async function updateStatus(id, status) {
    if (demo) return;
    await base44.entities.Schedule.update(id, { status });
    reload();
  }

  const upcoming = schedule.filter(s => s.status === "agendado").sort((a, b) => a.date > b.date ? 1 : -1);
  const past = schedule.filter(s => s.status !== "agendado").sort((a, b) => a.date > b.date ? -1 : 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      {/* Upcoming */}
      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gym-border">
          <h3 className="font-semibold text-gym-text">Próximas Avaliações <span className="text-gym-subtle font-normal text-sm">({upcoming.length})</span></h3>
        </div>
        <div className="divide-y divide-gym-border/30">
          {upcoming.length === 0 ? (
            <div className="p-6 text-center text-gym-subtle text-sm">Nenhum agendamento próximo</div>
          ) : upcoming.map((s, i) => (
            <div key={s.id || i} className="flex items-center justify-between px-4 py-4 hover:bg-white/[0.02]">
              <div className="flex items-center gap-4">
                <div className="text-center min-w-[48px]">
                  <div className="text-gym-orange font-bold text-lg text-tabular">{s.date ? new Date(s.date).toLocaleDateString("pt-BR", { day: "2-digit" }) : "—"}</div>
                  <div className="text-gym-subtle text-xs">{s.date ? new Date(s.date).toLocaleDateString("pt-BR", { month: "short" }) : ""}</div>
                </div>
                <div>
                  <div className="font-medium text-white">{s.student_name}</div>
                  <div className="text-xs text-gym-subtle">{s.type} • {s.time} {s.professor ? `• Prof. ${s.professor}` : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                {!demo && (
                  <>
                    <button onClick={() => openEdit(s)} className="text-gym-subtle hover:text-white p-1 rounded transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => updateStatus(s.id, "concluído")} className="text-xs text-gym-green border border-gym-green/30 px-2 py-1 rounded hover:bg-gym-green/10 transition-all">Concluir</button>
                    <button onClick={() => updateStatus(s.id, "cancelado")} className="text-xs text-gym-red/70 border border-gym-red/20 px-2 py-1 rounded hover:bg-gym-red/10 transition-all">Cancelar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gym-border">
            <h3 className="font-semibold text-gym-text text-sm">Histórico</h3>
          </div>
          <div className="divide-y divide-gym-border/30">
            {past.slice(0, 20).map((s, i) => (
              <div key={s.id || i} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] opacity-60">
                <div>
                  <div className="text-sm font-medium text-white">{s.student_name}</div>
                  <div className="text-xs text-gym-subtle">{s.type} • {s.date ? new Date(s.date).toLocaleDateString("pt-BR") : "—"} • {s.time}</div>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gym-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? "Editar Agendamento" : "Novo Agendamento"}</h2>
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
                  <input required value={form.student_name} onChange={e => setForm({...form, student_name: e.target.value})} className={inputClass} />
                )}
              </div>
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Tipo *</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className={inputClass}>
                  {["Avaliação Inicial","Retorno de Avaliação","Consulta","Aula Experimental","Outro"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Data *</label>
                  <input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Horário *</label>
                  <input required type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Professor</label>
                <input value={form.professor} onChange={e => setForm({...form, professor: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Observações</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className={inputClass + " resize-none"} />
              </div>
              {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas.</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold">{editing ? "Salvar" : "Agendar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}