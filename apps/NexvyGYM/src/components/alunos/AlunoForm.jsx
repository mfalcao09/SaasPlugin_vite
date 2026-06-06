import { useState } from "react";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useRealData } from "@/lib/useRealData";

export default function AlunoForm({ student, academyId, demo, onSave, onClose }) {
  const [form, setForm] = useState({
    name: student?.name || "",
    phone: student?.phone || "",
    email: student?.email || "",
    birthdate: student?.birthdate || "",
    plan_name: student?.plan_name || "",
    plan_id: student?.plan_id || "",
    status: student?.status || "ativo",
    start_date: student?.start_date || new Date().toISOString().slice(0, 10),
    expiry_date: student?.expiry_date || "",
    observations: student?.observations || "",
  });
  const [saving, setSaving] = useState(false);

  const { data: plans } = useRealData("Plan", demo ? null : academyId);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gym-border flex items-center justify-between sticky top-0 bg-[#18181B]">
          <h2 className="text-lg font-bold text-white">{student ? "Editar Aluno" : "Novo Aluno"}</h2>
          <button onClick={onClose} className="text-gym-subtle hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Nome completo *</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={inputClass} placeholder="(11) 99999-0000" />
            </div>
            <div>
              <label className={labelClass}>E-mail</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Data de Nascimento</label>
              <input type="date" value={form.birthdate} onChange={e => setForm({...form, birthdate: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className={inputClass}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Plano</label>
              {!demo && plans.length > 0 ? (
                <select value={form.plan_id} onChange={e => {
                  const plan = plans.find(p => p.id === e.target.value);
                  setForm({...form, plan_id: e.target.value, plan_name: plan?.name || ""});
                }} className={inputClass}>
                  <option value="">Selecionar plano...</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — R$ {p.value?.toFixed(2)}</option>)}
                </select>
              ) : (
                <input value={form.plan_name} onChange={e => setForm({...form, plan_name: e.target.value})} className={inputClass} placeholder="Nome do plano" />
              )}
            </div>
            <div>
              <label className={labelClass}>Data de Início</label>
              <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Vencimento</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Observações</label>
              <textarea value={form.observations} onChange={e => setForm({...form, observations: e.target.value})} rows={2} className={inputClass + " resize-none"} />
            </div>
          </div>

          {demo && (
            <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">
              ⚡ Modo Demo — alterações não serão salvas no banco.
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold transition-all">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold transition-all disabled:opacity-60">
              {saving ? "Salvando..." : student ? "Salvar Alterações" : "Cadastrar Aluno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelClass = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";