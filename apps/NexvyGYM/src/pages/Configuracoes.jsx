import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, Loader2 } from "lucide-react";
import { useAcademy } from "@/lib/AcademyContext";
import { demoAcademy } from "@/lib/demoData";

const inputClass = "w-full bg-[#111114] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelClass = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

export default function Configuracoes() {
  const { demo } = useOutletContext() || {};
  const { academy, updateAcademy } = useAcademy();

  const src = demo ? demoAcademy : (academy || {});
  const [form, setForm] = useState({
    name: src.name || "",
    phone: src.phone || "",
    email: src.email || "",
    address: src.address || "",
    hours: src.hours || "",
    primary_color: src.primary_color || "#F97316",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (demo) { setSaved(true); setTimeout(() => setSaved(false), 2000); return; }
    setSaving(true);
    await updateAcademy(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
    <div className="bg-white border border-gym-border rounded-xl shadow-sm">
      <div className="p-5 border-b border-gym-border">
        <h3 className="font-semibold text-gym-text">Dados da Academia</h3>
      </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div><label className={labelClass}>Nome da Academia</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Telefone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={inputClass} placeholder="(11) 99999-0000" /></div>
            <div><label className={labelClass}>E-mail</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Endereço</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Horários de Funcionamento</label><textarea value={form.hours} onChange={e => setForm({...form, hours: e.target.value})} rows={2} className={inputClass + " resize-none"} /></div>
          <div>
            <label className={labelClass}>Cor Principal</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color} onChange={e => setForm({...form, primary_color: e.target.value})}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gym-border bg-transparent" />
              <span className="text-sm text-gym-muted">{form.primary_color}</span>
            </div>
          </div>

          {demo && <div className="bg-gym-yellow/10 border border-gym-yellow/20 rounded-lg p-3 text-xs text-gym-yellow">⚡ Modo Demo — alterações não serão salvas no banco.</div>}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : saved ? "✓ Salvo!" : <><Save className="w-4 h-4" /> Salvar Alterações</>}
            </button>
          </div>
        </form>
      </div>

      {/* Plan info */}
      <div className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gym-text mb-3">Plano Atual</h3>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold uppercase px-3 py-1.5 rounded-lg ${(src.plan_name || "starter") === "pro" ? "bg-gym-purple/12 text-gym-purple" : "bg-gym-blue/12 text-gym-blue"}`}>
            {(src.plan_name || "Starter").toUpperCase()}
          </span>
          <span className="text-gym-muted text-sm">GymBoss AI Academy OS</span>
        </div>
      </div>
    </div>
  );
}