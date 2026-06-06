import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select } from "@/components/app/FormField";
import { Plus, Loader2, Mail, Phone, Shield, Wrench, Headphones, DollarSign, UserCheck, UserX } from "lucide-react";

const PAPEIS = [
  { value: "admin",      label: "Admin da Oficina",         icon: Shield,      bg: "var(--brand-subtle)", fg: "var(--brand)" },
  { value: "tecnico",    label: "Técnico / Mecânico",       icon: Wrench,      bg: "#DBEAFE", fg: "#1E40AF" },
  { value: "atendimento",label: "Atendimento / Recepção",   icon: Headphones,  bg: "#D1FAE5", fg: "#065F46" },
  { value: "financeiro", label: "Financeiro / Admin",       icon: DollarSign,  bg: "#FEF3C7", fg: "#92400E" },
  { value: "user",       label: "Acesso padrão",            icon: UserCheck,   bg: "#F3F4F6", fg: "#4B5563" },
];

const papelConfig = (role) => PAPEIS.find(p => p.value === role) || PAPEIS[PAPEIS.length - 1];

export default function Equipe() {
  useDocumentTitle("Equipe | AutoFlow AI");
  const { empresa, loading: loadingEmpresa } = useTenantEmpresa();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState({ email: "", role: "tecnico" });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.User.list();
      setUsers(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const convidar = async () => {
    if (!form.email.trim()) return;
    setSaving(true); setError("");
    try {
      // Convida o usuário com o papel atribuído
      await base44.users.inviteUser(form.email.trim(), form.role);
      
      // IMPORTANTE: Após o convite, o usuário precisará vincular-se à empresa
      // Isso pode ser feito no onboarding do novo usuário ou através de uma etapa extra
      
      setModal(false);
      setForm({ email: "", role: "tecnico" });
      load();
    } catch (e) {
      setError(e?.message || "Erro ao convidar usuário.");
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (userId, role) => {
    await base44.entities.User.update(userId, { role });
    load();
  };

  if (loadingEmpresa || loading) return (
    <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>
  );

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Equipe</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{users.length} membros</p>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Convidar membro
        </button>
      </div>

      {/* Papéis legend */}
      <div className="flex flex-wrap gap-2">
        {PAPEIS.map(p => (
          <span key={p.value} className="text-[11px] px-2 py-1 rounded-sm font-semibold"
            style={{ backgroundColor: p.bg, color: p.fg }}>
            {p.label}
          </span>
        ))}
      </div>

      {/* Grid */}
      {users.length === 0 ? (
        <div className="text-center py-16 rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>Nenhum membro ainda.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {users.map(u => {
            const pc = papelConfig(u.role);
            const Icon = pc.icon;
            return (
              <div key={u.id} className="rounded-sm border p-5"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                      style={{ backgroundColor: "var(--brand)" }}>
                      {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>
                        {u.full_name || u.email}
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold inline-flex items-center gap-1"
                        style={{ backgroundColor: pc.bg, color: pc.fg }}>
                        <Icon className="w-3 h-3" /> {pc.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-[12px] mb-4" style={{ color: "var(--ink-muted)" }}>
                  {u.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{u.email}</div>}
                </div>

                {/* Role changer */}
                <div className="pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--ink-muted)" }}>Papel</label>
                  <select value={u.role || "user"} onChange={e => updateRole(u.id, e.target.value)}
                    className="w-full rounded-sm border px-3 py-2 text-[12px] focus:outline-none"
                    style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}>
                    {PAPEIS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal convite */}
      <Modal open={modal} onClose={() => { setModal(false); setError(""); }} title="Convidar membro">
        <div className="space-y-4">
          <FormField label="E-mail do convidado" required>
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="colaborador@email.com" />
          </FormField>
          <FormField label="Papel inicial">
            <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {PAPEIS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </FormField>
          {error && <p className="text-[12px]" style={{ color: "var(--status-red-fg)" }}>{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setModal(false); setError(""); }}
              className="px-4 py-2 rounded-sm text-[13px] font-semibold border"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>Cancelar</button>
            <button onClick={convidar} disabled={saving || !form.email.trim()}
              className="px-4 py-2 rounded-sm text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Enviando..." : "Enviar convite"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}