import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, X, Pencil } from "lucide-react";
import { demoTeam } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/ui/StatusBadge";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelClass = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const roleLabel = { admin: "Admin", professor: "Professor", recepcao: "Recepção", financeiro: "Financeiro" };
const roleColor = { admin: "text-gym-purple", professor: "text-gym-orange", recepcao: "text-gym-blue", financeiro: "text-gym-green" };

const emptyForm = { name: "", user_email: "", role: "professor", specialty: "", active: true };

export default function Equipe() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realTeam, reload } = useRealData("TeamMember", academyId);
  const team = demo ? demoTeam : realTeam;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({ name: t.name, user_email: t.user_email || t.email || "", role: t.role, specialty: t.specialty || "", active: t.active !== false });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setShowForm(false); return; }
    setSaving(true);
    if (editing) {
      await base44.entities.TeamMember.update(editing.id, { ...form });
    } else {
      await base44.entities.TeamMember.create({ ...form, academy_id: academyId });
      try { await base44.users.inviteUser(form.user_email, "user"); } catch {}
    }
    reload();
    setSaving(false);
    setShowForm(false);
  }

  async function toggleActive(t) {
    if (demo) return;
    await base44.entities.TeamMember.update(t.id, { active: !t.active });
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Adicionar Colaborador
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.length === 0 ? (
          <div className="col-span-3 text-center py-16 text-gym-subtle">Nenhum membro na equipe</div>
        ) : team.map((t, i) => (
          <div key={t.id || i} className="bg-white border border-gym-border rounded-xl p-5 flex items-start gap-4 hover:shadow-md transition-all shadow-sm">
            <div className="w-12 h-12 rounded-full bg-gym-orange/12 flex items-center justify-center text-gym-orange font-bold text-lg flex-shrink-0">
              {(t.name || "?")[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{t.name}</div>
              <div className={`text-xs font-semibold mt-0.5 ${roleColor[t.role] || "text-gym-muted"}`}>{roleLabel[t.role] || t.role}</div>
              {t.specialty && <div className="text-xs text-gym-subtle mt-1">{t.specialty}</div>}
              <div className="text-xs text-gym-subtle mt-1 truncate">{t.user_email || t.email || "—"}</div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={t.active !== false ? "ativo" : "inativo"} />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(t)} className="flex items-center gap-1 text-xs text-gym-muted hover:text-white border border-gym-border/50 px-2 py-1 rounded transition-all">
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                {!demo && (
                  <button onClick={() => toggleActive(t)} className={`text-xs border px-2 py-1 rounded transition-all ${t.active !== false ? "text-gym-red/70 hover:text-gym-red border-gym-red/20" : "text-gym-green border-gym-green/30 hover:bg-gym-green/10"}`}>
                    {t.active !== false ? "Desativar" : "Ativar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gym-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? "Editar Colaborador" : "Adicionar Colaborador"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gym-subtle hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div><label className={labelClass}>Nome *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} /></div>
              <div>
                <label className={labelClass}>E-mail *</label>
                <input required type="email" value={form.user_email} onChange={e => setForm({...form, user_email: e.target.value})} className={inputClass} disabled={!!editing} />
                {editing && <p className="text-xs text-gym-subtle mt-1">E-mail não pode ser alterado após o cadastro.</p>}
              </div>
              <div>
                <label className={labelClass}>Papel</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className={inputClass}>
                  <option value="admin">Admin</option>
                  <option value="professor">Professor</option>
                  <option value="recepcao">Recepção</option>
                  <option value="financeiro">Financeiro</option>
                </select>
              </div>
              <div><label className={labelClass}>Especialidade</label><input value={form.specialty} onChange={e => setForm({...form, specialty: e.target.value})} className={inputClass} /></div>
              {editing && (
                <div className="flex items-center gap-3">
                  <label className={labelClass + " mb-0"}>Status</label>
                  <select value={form.active ? "ativo" : "inativo"} onChange={e => setForm({...form, active: e.target.value === "ativo"})} className="bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gym-orange">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              )}
              {!demo && !editing && <div className="bg-gym-blue/10 border border-gym-blue/20 rounded-lg p-3 text-xs text-gym-blue">Um convite será enviado para o e-mail informado.</div>}
              {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas.</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold disabled:opacity-60">
                  {saving ? "Salvando..." : editing ? "Salvar" : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}