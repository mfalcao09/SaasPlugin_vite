/**
 * Reset de senha via token (link de /esqueci-senha).
 */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hashPassword } from "@/lib/tenantAuth";

export default function ResetSenha() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token");
  const [userId, setUserId] = useState(null);
  const [form, setForm] = useState({ nova: "", confirmar: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) { setError("Token inválido ou ausente."); setLoading(false); return; }
      try {
        const allUsers = await base44.entities.EmpresaUser.list();
        const user = allUsers.find(u => u.token_reset === token);
        if (!user) { setError("Token inválido ou já utilizado."); setLoading(false); return; }
        if (new Date(user.token_reset_expira_em) < new Date()) {
          setError("Token expirado. Solicite um novo link."); setLoading(false); return;
        }
        setUserId(user.id);
      } catch {
        setError("Erro ao validar token.");
      }
      setLoading(false);
    };
    validate();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.nova.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    if (form.nova !== form.confirmar) { setError("As senhas não coincidem."); return; }
    setSaving(true);
    try {
      const newHash = await hashPassword(form.nova);
      await base44.entities.EmpresaUser.update(userId, {
        senha_hash: newHash,
        forcar_troca_senha: false,
        token_reset: null,
        token_reset_expira_em: null,
      });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch {
      setError("Erro ao redefinir senha. Tente novamente.");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--surface)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ backgroundColor: "var(--brand)" }}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--ink)" }}>AutoFlow AI</span>
        </div>
        <div className="rounded border p-7" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
          <h1 className="text-xl font-black mb-1" style={{ color: "var(--ink)" }}>Redefinir senha</h1>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>
          ) : error && !userId ? (
            <>
              <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{error}</div>
              <Link to="/esqueci-senha" className="text-sm font-medium" style={{ color: "var(--brand)" }}>Solicitar novo link</Link>
            </>
          ) : success ? (
            <div className="rounded px-3 py-2 text-sm" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>Senha redefinida! Redirecionando...</div>
          ) : (
            <>
              {error && <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{error}</div>}
              <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>Defina sua nova senha de acesso.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {["nova", "confirmar"].map(field => (
                  <div key={field}>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-muted)" }}>
                      {field === "nova" ? "Nova senha" : "Confirmar senha"}
                    </label>
                    <input type="password" required minLength={8} value={form[field]}
                      onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none"
                      style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                      placeholder="••••••••" />
                  </div>
                ))}
                <button type="submit" disabled={saving}
                  className="w-full py-2.5 rounded-sm text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "var(--brand)" }}>
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : "Redefinir senha"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}