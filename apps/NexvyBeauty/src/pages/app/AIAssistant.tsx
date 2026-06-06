import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, AlertCircle, TrendingUp, Calendar, DollarSign, RefreshCw } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

interface Insight {
  tipo: 'alerta' | 'oportunidade' | 'info'
  titulo: string
  descricao: string
  valor?: string
}

function InsightCard({ insight }: { insight: Insight }) {
  const cores = {
    alerta: 'bg-rose-50 border-rose-200',
    oportunidade: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  }
  const icones = {
    alerta: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    oportunidade: <TrendingUp className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <DollarSign className="w-5 h-5 text-blue-500 shrink-0" />,
  }
  const textoCores = {
    alerta: 'text-rose-800',
    oportunidade: 'text-amber-800',
    info: 'text-blue-800',
  }

  return (
    <div className={`border rounded-xl p-4 flex gap-3 items-start ${cores[insight.tipo]}`}>
      {icones[insight.tipo]}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${textoCores[insight.tipo]}`}>{insight.titulo}</p>
        <p className={`text-sm mt-0.5 ${textoCores[insight.tipo]} opacity-80`}>{insight.descricao}</p>
        {insight.valor && (
          <p className={`text-sm font-bold mt-1 ${textoCores[insight.tipo]}`}>{insight.valor}</p>
        )}
      </div>
    </div>
  )
}

export default function AIAssistant() {
  const { salaoId } = useAuth()
  const hoje = new Date().toISOString().split('T')[0]
  const [insights, setInsights] = useState<Insight[]>([])
  const [gerado, setGerado] = useState(false)

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes', salaoId],
    queryFn: async () => {
      if (!salaoId) return []
      const { data } = await db.clientes.list(salaoId)
      return data ?? []
    },
    enabled: !!salaoId,
  })

  const { data: agendamentosHoje = [], isLoading: loadingAgendamentos } = useQuery({
    queryKey: ['agendamentos-hoje', salaoId, hoje],
    queryFn: async () => {
      if (!salaoId) return []
      const { data } = await db.agendamentos.listByDate(salaoId, hoje)
      return data ?? []
    },
    enabled: !!salaoId,
  })

  const isLoading = loadingClientes || loadingAgendamentos

  function gerarInsights(): Insight[] {
    const resultado: Insight[] = []
    const limite30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Alerta: clientes sem retornar há 30+ dias
    const semRetorno = clientes.filter(
      (c) => c.ultimo_atendimento && new Date(c.ultimo_atendimento) < limite30dias,
    )
    if (semRetorno.length > 0) {
      resultado.push({
        tipo: 'alerta',
        titulo: 'Clientes sem retornar há 30+ dias',
        descricao: `${semRetorno.length} cliente${semRetorno.length > 1 ? 's' : ''} não voltam há mais de 30 dias. Considere enviar uma mensagem de reativação.`,
        valor: `Ex: ${semRetorno.slice(0, 3).map((c) => c.nome.split(' ')[0]).join(', ')}`,
      })
    }

    // Oportunidade: clientes com apenas 1 atendimento
    const umaVez = clientes.filter((c) => c.total_atendimentos === 1)
    if (umaVez.length > 0) {
      resultado.push({
        tipo: 'oportunidade',
        titulo: 'Clientes com apenas 1 atendimento',
        descricao: `${umaVez.length} cliente${umaVez.length > 1 ? 's' : ''} vieram apenas uma vez. Uma oferta de retorno pode convertê-los em clientes fiéis.`,
      })
    }

    // Alerta: agenda vazia hoje
    const agendamentosAtivos = agendamentosHoje.filter((a) => a.status !== 'cancelado')
    if (agendamentosAtivos.length === 0) {
      resultado.push({
        tipo: 'alerta',
        titulo: 'Agenda vazia hoje',
        descricao: 'Nenhum agendamento confirmado para hoje. Considere promover disponibilidade nas redes sociais.',
      })
    }

    // Info: ticket médio
    const comHistorico = clientes.filter((c) => c.total_atendimentos > 0 && c.total_gasto > 0)
    if (comHistorico.length > 0) {
      const ticketMedio =
        comHistorico.reduce((sum, c) => sum + c.total_gasto / c.total_atendimentos, 0) /
        comHistorico.length
      resultado.push({
        tipo: 'info',
        titulo: 'Ticket médio por atendimento',
        descricao: `Calculado com base em ${comHistorico.length} clientes com histórico registrado.`,
        valor: formatCurrency(ticketMedio),
      })
    }

    if (resultado.length === 0) {
      resultado.push({
        tipo: 'info',
        titulo: 'Tudo certo por enquanto!',
        descricao: 'Nenhum alerta ou oportunidade identificado. Continue acompanhando seus indicadores.',
      })
    }

    return resultado
  }

  function handleGerarInsights() {
    setInsights(gerarInsights())
    setGerado(true)
  }

  const inativos30 = clientes.filter(
    (c) => c.ultimo_atendimento && new Date(c.ultimo_atendimento) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  ).length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Assistente de IA</h1>
          <p className="text-sm text-gray-500">Insights inteligentes sobre o seu salão</p>
        </div>
      </div>

      {/* Card de ação */}
      <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Análise Inteligente do Salão</h2>
            <p className="text-sm text-gray-600 mt-1">
              Analiso seus clientes, agenda e histórico para identificar alertas e oportunidades de crescimento.
            </p>
            <button
              onClick={handleGerarInsights}
              disabled={isLoading}
              className="mt-4 inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Carregando dados...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Insights
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Resumo de dados */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{clientes.length}</p>
            <p className="text-xs text-gray-500 mt-1">Clientes cadastrados</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {agendamentosHoje.filter((a) => a.status !== 'cancelado').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Agendamentos hoje</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <Calendar className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{inativos30}</p>
            <p className="text-xs text-gray-500 mt-1">Inativos (30+ dias)</p>
          </div>
        </div>
      )}

      {/* Insights gerados */}
      {gerado && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {insights.length} insight{insights.length !== 1 ? 's' : ''} encontrado{insights.length !== 1 ? 's' : ''}
          </h3>
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}
    </div>
  )
}
