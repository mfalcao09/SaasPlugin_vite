import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { verifyPassword, saveSession } from "@/lib/tenantAuth";

export default function TenantLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const users = await base44.entities.AcademyUser.filter({
        user_email: email.trim().toLowerCase(),
        status: "active",
      });

      if (users.length === 0) {
        setError("Usuário não encontrado ou inativo.");
        setLoading(false);
        return;
      }

      const academyUser = users[0];

      if (!academyUser.senha_hash) {
        setError("Conta sem senha configurada. Contate o administrador.");
        setLoading(false);
        return;
      }

      const valid = await verifyPassword(password, academyUser.senha_hash);
      if (!valid) {
        setError("Senha incorreta.");
        setLoading(false);
        return;
      }

      // Atualiza ultimo_login
      const now = new Date().toISOString();
      await base44.entities.AcademyUser.update(academyUser.id, { ultimo_login: now, last_access: now });

      // Atualiza ultimo_acesso_owner se for owner
      if (academyUser.role === "owner") {
        await base44.entities.Academy.update(academyUser.academy_id, { ultimo_acesso_owner: now });
      }

      saveSession({
        academy_id: academyUser.academy_id,
        academy_user_id: academyUser.id,
        role: academyUser.role,
        user_email: academyUser.user_email,
        full_name: academyUser.full_name || "",
      });

      if (academyUser.forcar_troca_senha) {
        navigate("/trocar-senha");
      } else {
        navigate("/app/dashboard");
      }
    } catch (err) {
      setError("Erro ao fazer login. Tente novamente.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gym-surface flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gym-orange rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-white font-bold text-2xl">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gym-text">GymBoss AI</h1>
          <p className="text-gym-muted text-sm mt-1">Entre na sua conta</p>
        </div>

        <div className="bg-white border border-gym-border/30 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-gym-surface border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gym-surface border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-gym-orange transition-colors"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-subtle hover:text-gym-muted">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-gym-red/10 border border-gym-red/20 text-gym-red text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
            </button>

            <div className="text-center">
              <a href="/esqueci-senha" className="text-xs text-gym-muted hover:text-gym-orange transition-colors">
                Esqueci minha senha
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}