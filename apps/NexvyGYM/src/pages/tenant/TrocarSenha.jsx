import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hashPassword, verifyPassword, getSession } from "@/lib/tenantAuth";

export default function TrocarSenha() {
  const navigate = useNavigate();
  const session = getSession();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [showAtual, setShowAtual] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!session) {
    navigate("/login");
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (nova.length < 8) { setError("A nova senha deve ter ao menos 8 caracteres."); return; }
    if (nova !== confirma) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    const user = await base44.entities.AcademyUser.filter({ id: session.academy_user_id });
    if (!user.length) { setError("Sessão inválida."); setLoading(false); return; }

    const valid = await verifyPassword(atual, user[0].senha_hash);
    if (!valid) { setError("Senha atual incorreta."); setLoading(false); return; }

    const novoHash = await hashPassword(nova);
    await base44.entities.AcademyUser.update(session.academy_user_id, {
      senha_hash: novoHash,
      forcar_troca_senha: false,
    });

    setSuccess(true);
    setTimeout(() => navigate("/app/dashboard"), 1500);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gym-surface flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gym-orange rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-white font-bold text-2xl">G</span>
          </div>
          <h1 className="text-xl font-bold text-gym-text">Trocar Senha</h1>
          <p className="text-gym-muted text-sm mt-1">Crie uma nova senha para sua conta</p>
        </div>

        <div className="bg-white border border-gym-border/30 rounded-2xl p-6 shadow-sm">
          {success ? (
            <div className="text-center py-4">
              <div className="text-gym-green text-lg font-semibold mb-2">✓ Senha alterada!</div>
              <p className="text-gym-muted text-sm">Redirecionando...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: "Senha atual", val: atual, set: setAtual, show: showAtual, toggle: () => setShowAtual(!showAtual) },
                { label: "Nova senha", val: nova, set: setNova, show: showNova, toggle: () => setShowNova(!showNova) },
                { label: "Confirmar nova senha", val: confirma, set: setConfirma, show: showNova, toggle: () => setShowNova(!showNova) },
              ].map(({ label, val, set, show, toggle }) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">{label}</label>
                  <div className="relative">
                    <input type={show ? "text" : "password"} required value={val} onChange={e => set(e.target.value)}
                      className="w-full bg-gym-surface border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
                    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-subtle">
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}

              {error && <div className="bg-gym-red/10 border border-gym-red/20 text-gym-red text-sm rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={loading}
                className="w-full bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : "Alterar senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}