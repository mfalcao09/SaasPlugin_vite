import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { slugify } from '@/lib/utils'

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)

    const slug = slugify(nomeEmpresa) + '-' + Math.random().toString(36).slice(2, 6)

    // 1. Criar empresa
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .insert({
        nome: nomeEmpresa.trim(),
        slug,
        telefone: telefone.trim() || null,
        cnpj: cnpj.trim() || null,
        status: 'trial',
        onboarding_concluido: true,
        owner_email: user.email,
      })
      .select('id')
      .single()

    if (empresaError !== null) {
      setError('Erro ao criar a oficina: ' + empresaError.message)
      setLoading(false)
      return
    }

    // 2. Vincular user como owner
    const { error: linkError } = await supabase
      .from('empresa_users')
      .insert({
        empresa_id: empresa.id,
        user_id: user.id,
        role: 'owner',
      })

    if (linkError !== null) {
      setError('Erro ao vincular usuário: ' + linkError.message)
      setLoading(false)
      return
    }

    setDone(true)
    // Recarregar para que AuthContext leia o novo empresa_id
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle className="h-16 w-16 text-orange-500" />
          <h2 className="text-2xl font-bold text-white">Oficina criada!</h2>
          <p className="text-slate-400">Redirecionando para o painel…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/25">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Configurar sua oficina</h1>
            <p className="text-sm text-slate-400 mt-0.5">Preencha os dados da sua empresa para começar</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
          {error !== null && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-slate-300 mb-1.5">
                Nome da oficina <span className="text-orange-500">*</span>
              </label>
              <input
                id="nome"
                type="text"
                required
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                placeholder="Ex: Oficina do João"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="telefone" className="block text-sm font-medium text-slate-300 mb-1.5">
                Telefone / WhatsApp
              </label>
              <input
                id="telefone"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="cnpj" className="block text-sm font-medium text-slate-300 mb-1.5">
                CNPJ <span className="text-slate-500 font-normal">(opcional)</span>
              </label>
              <input
                id="cnpj"
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || nomeEmpresa.trim().length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando sua oficina…
                </>
              ) : (
                'Criar oficina e entrar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
