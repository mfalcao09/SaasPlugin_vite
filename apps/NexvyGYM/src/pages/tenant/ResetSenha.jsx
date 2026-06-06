import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hashPassword } from "@/lib/tenantAuth";

export default function ResetSenha() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token");

  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function validate() {
      if (!token) { setError("Token inválido."); setValidating(false); return; }
      const users = await base44.entities.AcademyUser.filter({ token_reset: token });
      if (!users.length) { setError("Token inválido ou expirado."); setValidating(false); return; }
      const u = users[0];
      if (!u.token_reset_expira_em || new Date(u.token_reset_expira_em) < new Date()) {
        setError("Token expirado. Solicite um novo link."); setValidating(false); return;
      }
      setUser(u);
      setValidating(false);
    }
    validate();
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (nova.length < 8) { setError("Mínimo 8 caracteres."); return; }
    if (nova !== confirma) { setError("As senhas não coincidem."); return; }
    setLoading(true);
    const hash = await hashPassword(nova);
    await base44.entities.AcademyUser.update(user.id, {
      senha_hash: hash,
      forcar_troca_senha: false,
      token_reset: null,
      token_reset_expira_em: null,
    });
    setSuccess(true);
    setTimeout(() => navigate("/login"), 2000);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gym-surface flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gym-orange rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-white font-bold text-2xl">G</span>
          </div>
          <h1 className="text-xl font-bold text-gym-text">Redefinir Senha</h1>
        </div>

        <div className="bg-white border border-gym-border/30 rounded-2xl p-6 shadow-sm">
          {validating ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-gym-orange animate-spin" /></div>
          ) : error && !user ? (
            <div className="text-center space-y-3">
              <div className="bg-gym-red/10 border border-gym-red/20 text-gym-red text-sm rounded-lg px-3 py-2">{error}</div>
              <a href="/esqueci-senha" className="text-xs text-gym-muted hover:text-gym-orange block">Solicitar novo link</a>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="text-gym-green text-lg font-semibold mb-2">✓ Senha redefinida!</div>
              <p className="text-gym-muted text-sm">Redirecionando para o login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: "Nova senha", val: nova, set: setNova },
                { label: "Confirmar senha", val: confirma, set: setConfirma },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">{label}</label>
                  <div className="relative">
                    <input type={show ? "text" : "password"} required value={val} onChange={e => set(e.target.value)}
                      className="w-full bg-gym-surface border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-gym-orange" />
                    <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-subtle">
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              {error && <div className="bg-gym-red/10 border border-gym-red/20 text-gym-red text-sm rounded-lg px-3 py-2">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : "Redefinir senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}