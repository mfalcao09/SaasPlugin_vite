/**
 * Esqueci a senha — gera token_reset e exibe link copiável.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Loader2, Copy, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { generateToken } from "@/lib/tenantAuth";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const allUsers = await base44.entities.EmpresaUser.list();
      const user = allUsers.find(u => u.email?.toLowerCase() === email.trim().toLowerCase() && u.ativo !== false);
      if (!user) {
        // Resposta genérica por segurança
        setResetLink("NOTFOUND");
        setLoading(false);
        return;
      }
      const token = generateToken();
      const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await base44.entities.EmpresaUser.update(user.id, {
        token_reset: token,
        token_reset_expira_em: expira,
      });
      const link = `${window.location.origin}/reset-senha?token=${token}`;
      setResetLink(link);
    } catch {
      setError("Erro ao processar. Tente novamente.");
    }
    setLoading(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (resetLink) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--surface)" }}>
        <div className="w-full max-w-sm">
          <div className="rounded border p-7" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <CheckCircle2 className="w-8 h-8 mb-3" style={{ color: "#059669" }} />
            <h1 className="text-xl font-black mb-2" style={{ color: "var(--ink)" }}>
              {resetLink === "NOTFOUND" ? "Verifique seu e-mail" : "Link gerado!"}
            </h1>
            {resetLink === "NOTFOUND" ? (
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Se o e-mail existir no sistema, um link de redefinição será exibido aqui.</p>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>
                  Compartilhe este link com o usuário. Expira em 24h.
                </p>
                <div className="rounded-sm border p-3 mb-3 break-all text-xs" style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink-2)" }}>
                  {resetLink}
                </div>
                <button onClick={copy}
                  className="w-full py-2 rounded-sm text-sm font-bold flex items-center justify-center gap-2 border"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                  {copied ? <><CheckCircle2 className="w-4 h-4" style={{ color: "#059669" }} /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar link</>}
                </button>
              </>
            )}
            <div className="mt-4 text-center">
              <Link to="/login" className="text-sm font-medium" style={{ color: "var(--brand)" }}>Voltar ao login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-black mb-1" style={{ color: "var(--ink)" }}>Esqueci minha senha</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>Informe seu e-mail para gerar o link de redefinição.</p>
          {error && <div className="rounded px-3 py-2 mb-4 text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-muted)" }}>E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none"
                style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                placeholder="seu@email.com" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-sm text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--brand)" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : "Gerar link de redefinição"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/login" className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>Voltar ao login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}