import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Settings, Store, Clock, Copy, Check, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface SalaoForm {
  nome_salao: string
  email: string
  telefone: string
  primary_color: string
  slug: string
}

interface ConfigForm {
  horario_abertura: string
  horario_fechamento: string
  intervalo_agenda: number
  permite_agendamento_online: boolean
}

const INTERVALOS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '60 minutos' },
]

export default function Configuracoes() {
  const { salaoId } = useAuth()
  const [copiado, setCopiado] = useState(false)

  const [salaoForm, setSalaoForm] = useState<SalaoForm>({
    nome_salao: '',
    email: '',
    telefone: '',
    primary_color: '#f43f5e',
    slug: '',
  })

  const [configForm, setConfigForm] = useState<ConfigForm>({
    horario_abertura: '08:00',
    horario_fechamento: '18:00',
    intervalo_agenda: 30,
    permite_agendamento_online: true,
  })

  // Busca dados do salão e popula o form
  const { isLoading: loadingSalao } = useQuery({
    queryKey: ['salao-config', salaoId],
    queryFn: async () => {
      if (!salaoId) return null
      const { data, error } = await supabase
        .from('saloes')
        .select('id, nome_salao, email, telefone, primary_color, slug')
        .eq('id', salaoId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!salaoId,
    onSuccess: (data: SalaoForm & { id: string } | null) => {
      if (!data) return
      setSalaoForm({
        nome_salao: data.nome_salao ?? '',
        email: data.email ?? '',
        telefone: data.telefone ?? '',
        primary_color: data.primary_color ?? '#f43f5e',
        slug: data.slug ?? '',
      })
    },
  })

  // Busca app_configs e popula o form
  const { isLoading: loadingConfig } = useQuery({
    queryKey: ['app-config', salaoId],
    queryFn: async () => {
      if (!salaoId) return null
      const { data } = await supabase
        .from('app_configs')
        .select('horario_abertura, horario_fechamento, intervalo_agenda, permite_agendamento_online')
        .eq('salao_id', salaoId)
        .single()
      return data
    },
    enabled: !!salaoId,
    onSuccess: (data: ConfigForm | null) => {
      if (!data) return
      setConfigForm({
        horario_abertura: data.horario_abertura ?? '08:00',
        horario_fechamento: data.horario_fechamento ?? '18:00',
        intervalo_agenda: data.intervalo_agenda ?? 30,
        permite_agendamento_online: data.permite_agendamento_online ?? true,
      })
    },
  })

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!salaoId) throw new Error('Salão não identificado')

      // Update saloes
      const { error: errSalao } = await supabase
        .from('saloes')
        .update({
          nome_salao: salaoForm.nome_salao,
          email: salaoForm.email || null,
          telefone: salaoForm.telefone || null,
          primary_color: salaoForm.primary_color,
          slug: salaoForm.slug,
        })
        .eq('id', salaoId)
      if (errSalao) throw errSalao

      // Upsert app_configs
      const { error: errConfig } = await supabase
        .from('app_configs')
        .upsert(
          {
            salao_id: salaoId,
            horario_abertura: configForm.horario_abertura,
            horario_fechamento: configForm.horario_fechamento,
            intervalo_agenda: configForm.intervalo_agenda,
            permite_agendamento_online: configForm.permite_agendamento_online,
          },
          { onConflict: 'salao_id' },
        )
      if (errConfig) throw errConfig
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar: ${error.message}`)
    },
  })

  function handleCopiarLink() {
    const link = `${window.location.origin}/agendar/${salaoForm.slug}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  const isLoading = loadingSalao || loadingConfig

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500">
            Gerencie as informações e preferências do seu salão
          </p>
        </div>
      </div>

      {/* Seção 1 — Dados do Salão */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-gray-50">
          <Store className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-sm">Dados do Salão</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome do salão <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={salaoForm.nome_salao}
              onChange={(e) => setSalaoForm((f) => ({ ...f, nome_salao: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              placeholder="Ex: Studio Bella"
            />
          </div>

          {/* Email + Telefone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <input
                type="email"
                value={salaoForm.email}
                onChange={(e) => setSalaoForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                placeholder="contato@salao.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone</label>
              <input
                type="tel"
                value={salaoForm.telefone}
                onChange={(e) => setSalaoForm((f) => ({ ...f, telefone: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                placeholder="(11) 99999-0000"
              />
            </div>
          </div>

          {/* Cor principal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Cor principal
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={salaoForm.primary_color}
                onChange={(e) => setSalaoForm((f) => ({ ...f, primary_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={salaoForm.primary_color}
                onChange={(e) => setSalaoForm((f) => ({ ...f, primary_color: e.target.value }))}
                className="w-32 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                placeholder="#f43f5e"
              />
              <div
                className="w-8 h-8 rounded-lg border shadow-sm"
                style={{ backgroundColor: salaoForm.primary_color }}
              />
            </div>
          </div>

          {/* Slug + copiar link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Link de agendamento (slug)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-rose-500">
                <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r whitespace-nowrap">
                  /agendar/
                </span>
                <input
                  type="text"
                  value={salaoForm.slug}
                  onChange={(e) =>
                    setSalaoForm((f) => ({
                      ...f,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    }))
                  }
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                  placeholder="meu-salao"
                />
              </div>
              <button
                type="button"
                onClick={handleCopiarLink}
                disabled={!salaoForm.slug}
                className="inline-flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                {copiado ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção 2 — Horários */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-gray-50">
          <Clock className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-sm">Horários de Funcionamento</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Abertura + Fechamento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Horário de abertura
              </label>
              <input
                type="time"
                value={configForm.horario_abertura}
                onChange={(e) =>
                  setConfigForm((f) => ({ ...f, horario_abertura: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Horário de fechamento
              </label>
              <input
                type="time"
                value={configForm.horario_fechamento}
                onChange={(e) =>
                  setConfigForm((f) => ({ ...f, horario_fechamento: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Intervalo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Intervalo entre agendamentos
            </label>
            <select
              value={configForm.intervalo_agenda}
              onChange={(e) =>
                setConfigForm((f) => ({ ...f, intervalo_agenda: Number(e.target.value) }))
              }
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent bg-white"
            >
              {INTERVALOS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle agendamento online */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-700">Agendamento online</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Permite que clientes agendem pelo link público
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={configForm.permite_agendamento_online}
              onClick={() =>
                setConfigForm((f) => ({
                  ...f,
                  permite_agendamento_online: !f.permite_agendamento_online,
                }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 ${
                configForm.permite_agendamento_online ? 'bg-rose-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  configForm.permite_agendamento_online ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <button
          onClick={() => salvarMutation.mutate()}
          disabled={salvarMutation.isPending || !salaoForm.nome_salao.trim()}
          className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          {salvarMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar configurações
            </>
          )}
        </button>
      </div>
    </div>
  )
}
