import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Plus, Trash2, Loader2, Save, ArrowLeft, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useSuperAdmin } from "@/lib/useSuperAdmin";

const inputClass = "w-full bg-white border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle";
const labelClass = "text-xs text-gym-muted uppercase tracking-wide mb-1 block font-semibold";

export default function AdminConfig() {
  const navigate = useNavigate();
  const { user, isSuperAdmin, appConfig, loading: authLoading } = useSuperAdmin();

  const [extraEmails, setExtraEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (appConfig) {
      setExtraEmails(appConfig.super_admin_emails || []);
    }
  }, [appConfig]);

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <Loader2 className="w-6 h-6 text-gym-orange animate-spin" />
      </div>
    );
  }

  if (!user) {
    base44.auth.redirectToLogin(window.location.href);
    return null;
  }

  if (!isSuperAdmin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="text-center p-6">
          <p className="text-gym-muted text-sm mb-4">Acesso restrito ao Super Admin.</p>
          <button onClick={() => navigate("/app/dashboard")}
            className="bg-gym-orange text-white font-semibold px-6 py-3 rounded-xl">
            Ir para meu painel
          </button>
        </div>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    if (appConfig?.id) {
      await base44.entities.AppConfig.update(appConfig.id, { super_admin_emails: extraEmails });
    } else {
      await base44.entities.AppConfig.create({ super_admin_emails: extraEmails });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function addEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || extraEmails.includes(trimmed)) return;
    setExtraEmails(prev => [...prev, trimmed]);
    setNewEmail("");
  }

  function removeEmail(email) {
    setExtraEmails(prev => prev.filter(e => e !== email));
  }

  return (
    <div className="min-h-screen bg-gym-surface p-6 font-inter">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/master")}
            className="p-2 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text bg-white transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gym-purple/12 rounded-xl flex items-center justify-center">
              <Shield className="w-4 h-4 text-gym-purple" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gym-text">Configurações de Super Admin</h1>
              <p className="text-xs text-gym-muted">Gerencie quem tem acesso ao Painel Master</p>
            </div>
          </div>
        </div>

        {/* Super Admin Principal */}
        <div className="bg-white border border-gym-border/30 rounded-xl p-5 shadow-sm">
          <label className={labelClass}>Super Admin Principal (Proprietário)</label>
          <div className="flex items-center gap-3 p-3 bg-gym-surface rounded-lg border border-gym-border/30">
            <div className="w-8 h-8 rounded-full bg-gym-purple/12 flex items-center justify-center text-gym-purple text-xs font-bold">
              {(user?.full_name || user?.email || "?")[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-gym-text">{user?.full_name || user?.email}</div>
              <div className="text-xs text-gym-subtle">{user?.email} — role: admin (não pode ser removido)</div>
            </div>
          </div>
        </div>

        {/* Super Admins Adicionais */}
        <div className="bg-white border border-gym-border/30 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <label className={labelClass}>Super Admins Adicionais</label>
            <p className="text-xs text-gym-subtle mb-3">Esses usuários também terão acesso ao Painel Master.</p>
          </div>

          {extraEmails.length === 0 && (
            <p className="text-sm text-gym-subtle italic">Nenhum admin adicional cadastrado.</p>
          )}

          <div className="space-y-2">
            {extraEmails.map(email => (
              <div key={email} className="flex items-center justify-between p-3 bg-gym-surface rounded-lg border border-gym-border/30">
                <span className="text-sm text-gym-text font-mono">{email}</span>
                <button onClick={() => removeEmail(email)}
                  className="text-gym-red hover:opacity-70 transition-opacity">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add email */}
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEmail()}
              placeholder="novo@superadmin.com"
              className={inputClass}
            />
            <button onClick={addEmail}
              className="flex items-center gap-1.5 bg-gym-purple hover:bg-gym-purple/80 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60">
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
            ) : saved ? (
              <><CheckCircle2 className="w-4 h-4" /> Salvo!</>
            ) : (
              <><Save className="w-4 h-4" /> Salvar alterações</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}