import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { generateToken } from "@/lib/tenantAuth";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const users = await base44.entities.AcademyUser.filter({
      user_email: email.trim().toLowerCase(),
      status: "active",
    });

    if (users.length === 0) {
      // Não revelar se existe ou não
      setLink("placeholder");
      setLoading(false);
      return;
    }

    const token = generateToken();
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await base44.entities.AcademyUser.update(users[0].id, {
      token_reset: token,
      token_reset_expira_em: expira,
    });

    const url = `${window.location.origin}/reset-senha?token=${token}`;
    setLink(url);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gym-surface flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gym-orange rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-white font-bold text-2xl">G</span>
          </div>
          <h1 className="text-xl font-bold text-gym-text">Esqueci a Senha</h1>
          <p className="text-gym-muted text-sm mt-1">Informe seu e-mail para redefinir</p>
        </div>

        <div className="bg-white border border-gym-border/30 rounded-2xl p-6 shadow-sm">
          {link ? (
            <div className="space-y-3">
              <p className="text-sm text-gym-text font-semibold">Link de redefinição gerado:</p>
              <div className="bg-gym-surface border border-gym-border/50 rounded-lg p-3 break-all text-xs font-mono text-gym-muted select-all">
                {link === "placeholder" ? "Se o e-mail existir, um link foi gerado. Contate o administrador." : link}
              </div>
              {link !== "placeholder" && (
                <button onClick={() => navigator.clipboard.writeText(link)}
                  className="w-full bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg text-sm transition-all">
                  Copiar link
                </button>
              )}
              <p className="text-xs text-gym-subtle text-center">Válido por 24 horas</p>
              <a href="/login" className="block text-center text-xs text-gym-muted hover:text-gym-orange">
                Voltar ao login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">E-mail</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-gym-surface border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
              </div>
              {error && <div className="bg-gym-red/10 border border-gym-red/20 text-gym-red text-sm rounded-lg px-3 py-2">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-60">
                {loading ? "Gerando link..." : "Gerar link de redefinição"}
              </button>
              <a href="/login" className="block text-center text-xs text-gym-muted hover:text-gym-orange">Voltar ao login</a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}