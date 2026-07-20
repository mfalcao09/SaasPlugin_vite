import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { translateAuthError } from '@/lib/auth-errors';

// Segurança: o form SÓ abre com sessão vinda do PRÓPRIO link (evento
// PASSWORD_RECOVERY). Uma sessão comum já logada no navegador NUNCA libera o
// form — senão um link expirado aberto num navegador logado trocaria a senha
// da conta logada (ex.: super admin), não a do destinatário do e-mail.
type Status = 'validating' | 'ready' | 'link_error';

function parseHashError(): string | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  if (!params.get('error') && !params.get('error_code')) return null;
  const code = params.get('error_code') ?? '';
  if (code === 'otp_expired') return 'Este link já foi usado ou expirou. Links de acesso valem uma única vez.';
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'Link inválido.';
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('validating');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // 1) Erro explícito no fragment (#error=...) — o Supabase redireciona assim
    //    quando o token do link é inválido/expirado. Nunca mostrar o form.
    const hashError = parseHashError();
    if (hashError) {
      setLinkError(hashError);
      setStatus('link_error');
      return;
    }

    // 2) Só o evento PASSWORD_RECOVERY (sessão criada pelo link agora) libera o
    //    form. SIGNED_IN genérico e sessão pré-existente NÃO liberam.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        setStatus('ready');
      }
    });

    // 3) Sem token no hash (acesso direto à URL) ou processamento que não vira
    //    recovery em 8s → estado de erro com reenvio.
    const hasToken = window.location.hash.includes('access_token') || window.location.hash.includes('token');
    timeoutRef.current = window.setTimeout(() => {
      setLinkError(
        hasToken
          ? 'Não foi possível validar o link. Ele pode ter expirado.'
          : 'Este endereço só funciona a partir do link enviado por e-mail.',
      );
      setStatus((s) => (s === 'ready' ? s : 'link_error'));
    }, hasToken ? 8000 : 1500);

    return () => {
      sub.subscription.unsubscribe();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error('A senha deve ter pelo menos 10 caracteres');
      return;
    }
    if (password !== confirm) {
      toast.error('As senhas não conferem');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success('Senha salva! Redirecionando...');
    navigate('/', { replace: true });
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email) return;
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success('Se este e-mail estiver cadastrado, um novo link chega em instantes.');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Definir senha</h2>
          <p className="text-muted-foreground mt-2">
            {status === 'ready' && 'Crie uma senha forte para sua conta'}
            {status === 'validating' && 'Validando seu link de acesso...'}
            {status === 'link_error' && (linkError ?? 'Link inválido.')}
          </p>
        </div>

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                  minLength={10}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres. Combine letras, números e símbolos.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                  minLength={10}
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Salvar nova senha
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>
        )}

        {status === 'validating' && (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {status === 'link_error' && (
          <form onSubmit={handleResend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-email">Receber um novo link</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="resend-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                />
              </div>
            </div>
            <Button type="submit" variant="outline" className="w-full h-12 text-base" disabled={resending}>
              {resending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enviar novo link'}
            </Button>
          </form>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-primary hover:underline text-sm"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
