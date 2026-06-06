import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scissors, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [telefone, setTelefone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  function handleNomeChange(val: string) {
    setNome(val)
    // Auto-gerar slug a partir do nome
    setSlug(
      val
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!nome.trim()) { setError('Informe o nome da barbearia.'); return }
    if (!slug.trim()) { setError('Informe o slug (identificador da URL).'); return }
    if (!user) { setError('Sessão expirada. Faça login novamente.'); return }

    setLoading(true)

    // 1. Verificar se slug já existe
    const { data: existing } = await supabase
      .from('barbearias')
      .select('id')
      .eq('slug', slug.trim())
      .maybeSingle()

    if (existing) {
      setError('Este slug já está em uso. Escolha outro.')
      setLoading(false)
      return
    }

    // 2. Criar barbearia
    const { data: barbearia, error: insertErr } = await supabase
      .from('barbearias')
      .insert({
        nome: nome.trim(),
        slug: slug.trim(),
        telefone: telefone.trim() || null,
        primary_color: '#1e3a5f',
        ativo: true,
      })
      .select('id')
      .single()

    if (insertErr || !barbearia) {
      setError(insertErr?.message ?? 'Erro ao criar barbearia.')
      setLoading(false)
      return
    }

    // 3. Vincular usuário como owner
    const { error: linkErr } = await supabase
      .from('barbearia_users')
      .insert({
        barbearia_id: barbearia.id,
        user_id: user.id,
        role: 'owner',
      })

    if (linkErr) {
      setError(linkErr.message)
      setLoading(false)
      return
    }

    setDone(true)
    // Aguarda AuthContext recarregar barbeariaId
    setTimeout(() => navigate('/', { replace: true }), 1200)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white">Barbearia criada!</h2>
          <p className="text-slate-400 text-sm mt-1">Redirecionando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/25">
            <Scissors className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">BarbeiroPro</h1>
            <p className="text-sm text-slate-400 mt-0.5">Configure sua barbearia</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-1">Bem-vindo!</h2>
          <p className="text-sm text-slate-400 mb-6">
            Preencha os dados da sua barbearia para começar.
          </p>

          {error !== null ? (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Nome da barbearia */}
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-slate-300 mb-1.5">
                Nome da barbearia <span className="text-red-400">*</span>
              </label>
              <input
                id="nome"
                type="text"
                required
                value={nome}
                onChange={e => handleNomeChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="Ex: Barbearia do João"
              />
            </div>

            {/* Slug / URL */}
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-slate-300 mb-1.5">
                Identificador da URL <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-slate-700 border border-r-0 border-slate-600 rounded-l-lg text-slate-400 text-sm whitespace-nowrap">
                  /agendar/
                </span>
                <input
                  id="slug"
                  type="text"
                  required
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 px-3 py-2.5 rounded-r-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                  placeholder="barbearia-do-joao"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Apenas letras minúsculas, números e hífens.
              </p>
            </div>

            {/* Telefone */}
            <div>
              <label htmlFor="telefone" className="block text-sm font-medium text-slate-300 mb-1.5">
                Telefone / WhatsApp
              </label>
              <input
                id="telefone"
                type="tel"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="(11) 99999-9999"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition mt-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar minha barbearia
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
