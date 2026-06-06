/**
 * Troca de senha obrigatória (ou voluntária) para usuários tenant.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { verifyPassword, hashPassword } from "@/lib/tenantAuth";
import { useTenantAuth } from "@/lib/TenantAuthContext";

export default function TrocarSenha() {
  const navigate = useNavigate();
  const { tenantSession, tenantLogin, tenantEmpresa } = useTenantAuth();
  const [form, setForm] = useState({ atual: "", nova: "", confirmar: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.nova.length < 8) { setError("A nova senha deve ter pelo menos 8 caracteres."); return; }
    if (form.nova !== form.confirmar) { setError("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const users = await base44.entities.EmpresaUser.list();
      const user = users.find(u => u.id === tenantSession?.empresa_user_id);
      if (!user) { setError("Usuário não encontrado."); setLoading(false); return; }

      const valid = await verifyPassword(form.atual, user.senha_hash);
      if (!valid) { setError("Senha atual incorreta."); setLoading(false); return; }

      const newHash = await hashPassword(form.nova);
      await base44.entities.EmpresaUser.update(user.id, {
        senha_hash: newHash,
        forcar_troca_senha: false,
      });

      setSuccess(true);
      // Atualizar sessão para remover flag
      tenantLogin({ ...tenantSession, forcar_troca_senha: false }, tenantEmpresa);
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch {
      setError("Erro ao trocar senha. Tente novamente.");
    }
    setLoading(false);
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
          <h1 className="text-xl font-black mb-1" style={{ color: "var(--ink)" }}>Trocar senha</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
            {tenantSession?.forcar_troca_senha ? "É necessário trocar sua senha antes de continuar." : "Atualize sua senha de acesso."}
          </p>
          {error && <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{error}</div>}
          {success && <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>Senha atualizada! Redirecionando...</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {["atual", "nova", "confirmar"].map((field) => (
              <div key={field}>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-muted)" }}>
                  {field === "atual" ? "Senha atual" : field === "nova" ? "Nova senha" : "Confirmar nova senha"}
                </label>
                <input type="password" required value={form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none"
                  style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                  placeholder="••••••••" minLength={field !== "atual" ? 8 : undefined}
                />
              </div>
            ))}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-sm text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--brand)" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : "Trocar senha"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}