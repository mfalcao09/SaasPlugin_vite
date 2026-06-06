/**
 * Login local dos tenants — valida EmpresaUser (não usa User Base44).
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { verifyPassword } from "@/lib/tenantAuth";
import { useTenantAuth } from "@/lib/TenantAuthContext";

export default function LoginTenant() {
  const navigate = useNavigate();
  const { tenantLogin } = useTenantAuth();
  const [form, setForm] = useState({ email: "", senha: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      const allUsers = await base44.entities.EmpresaUser.list();
      const user = allUsers.find(u => u.email?.toLowerCase() === email && u.ativo !== false);

      if (!user) { setError("E-mail ou senha incorretos."); setLoading(false); return; }

      const valid = await verifyPassword(form.senha, user.senha_hash);
      if (!valid) { setError("E-mail ou senha incorretos."); setLoading(false); return; }

      // Buscar empresa
      const empresas = await base44.entities.Empresa.list();
      const empresa = empresas.find(e => e.id === user.empresa_id);
      if (!empresa || empresa.status === "inativo") {
        setError("Empresa inativa ou não encontrada. Contate o suporte.");
        setLoading(false);
        return;
      }

      // Atualizar ultimo_login
      await base44.entities.EmpresaUser.update(user.id, { ultimo_login: new Date().toISOString() });

      // Atualizar ultimo_acesso_owner se for owner
      if (user.role === "owner") {
        await base44.entities.Empresa.update(empresa.id, { ultimo_acesso_owner: new Date().toISOString() });
      }

      tenantLogin({
        empresa_id: user.empresa_id,
        empresa_user_id: user.id,
        role: user.role,
        nome: user.nome,
        email: user.email,
        forcar_troca_senha: user.forcar_troca_senha,
      }, empresa);

      if (user.forcar_troca_senha) {
        navigate("/trocar-senha");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError("Erro ao fazer login. Tente novamente.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--surface)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ backgroundColor: "var(--brand)" }}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--ink)" }}>AutoFlow AI</span>
        </div>

        <div className="rounded border p-7" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
          <h1 className="text-xl font-black mb-1" style={{ color: "var(--ink)" }}>Entrar na sua conta</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>Acesse o painel da sua oficina</p>

          {error && (
            <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-muted)" }}>E-mail</label>
              <input
                type="email" required autoFocus
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none"
                style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-muted)" }}>Senha</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"} required
                  value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                  className="w-full rounded-sm border px-3 py-2 pr-9 text-[13px] focus:outline-none"
                  style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-faint)" }}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-sm text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--brand)" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/esqueci-senha" className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>
              Esqueci minha senha
            </Link>
          </div>
        </div>

        <p className="text-center text-[11px] mt-4" style={{ color: "var(--ink-faint)" }}>
          Administrador?{" "}
          <Link to="/adminmaster" className="underline" style={{ color: "var(--ink-muted)" }}>Painel Master</Link>
        </p>
      </div>
    </div>
  );
}