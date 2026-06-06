import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { demoPlans } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/ui/StatusBadge";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelClass = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

export default function Planos() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realPlans, reload } = useRealData("Plan", academyId);
  const plans = demo ? demoPlans : realPlans;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", value: "", modality: "Musculação", recurrence: "mensal", status: "ativo", observations: "" });

  function openNew() {
    setEditing(null);
    setForm({ name: "", value: "", modality: "Musculação", recurrence: "mensal", status: "ativo", observations: "" });
    setShowForm(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({ name: p.name, value: p.value, modality: p.modality || "Musculação", recurrence: p.recurrence || "mensal", status: p.status || "ativo", observations: p.observations || "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setShowForm(false); return; }
    const data = { ...form, value: parseFloat(form.value), academy_id: academyId };
    if (editing) {
      await base44.entities.Plan.update(editing.id, data);
    } else {
      await base44.entities.Plan.create(data);
    }
    reload();
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (demo || !window.confirm("Remover plano?")) return;
    await base44.entities.Plan.delete(id);
    reload();
  }

  const recurrenceLabel = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", avulso: "Avulso" };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(p => (
          <div key={p.id} className="bg-white border border-gym-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-md transition-all shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-white text-lg">{p.name}</div>
                <div className="text-xs text-gym-subtle mt-1">{p.modality} • {recurrenceLabel[p.recurrence] || p.recurrence}</div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-3xl font-bold text-gym-orange text-tabular">
              R$ {(p.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            {p.observations && <p className="text-xs text-gym-muted">{p.observations}</p>}
            <div className="flex gap-2 mt-auto pt-2 border-t border-gym-border/30">
              <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1 text-xs text-gym-muted hover:text-white border border-gym-border/50 py-2 rounded-lg transition-all">
                <Pencil className="w-3 h-3" /> Editar
              </button>
              {!demo && (
                <button onClick={() => handleDelete(p.id)} className="flex items-center justify-center gap-1 text-xs text-gym-red/70 hover:text-gym-red border border-gym-red/20 px-3 py-2 rounded-lg transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="col-span-3 text-center py-16 text-gym-subtle">Nenhum plano cadastrado</div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gym-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? "Editar Plano" : "Novo Plano"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gym-subtle hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div><label className={labelClass}>Nome *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} /></div>
              <div><label className={labelClass}>Valor (R$) *</label><input required type="number" step="0.01" value={form.value} onChange={e => setForm({...form, value: e.target.value})} className={inputClass} /></div>
              <div>
                <label className={labelClass}>Modalidade</label>
                <select value={form.modality} onChange={e => setForm({...form, modality: e.target.value})} className={inputClass}>
                  {["Musculação","Funcional","Pilates","Yoga","Studio","CrossFit","Natação","Completo","Outro"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Recorrência</label>
                <select value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value})} className={inputClass}>
                  {["mensal","trimestral","semestral","anual","avulso"].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className={inputClass}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <div><label className={labelClass}>Observações</label><textarea value={form.observations} onChange={e => setForm({...form, observations: e.target.value})} rows={2} className={inputClass + " resize-none"} /></div>
              {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas.</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold">{editing ? "Salvar" : "Criar Plano"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}