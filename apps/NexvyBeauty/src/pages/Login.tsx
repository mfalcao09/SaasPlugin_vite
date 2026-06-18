import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { translateAuthError } from '@/lib/auth-errors';

/* ============================================================
   BRAND — único ponto de customização por vertical.
   TODO: ligar ao platform_settings via usePlatformBranding no
   futuro (name/tagline/accent/backgroundImage/logoUrl dinâmicos).
   ============================================================ */
const BRAND = {
  name: 'NexvyBeauty',
  tagline: 'Beleza com gestão inteligente',
  accent: '#EC4899', // cor de destaque (rosa/magenta para beleza)
  backgroundImage: null as string | null, // sem poster (fundo neutro gradiente da marca)
  backgroundVideo: null as string | null, // sem vídeo (wordmark + fundo neutro — decisão de lançamento)
  logoUrl: null as string | null, // se null, renderiza o name estilizado como wordmark
  metrics: '+40% conversão · −50% tempo de resposta',
  bgHint: 'salão de beleza',
};

/* ---------- Helpers ---------- */
// Contraste AA no botão principal: texto escuro p/ accents claros, branco p/ escuros
function textOnAccent(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.3 ? '#0A0A0B' : '#FFFFFF';
}

// Fallback cinematográfico quando não há foto: luz do accent sobre garagem escura
function fallbackBg(accent: string): string {
  return [
    `radial-gradient(120% 90% at 18% 80%, color-mix(in oklab, ${accent} 20%, #0a0a0b) 0%, transparent 60%)`,
    `radial-gradient(90% 70% at 78% 8%, color-mix(in oklab, ${accent} 9%, #121214) 0%, transparent 55%)`,
    `repeating-linear-gradient(115deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 2px, transparent 2px, transparent 10px)`,
    `linear-gradient(160deg, #141417 0%, #0A0A0B 70%)`,
  ].join(', ');
}

/* ---------- Wordmark ---------- */
function Wordmark({ className = '' }: { className?: string }) {
  if (BRAND.logoUrl) {
    return <img src={BRAND.logoUrl} alt={BRAND.name} className={'h-8 w-auto ' + className} />;
  }
  return (
    <span className={'font-bold tracking-tight text-white ' + className}>
      {BRAND.name}
      <span style={{ color: 'var(--accent)' }}>.</span>
    </span>
  );
}

/* ---------- CSS custom do login (focus ring na accent + animações) ---------- */
const loginStyles = `
@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: no-preference) {
  .login-card-anim { animation: loginFadeUp .55s cubic-bezier(.22,.8,.32,1) both; }
  .login-brand-anim { animation: loginFadeUp .65s cubic-bezier(.22,.8,.32,1) .1s both; }
}
.nx-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
.nx-focusable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.nx-checkbox { accent-color: var(--accent); }
.nx-link { color: var(--accent); }
.nx-link:hover { filter: brightness(1.15); text-decoration: underline; }
`;

type View = 'login' | 'forgot';

export default function Login() {
  const [view, setView] = useState<View>('login');
  const [isLoading, setIsLoading] = useState(false);
  // Vídeo de fundo: só em desktop e sem prefers-reduced-motion (mobile/a11y caem na imagem/fallback)
  const [canPlayVideo] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // "Lembrar de mim": apenas visual + estado local (Supabase já persiste a sessão)
  const [remember, setRemember] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const accentText = textOnAccent(BRAND.accent);

  // Bootstrap idempotente do Super Admin padrão (no remix novo).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('vendus_bootstrap_attempted') === '1') return;
    sessionStorage.setItem('vendus_bootstrap_attempted', '1');
    supabase.functions.invoke('ensure-default-super-admin').catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(translateAuthError(error.message));
      } else {
        toast.success('Bem-vindo de volta!');
        navigate('/');
      }
    } catch (error) {
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Digite seu email');
      return;
    }
    setIsLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Mensagem genérica — não expõe se o email existe (anti-enumeração)
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const bgStyle: React.CSSProperties = BRAND.backgroundImage
    ? {
        backgroundImage: `url("${BRAND.backgroundImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundImage: fallbackBg(BRAND.accent) };

  return (
    <div
      className="min-h-dvh w-full bg-[#0A0A0B] text-zinc-100 lg:relative"
      style={{ '--accent': BRAND.accent } as React.CSSProperties}
    >
      <style>{loginStyles}</style>

      {/* ===== Imagem de fundo / header mobile ===== */}
      <div
        className="relative h-[30vh] min-h-[200px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0"
        style={bgStyle}
      >
        {/* Vídeo de fundo (opcional): loop mudo, poster = imagem, atrás dos overlays */}
        {BRAND.backgroundVideo && canPlayVideo && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={BRAND.backgroundVideo}
            poster={BRAND.backgroundImage ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        )}
        {/* Overlay: preto denso à esquerda/baixo → transparente */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.12) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 45%)',
          }}
        />

        {/* Wordmark + tagline + micro-métricas (canto inferior esquerdo) */}
        <div className="login-brand-anim absolute bottom-5 left-5 pr-4 lg:bottom-14 lg:left-14 lg:max-w-xl">
          <h1 className="leading-none">
            <Wordmark className="text-3xl lg:text-6xl" />
          </h1>
          <p className="mt-2 text-sm font-medium tracking-tight text-zinc-300 lg:mt-4 lg:text-xl">
            {BRAND.tagline}
          </p>
          <p className="mt-6 hidden text-[13px] tracking-wide text-zinc-500 lg:block">
            {BRAND.metrics}
          </p>
        </div>
      </div>

      {/* ===== Card de login ===== */}
      <div className="lg:relative lg:flex lg:min-h-dvh lg:items-center lg:justify-end lg:px-[6vw] lg:py-10 lg:pointer-events-none">
        <main
          className="login-card-anim w-full bg-[#0E0E10] px-6 py-8
                     lg:pointer-events-auto lg:w-full lg:max-w-md lg:rounded-2xl lg:border lg:border-white/10
                     lg:bg-zinc-950/55 lg:px-9 lg:py-9 lg:backdrop-blur-xl
                     lg:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]"
          aria-label="Acesso à conta"
        >
          {/* Logo pequeno */}
          <div className="mb-7 hidden lg:block">
            <Wordmark className="text-lg" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white">
            {view === 'login' ? 'Bem-vindo de volta' : 'Recuperar senha'}
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            {view === 'login'
              ? 'Entre na sua conta para continuar'
              : 'Digite seu email e enviaremos um link para redefinir sua senha'}
          </p>

          {view === 'login' && (
            <>
              <form onSubmit={handleSubmit} className="mt-7">
                {/* E-mail */}
                <label htmlFor="login-email" className="block text-[13px] font-medium text-zinc-300">
                  E-mail
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="nx-input h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4
                               text-sm text-white placeholder:text-zinc-600 transition-shadow duration-200"
                  />
                </div>

                {/* Senha */}
                <label
                  htmlFor="login-password"
                  className="mt-5 block text-[13px] font-medium text-zinc-300"
                >
                  Senha
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="nx-input h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-12
                               text-sm text-white placeholder:text-zinc-600 transition-shadow duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    className="nx-focusable absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center
                               justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>

                {/* Lembrar / esqueci */}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="nx-checkbox nx-focusable h-4 w-4 rounded"
                    />
                    Lembrar de mim
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot');
                      setForgotSent(false);
                    }}
                    className="nx-link nx-focusable rounded text-[13px] font-medium"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                {/* Entrar */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="nx-focusable mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl
                             text-sm font-semibold transition-all duration-200
                             hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
                  style={{ backgroundColor: 'var(--accent)', color: accentText }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-[18px] w-[18px] animate-spin" /> Entrando…
                    </>
                  ) : (
                    <>
                      Entrar <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {view === 'forgot' && (
            <>
              {forgotSent ? (
                <div className="mt-7 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                    Se este email estiver cadastrado, enviaremos um link de recuperação em alguns
                    instantes. Verifique sua caixa de entrada e a pasta de spam.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setForgotSent(false);
                    }}
                    className="nx-focusable flex h-12 w-full items-center justify-center gap-2 rounded-xl
                               text-sm font-semibold transition-all duration-200
                               hover:brightness-110 active:scale-[0.99]"
                    style={{ backgroundColor: 'var(--accent)', color: accentText }}
                  >
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="mt-7">
                  <label
                    htmlFor="forgot-email"
                    className="block text-[13px] font-medium text-zinc-300"
                  >
                    E-mail
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="nx-input h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4
                                 text-sm text-white placeholder:text-zinc-600 transition-shadow duration-200"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="nx-focusable mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl
                               text-sm font-semibold transition-all duration-200
                               hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
                    style={{ backgroundColor: 'var(--accent)', color: accentText }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-[18px] w-[18px] animate-spin" /> Enviando…
                      </>
                    ) : (
                      <>
                        Enviar link de recuperação <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={() => setView('login')}
                      className="nx-link nx-focusable rounded text-[13px] font-medium"
                    >
                      Voltar ao login
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          <p className="mt-7 text-center text-xs text-zinc-600">
            © {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.
          </p>
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   VARIAÇÕES DE BRAND — família de SaaS verticais Nexvy
   (catálogo de referência; cada SaaS embarca apenas o seu BRAND)
   ============================================================
   | SaaS          | name           | tagline                          | accent  | backgroundImage (sugestão)                                        |
   |---------------|----------------|----------------------------------|---------|-------------------------------------------------------------------|
   | Oficinas      | NexvyBeauty  | Gestão completa para sua oficina | #F97316 | Carro esportivo em garagem premium, luz dramática lateral          |
   | Barbearia     | BarbeiroPro    | Sua barbearia no controle        | #D9A441 | Cadeira de barbeiro vintage em couro, luz quente incandescente     |
   | Salão         | NexvyBeauty    | Beleza com gestão inteligente    | #EC4899 | Bancada de salão com espelhos hollywood iluminados, fundo escuro   |
   | Restaurante   | NexvyFoods     | Do pedido à entrega, sem fricção | #EF4444 | Chef finalizando prato na passe, cozinha profissional em penumbra  |
   | Academia      | NexvyGYM       | Performance para sua academia    | #84CC16 | Área de pesos livres, luz dura de spot, alto contraste             |
   ============================================================

   Métricas/bgHint por vertical (do catálogo BRANDS do design original):
   - NexvyBeauty: "+40% conversão · −50% tempo de resposta · 1.200+ oficinas" / carro esportivo em garagem premium, iluminação dramática
   - BarbeiroPro:   "+35% agendamentos · −60% faltas · 800+ barbearias"          / cadeira de barbeiro vintage em luz quente, fundo escuro
   - NexvyBeauty:   "+45% retenção · agenda 100% online · 950+ salões"           / salão elegante com espelhos iluminados, tons escuros
   - NexvyFoods:    "+38% pedidos · −45% erros de comanda · 1.500+ restaurantes" / chef finalizando prato na passe, cozinha em chiaroscuro
   - NexvyGYM:      "+50% renovações · check-in digital · 600+ academias"        / área de pesos livres com luz dura e contraste alto
   ============================================================ */
