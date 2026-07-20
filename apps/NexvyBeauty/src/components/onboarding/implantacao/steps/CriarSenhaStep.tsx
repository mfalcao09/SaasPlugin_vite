// ─── Etapa FINAL do wizard público: "Falta só criar sua senha" ──────────────
//
// Por que existe: até aqui o único acesso era o link do e-mail. Quem terminava
// o wizard NUNCA definia senha e, se o navegador já tinha OUTRA sessão aberta
// (o caso real: super_admin), o redirecionamento final caía no painel da conta
// errada. Esta tela fecha os dois buracos, nesta ordem:
//   1) define a senha na edge pública `onboarding-set-password` (prova de posse
//      = token do link + session_token da sessão corrente do wizard);
//   2) derruba QUALQUER sessão anterior DESTE navegador (signOut local);
//   3) entra com o e-mail master + a senha recém-criada.
//
// A edge QUEIMA o token ao definir a senha (revoked_at) — o link não abre mais.
// Por isso esta é a última tela e não existe caminho de volta pro wizard.
//
// Só é montada no fluxo PÚBLICO por token. No fluxo logado (AdminImplantacao)
// a pessoa já tem sessão e senha — lá o wizard termina direto na Home.

import { useState, type FC, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isNetworkError, withNetworkRetry } from '@/hooks/useImplantacao';
import { maskEmail } from '@/lib/utils';

/** Espelha o MIN_PASSWORD da edge — validar aqui evita ida à rede à toa. */
const MIN_PASSWORD = 10;

const ERRO_GENERICO = 'Não conseguimos criar sua senha agora. Tente de novo em alguns instantes.';
const ERRO_REDE = 'Sem conexão com a internet. Sua configuração está salva — tente de novo.';

// Códigos que a edge devolve no campo `error` → português humano.
const ERROS: Record<string, string> = {
  invalid_token: 'Este link não é mais válido. Fale com a Lia no WhatsApp que ela te envia um novo.',
  link_revoked: 'Este link não é mais válido. Fale com a Lia no WhatsApp que ela te envia um novo.',
  expired_token: 'Este link não é mais válido. Fale com a Lia no WhatsApp que ela te envia um novo.',
  session_mismatch: 'Esta janela perdeu a sessão do link. Recarregue a página e tente de novo.',
  weak_password: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`,
  user_not_found: 'Não encontramos o cadastro do seu acesso. Fale com a Lia no WhatsApp.',
  owner_email_not_found: 'Não encontramos o e-mail da sua compra. Fale com a Lia no WhatsApp.',
  password_update_failed: ERRO_GENERICO,
  lookup_failed: ERRO_GENERICO,
  internal_error: ERRO_GENERICO,
};

/** FunctionsHttpError esconde o corpo real ({ error }) dentro da Response. */
async function readErrorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  try {
    const body = await ctx?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* corpo ilegível → cai no genérico */
  }
  return 'internal_error';
}

export const CriarSenhaStep: FC<{
  token: string;
  sessionToken: string;
  /** E-mail da compra (acesso master) — exibido MASCARADO. */
  ownerEmail?: string | null;
}> = ({ token, sessionToken, ownerEmail }) => {
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enviando) return; // trava duplo clique / duplo Enter

    // (a) validação local — erro de senha não gasta rede.
    if (senha.length < MIN_PASSWORD) {
      setErro(ERROS.weak_password);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais. Confira e tente de novo.');
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      // (b) define a senha. Retry SÓ em falha de rede (Wi-Fi de salão oscila);
      // erro de negócio (token queimado, sessão trocada) sobe na hora.
      const data = await withNetworkRetry(async () => {
        const { data: d, error } = await supabase.functions.invoke('onboarding-set-password', {
          body: { token, session_token: sessionToken, password: senha },
        });
        if (error) throw error;
        return d as { ok: boolean; email: string };
      });

      // (d) A sessão anterior deste navegador (super_admin, sócia, outro
      // tenant) precisa MORRER antes do login — é ela que fazia o wizard
      // terminar no painel da conta errada. Escopo local: derruba só ESTE
      // navegador, não as outras sessões da pessoa.
      await supabase.auth.signOut({ scope: 'local' });

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: senha,
      });

      // (f) senha criada mas login não entrou (raro): não deixa a pessoa no
      // escuro — a senha JÁ vale, ela só entra pela tela de login.
      if (signInError) {
        toast.success('Senha criada!', {
          description: 'Entre com o e-mail da sua compra e a senha que você acabou de criar.',
        });
        navigate('/login', { replace: true });
        return;
      }

      // (e) agora sim: logada na conta do próprio espaço.
      navigate('/', { replace: true });
    } catch (err) {
      const codigo = isNetworkError(err) ? 'rede' : await readErrorCode(err);

      // Canto ruim do retry: se a 1ª tentativa CHEGOU na edge e só a resposta
      // se perdeu, o token já foi queimado e a 2ª volta 'link_revoked' — com a
      // senha JÁ criada e válida. Antes de acusar erro, tenta entrar com ela.
      if (codigo === 'link_revoked') {
        await supabase.auth.signOut({ scope: 'local' });
        const { error: tardioErr } = await supabase.auth.signInWithPassword({
          email: ownerEmail ?? '',
          password: senha,
        });
        if (!tardioErr) {
          navigate('/', { replace: true });
          return;
        }
      }

      // (c) tradução PT-BR do código da edge.
      setErro(codigo === 'rede' ? ERRO_REDE : (ERROS[codigo] ?? ERRO_GENERICO));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto py-6 space-y-6">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Falta só criar sua senha</h2>
        <p className="text-muted-foreground leading-relaxed">
          Essa é a senha do seu acesso de <strong className="text-foreground">administradora</strong> do
          espaço — é com ela que você entra no painel daqui pra frente.
        </p>
      </div>

      {ownerEmail && (
        <div className="p-4 rounded-lg border-2 border-primary/40 bg-primary/5 space-y-1">
          <div className="text-xs text-muted-foreground">Seu e-mail de acesso</div>
          <div className="font-medium break-all">{maskEmail(ownerEmail)}</div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nova-senha" className="text-xs font-medium text-muted-foreground">Senha</Label>
          <div className="relative">
            <Input
              id="nova-senha"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
              placeholder={`Pelo menos ${MIN_PASSWORD} caracteres`}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setMostrar((v) => !v)}
              aria-label={mostrar ? 'Esconder senha' : 'Mostrar senha'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirma-senha" className="text-xs font-medium text-muted-foreground">Confirmar senha</Label>
          <Input
            id="confirma-senha"
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmacao}
            onChange={(ev) => setConfirmacao(ev.target.value)}
            placeholder="Digite a senha de novo"
          />
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive leading-relaxed">{erro}</p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando sua senha...</>
          : <>Criar senha e entrar</>}
      </Button>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Só você tem essa senha — nem a gente consegue vê-la. Guarde num lugar seguro.
      </p>
    </form>
  );
};

export default CriarSenhaStep;
