import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Mail, Shield, AlertCircle, CheckCircle, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface MembroEquipe {
  id: string
  salao_id: string
  user_id: string
  papel: 'admin' | 'recepcionista' | 'profissional'
  email?: string
  nome?: string
  created_at: string
}

const PAPEL_CONFIG = {
  admin: {
    label: 'Admin',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  recepcionista: {
    label: 'Recepcionista',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  profissional: {
    label: 'Profissional',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
}

function PapelBadge({ papel }: { papel: string }) {
  const config =
    PAPEL_CONFIG[papel as keyof typeof PAPEL_CONFIG] ?? {
      label: papel,
      className: 'bg-gray-100 text-gray-700 border-gray-200',
    }
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${config.className}`}
    >
      {config.label}
    </span>
  )
}

function getIniciais(nome?: string, email?: string): string {
  if (nome) {
    const partes = nome.trim().split(' ')
    return partes.length >= 2
      ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
      : partes[0].slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

export default function Equipe() {
  const { salaoId } = useAuth()
  const queryClient = useQueryClient()
  const [emailConvite, setEmailConvite] = useState('')
  const [mostrarModal, setMostrarModal] = useState(false)
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'permissao'
    mensagem: string
  } | null>(null)

  const { data: membros = [], isLoading } = useQuery({
    queryKey: ['equipe', salaoId],
    queryFn: async () => {
      if (!salaoId) return []
      const { data, error } = await supabase
        .from('salao_users')
        .select('*')
        .eq('salao_id', salaoId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as MembroEquipe[]
    },
    enabled: !!salaoId,
  })

  const convidarMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email)
      if (error) throw error
    },
    onSuccess: () => {
      setFeedback({
        tipo: 'sucesso',
        mensagem: `Convite enviado para ${emailConvite}. O usuário receberá um e-mail para criar a conta.`,
      })
      setEmailConvite('')
      queryClient.invalidateQueries({ queryKey: ['equipe', salaoId] })
    },
    onError: (error: Error) => {
      const msg = error.message ?? ''
      const ehPermissao =
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('not allowed') ||
        msg.toLowerCase().includes('admin') ||
        msg.toLowerCase().includes('service_role')
      if (ehPermissao) {
        setFeedback({
          tipo: 'permissao',
          mensagem:
            'Convite por e-mail requer acesso service role. Para convidar usuários, acesse o Supabase Dashboard → Authentication → Users → Invite User.',
        })
      } else {
        setFeedback({ tipo: 'erro', mensagem: `Erro ao enviar convite: ${msg}` })
      }
    },
  })

  function handleConvidar(e: React.FormEvent) {
    e.preventDefault()
    if (!emailConvite.trim()) return
    setFeedback(null)
    convidarMutation.mutate(emailConvite.trim())
  }

  function fecharModal() {
    setMostrarModal(false)
    setEmailConvite('')
    setFeedback(null)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Equipe</h1>
            <p className="text-sm text-gray-500">Gerencie os membros do seu salão</p>
          </div>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Convidar membro
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : membros.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum membro cadastrado</p>
          <p className="text-sm text-gray-400 mt-1">
            Convide membros para colaborarem no salão.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {membros.map((membro) => (
            <div
              key={membro.id}
              className="bg-white border rounded-xl p-4 flex items-center gap-4 hover:border-rose-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-rose-600">
                  {getIniciais(membro.nome, membro.email)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {membro.nome ?? 'Usuário'}
                </p>
                {membro.email && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3" />
                    {membro.email}
                  </p>
                )}
              </div>
              <PapelBadge papel={membro.papel} />
            </div>
          ))}
        </div>
      )}

      {/* Legenda papéis */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Papéis disponíveis
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PAPEL_CONFIG).map((papel) => (
            <PapelBadge key={papel} papel={papel} />
          ))}
        </div>
      </div>

      {/* Modal convite */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-rose-500" />
                </div>
                <h2 className="font-semibold text-gray-900">Convidar membro</h2>
              </div>
              <button
                onClick={fecharModal}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConvidar} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail do novo membro
                </label>
                <input
                  type="email"
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                  placeholder="exemplo@email.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  required
                />
              </div>

              {feedback && (
                <div
                  className={`rounded-lg p-3 flex items-start gap-2 text-sm ${
                    feedback.tipo === 'sucesso'
                      ? 'bg-green-50 border border-green-200 text-green-800'
                      : feedback.tipo === 'permissao'
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {feedback.tipo === 'sucesso' ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <p>{feedback.mensagem}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="flex-1 border rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={convidarMutation.isPending || !emailConvite.trim()}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {convidarMutation.isPending ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Enviar convite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
