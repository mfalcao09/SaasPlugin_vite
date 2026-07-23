import { useEffect, useState } from 'react';
import { Scale, LogIn, Loader2, AlertTriangle } from 'lucide-react';

// ============================================================================
// Página de acesso
//
// Não é enfeite: as policies de `atos`, `edicoes` e `fontes_diarios` exigem
// auth.uid() não-nulo. Sem sessão o banco não devolve UMA linha — a tela de
// acesso é pré-condição do produto, não etapa cerimonial.
//
// ⚠️  AUTENTICAÇÃO DE DESENVOLVIMENTO: escolhe-se a identidade, não há senha.
//     Em produção quem autentica é o Supabase Auth (JWT 15-60 min, §11.1) e
//     este componente vira o formulário de e-mail + senha dele. O aviso na
//     tela existe para que ninguém confunda isto com login de verdade.
// ============================================================================

export type Identidade = {
  auth_id: string; nome: string; email: string;
  instituicao_id: string; instituicao_nome: string; perfil: string;
};

type Disponivel = { email: string; nome: string; instituicao_nome: string };

export default function Acesso({ aoEntrar }: { aoEntrar: (i: Identidade) => void }) {
  const [opcoes, setOpcoes] = useState<Disponivel[]>([]);
  const [email, setEmail] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sessao/identidades')
      .then((r) => r.json())
      .then((d: Disponivel[]) => { setOpcoes(d); setEmail(d[0]?.email ?? ''); })
      .catch((e) => setErro((e as Error).message));
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const r = await fetch('/api/sessao/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
      aoEntrar(j as Identidade);
    } catch (e) {
      setErro((e as Error).message);
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Scale className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">DiárioMonitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão de atos normativos publicados em diários oficiais
          </p>
        </div>

        <form onSubmit={entrar} className="surface-card p-6">
          <label
            htmlFor="identidade"
            className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Entrar como
          </label>

          {opcoes.length > 0 ? (
            <select
              id="identidade"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {opcoes.map((o) => (
                <option key={o.email} value={o.email}>
                  {o.nome} — {o.instituicao_nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="identidade"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu e-mail institucional"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          )}

          {erro && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={entrando || !email}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {entrando
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando…</>
              : <><LogIn className="h-4 w-4" /> Entrar</>}
          </button>

          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            <b className="text-foreground">Acesso de desenvolvimento</b> — sem senha.
            O que você enxerga depois de entrar é o que a política do banco (RLS)
            permite à sua instituição. Em produção, a autenticação é a do
            Supabase Auth.
          </p>
        </form>
      </div>
    </div>
  );
}
