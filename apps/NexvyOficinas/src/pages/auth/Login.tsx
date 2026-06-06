import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Login "animal" — portado da versão Next (apps/nexvy-oficinas).
// Visual 100% CSS + login-bg.webp (foto da oficina). Auth via Supabase
// (signInWithPassword) no lugar do /api/login do Next.
// A caixa fica ANCORADA na face do carro (~45%/60% no desktop).

const FIELD =
  'w-full rounded-2xl bg-white/90 px-5 py-3.5 text-sm text-gray-800 placeholder:text-gray-400 shadow-lg outline-none transition focus:bg-white focus:ring-2 focus:ring-black/40'

export default function Login() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!authLoading && user !== null) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError !== null) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : authError.message,
      )
      setLoading(false)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto">
      {/* fallback: oficina escura + glow vermelho onde fica o carro */}
      <div
        aria-hidden
        className="fixed inset-0 -z-20"
        style={{
          background:
            'radial-gradient(ellipse 40% 40% at 45% 60%, rgba(220,38,38,0.42), transparent 70%), linear-gradient(160deg, #0b0f17 0%, #11161f 45%, #05070d 100%)',
        }}
      />
      {/* foto da oficina (cobre o fallback quando presente) */}
      <div
        aria-hidden
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: 'url(/login-bg.webp)' }}
      />
      {/* layer preta global a 15%: acalma o fundo e destaca a caixa */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-black/15" />
      {/* blur radial leve, focado na face do carro (onde fica a caixa) */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          maskImage:
            'radial-gradient(ellipse 26% 30% at 45% 60%, black 0%, black 45%, transparent 82%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 26% 30% at 45% 60%, black 0%, black 45%, transparent 82%)',
        }}
      />
      {/* overlay escuro mínimo pra contraste do texto branco */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-black/25"
        style={{
          maskImage:
            'radial-gradient(ellipse 27% 31% at 45% 60%, black 0%, black 40%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 27% 31% at 45% 60%, black 0%, black 40%, transparent 78%)',
        }}
      />

      {/* caixa de login: mobile centralizada; desktop ancorada na face do carro */}
      <div className="absolute left-1/2 top-1/2 w-[min(320px,86vw)] -translate-x-1/2 -translate-y-1/2 sm:left-[45%] sm:top-[60%] sm:w-[clamp(240px,18vw,280px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-xl font-bold text-white"
              style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
            >
              N
            </div>
            <span className="text-base font-bold tracking-tight text-white drop-shadow">
              NexvyOficinas
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3" noValidate>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="E-mail"
              aria-label="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />

            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Senha"
                aria-label="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${FIELD} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {error !== null ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/20 p-3 text-sm text-red-100 backdrop-blur-sm">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || email.trim().length === 0 || password.length === 0}
              className="mt-1 w-full rounded-2xl bg-black px-5 py-3.5 text-sm font-semibold text-white shadow-xl transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>

            <Link
              to="/signup"
              className="mt-1 text-center text-xs font-medium text-white/80 drop-shadow transition-colors hover:text-white"
            >
              Criar conta
            </Link>
          </form>
        </div>
      </div>
    </div>
  )
}
