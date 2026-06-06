import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dumbbell, Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

type TipoAcademia = 'academia' | 'estudio' | 'crossfit'

interface Step1 {
  nome_academia: string
  tipo: TipoAcademia
  telefone: string
  email: string
}

interface Step2 {
  slug: string
  horario_abertura: string
  horario_fechamento: string
}

const tiposAcademia: { value: TipoAcademia; label: string; emoji: string }[] = [
  { value: 'academia', label: 'Academia', emoji: '🏋️' },
  { value: 'estudio', label: 'Estúdio', emoji: '🧘' },
  { value: 'crossfit', label: 'CrossFit / Funcional', emoji: '💪' },
]

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [step1, setStep1] = useState<Step1>({
    nome_academia: '',
    tipo: 'academia',
    telefone: '',
    email: user?.email ?? '',
  })

  const [step2, setStep2] = useState<Step2>({
    slug: '',
    horario_abertura: '06:00',
    horario_fechamento: '22:00',
  })

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function handleNomeChange(value: string) {
    setStep1((s) => ({ ...s, nome_academia: value }))
    if (!step2.slug || step2.slug === slugify(step1.nome_academia)) {
      setStep2((s) => ({ ...s, slug: slugify(value) }))
    }
  }

  function goToStep2(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!step1.nome_academia.trim()) {
      setError('Nome da academia é obrigatório.')
      return
    }
    setStep(2)
  }

  async function handleFinish(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!step2.slug.trim()) {
      setError('O identificador é obrigatório.')
      return
    }
    if (!/^[a-z0-9-]+$/.test(step2.slug)) {
      setError('Identificador deve conter apenas letras minúsculas, números e hífens.')
      return
    }

    setLoading(true)

    // 1. Criar academia
    const { data: academia, error: academiaErr } = await supabase
      .from('academias')
      .insert({
        nome: step1.nome_academia.trim(),
        slug: step2.slug.trim(),
        telefone: step1.telefone.trim() || null,
        email: step1.email.trim() || user?.email || null,
        primary_color: '#7c3aed',
        ativo: true,
      })
      .select()
      .single()

    if (academiaErr !== null) {
      setError(
        academiaErr.message.includes('duplicate') || academiaErr.message.includes('unique')
          ? 'Este identificador já está em uso. Escolha outro.'
          : academiaErr.message,
      )
      setLoading(false)
      return
    }

    // 2. Vincular usuário à academia
    const { error: userErr } = await supabase.from('academy_users').insert({
      academia_id: academia.id,
      user_id: user!.id,
      role: 'owner',
    })

    if (userErr !== null) {
      setError(userErr.message)
      setLoading(false)
      return
    }

    // Recarrega sessão para AuthContext buscar o novo academiaId
    await supabase.auth.refreshSession()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/25">
            <Dumbbell className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">NexvyGYM</h1>
            <p className="text-sm text-slate-400 mt-0.5">Configure sua academia</p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {([1, 2] as const).map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step > s
                    ? 'bg-violet-600 text-white'
                    : step === s
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                }`}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              <span
                className={`text-sm ${step === s ? 'text-white font-medium' : 'text-slate-500'}`}
              >
                {s === 1 ? 'Dados da academia' : 'Identificador e horários'}
              </span>
              {s < 2 && <ChevronRight className="w-4 h-4 text-slate-600" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
          {error !== null && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-violet-500/10 border border-violet-500/30 text-sm text-violet-300">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={goToStep2} className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-5">Sobre sua academia</h2>

              <div>
                <label htmlFor="nome_academia" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Nome da academia *
                </label>
                <input
                  id="nome_academia"
                  type="text"
                  required
                  value={step1.nome_academia}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  placeholder="Ex: Academia Power Fit"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Tipo de negócio *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {tiposAcademia.map(({ value, label, emoji }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStep1((s) => ({ ...s, tipo: value }))}
                      className={[
                        'flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-xs font-medium transition-colors',
                        step1.tipo === value
                          ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                          : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500',
                      ].join(' ')}
                    >
                      <span className="text-lg">{emoji}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="telefone" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <input
                  id="telefone"
                  type="tel"
                  value={step1.telefone}
                  onChange={(e) => setStep1((s) => ({ ...s, telefone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="email_academia" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email de contato
                </label>
                <input
                  id="email_academia"
                  type="email"
                  value={step1.email}
                  onChange={(e) => setStep1((s) => ({ ...s, email: e.target.value }))}
                  placeholder="contato@suaacademia.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={step1.nome_academia.trim().length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                Continuar
                <ChevronRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleFinish} className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-5">Identificador e horários</h2>

              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Identificador único *
                </label>
                <div className="flex items-center rounded-lg bg-slate-800 border border-slate-600 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-colors overflow-hidden">
                  <span className="pl-3 pr-1 text-slate-500 text-sm whitespace-nowrap">nexvygym.com/</span>
                  <input
                    id="slug"
                    type="text"
                    required
                    value={step2.slug}
                    onChange={(e) => setStep2((s) => ({ ...s, slug: slugify(e.target.value) }))}
                    placeholder="minha-academia"
                    className="flex-1 px-2 py-2.5 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Apenas letras minúsculas, números e hífens.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="h_abertura" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Abertura
                  </label>
                  <input
                    id="h_abertura"
                    type="time"
                    value={step2.horario_abertura}
                    onChange={(e) => setStep2((s) => ({ ...s, horario_abertura: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="h_fechamento" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Fechamento
                  </label>
                  <input
                    id="h_fechamento"
                    type="time"
                    value={step2.horario_fechamento}
                    onChange={(e) => setStep2((s) => ({ ...s, horario_fechamento: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(1) }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading || step2.slug.trim().length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Criando academia…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Criar minha academia
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
