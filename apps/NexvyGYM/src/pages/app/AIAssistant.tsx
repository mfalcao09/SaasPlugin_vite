import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit, AlertTriangle, UserX, TrendingUp, DollarSign,
  RefreshCw, CheckCircle, Clock,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Student } from '@/lib/db'

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - new Date(todayStr()).getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Tipos ────────────────────────────────────────────────────────────────

interface AnalysisResult {
  expiringIn7: Student[]
  noCheckinIn15: Student[]
  taxaRenovacao: number
  receitaProjetada: number
  totalAtivos: number
  analisadoEm: string
}

// ─── Componente ────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const { academiaId } = useAuth()
  const [analyzed, setAnalyzed] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: students = [] } = useQuery({
    queryKey: ['students', academiaId],
    queryFn: async () => {
      const { data, error } = await db.students.list(academiaId!)
      if (error) throw error
      return (data ?? []) as Student[]
    },
    enabled: !!academiaId,
  })

  const now = new Date()
  const { data: checkins = [] } = useQuery({
    queryKey: ['checkins-month', academiaId, now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      const { data, error } = await db.checkins.listByMonth(
        academiaId!,
        now.getFullYear(),
        now.getMonth() + 1,
      )
      if (error) return []
      return (data ?? []) as Array<{ student_id: string; date: string }>
    },
    enabled: !!academiaId,
  })

  async function handleAnalyze() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))

    const t = todayStr()
    const ativos = students.filter(s => s.status === 'ativo')

    const expiringIn7 = ativos.filter(s => {
      if (!s.data_vencimento) return false
      const d = daysUntil(s.data_vencimento)
      return d >= 0 && d <= 7
    })

    const limite15 = addDays(t, -15)
    const comCheckinRecente = new Set(
      checkins.filter(c => c.date >= limite15).map(c => c.student_id)
    )
    const noCheckinIn15 = ativos.filter(s => !comCheckinRecente.has(s.id))

    const taxaRenovacao = students.length > 0
      ? Math.round((ativos.length / students.length) * 100)
      : 0

    const vencendo30 = ativos.filter(s => {
      if (!s.data_vencimento) return false
      const d = daysUntil(s.data_vencimento)
      return d >= -5 && d <= 35
    })
    const receitaProjetada = vencendo30.length * 100

    setResult({
      expiringIn7,
      noCheckinIn15,
      taxaRenovacao,
      receitaProjetada,
      totalAtivos: ativos.length,
      analisadoEm: new Date().toLocaleString('pt-BR'),
    })
    setAnalyzed(true)
    setLoading(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BrainCircuit className="w-7 h-7 text-violet-500" /> AI Assistant
          </h1>
          <p className="text-slate-400 text-sm mt-1">Análise de retenção e projeção de receita</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading || students.length === 0}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-violet-600/25"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analisando...</>
            : <><BrainCircuit className="w-4 h-4" /> Analisar</>}
        </button>
      </div>

      {/* Estado inicial */}
      {!analyzed && !loading && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-12 text-center">
          <BrainCircuit className="w-16 h-16 mx-auto text-violet-500/40 mb-4" />
          <p className="text-slate-400 text-lg">
            Clique em <strong className="text-white">Analisar</strong> para gerar o relatório de retenção
          </p>
          <p className="text-slate-500 text-sm mt-1">{students.length} aluno(s) carregado(s)</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-12 text-center">
          <div className="w-10 h-10 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Processando dados dos alunos...</p>
        </div>
      )}

      {/* Resultado */}
      {analyzed && result && !loading && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-slate-400 text-xs">Alunos Ativos</span>
              </div>
              <p className="text-3xl font-bold text-white">{result.totalAtivos}</p>
            </div>
            <div className="bg-slate-800/60 border border-amber-600/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-slate-400 text-xs">Vencem em 7 dias</span>
              </div>
              <p className="text-3xl font-bold text-amber-400">{result.expiringIn7.length}</p>
            </div>
            <div className="bg-slate-800/60 border border-red-600/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserX className="w-4 h-4 text-red-400" />
                <span className="text-slate-400 text-xs">Sem check-in (15d)</span>
              </div>
              <p className="text-3xl font-bold text-red-400">{result.noCheckinIn15.length}</p>
            </div>
            <div className="bg-slate-800/60 border border-violet-600/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <span className="text-slate-400 text-xs">Taxa renovação</span>
              </div>
              <p className="text-3xl font-bold text-violet-400">{result.taxaRenovacao}%</p>
            </div>
          </div>

          {/* Receita projetada */}
          <div className="bg-gradient-to-r from-violet-600/10 to-violet-600/5 border border-violet-600/30 rounded-xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-600/20 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Receita projetada — próximo mês</p>
              <p className="text-2xl font-bold text-white">{formatBRL(result.receitaProjetada)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Estimativa baseada em renovações esperadas</p>
            </div>
          </div>

          {/* Alunos vencendo */}
          {result.expiringIn7.length > 0 && (
            <div className="bg-slate-800/60 border border-amber-600/30 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700 bg-amber-500/5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">
                  Planos vencendo em até 7 dias ({result.expiringIn7.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-700/50">
                {result.expiringIn7.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{s.nome}</p>
                      <p className="text-slate-500 text-xs">{s.plano_nome ?? 'Plano não informado'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-amber-400 text-sm font-semibold">
                        {daysUntil(s.data_vencimento!) === 0 ? 'Hoje' : `${daysUntil(s.data_vencimento!)}d`}
                      </p>
                      <p className="text-slate-500 text-xs">{s.data_vencimento}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risco de churn */}
          {result.noCheckinIn15.length > 0 && (
            <div className="bg-slate-800/60 border border-red-600/30 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700 bg-red-500/5">
                <UserX className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-400">
                  Risco de churn — sem check-in há 15+ dias ({result.noCheckinIn15.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-700/50">
                {result.noCheckinIn15.slice(0, 10).map(s => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{s.nome}</p>
                      <p className="text-slate-500 text-xs">{s.plano_nome ?? 'Plano não informado'}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                      Inativo
                    </span>
                  </div>
                ))}
                {result.noCheckinIn15.length > 10 && (
                  <p className="px-5 py-2 text-xs text-slate-500 text-center">
                    + {result.noCheckinIn15.length - 10} outros alunos em risco
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tudo ok */}
          {result.expiringIn7.length === 0 && result.noCheckinIn15.length === 0 && (
            <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-6 text-center">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-green-400 font-semibold">Tudo em dia!</p>
              <p className="text-slate-500 text-sm mt-1">Nenhum aluno com risco de churn identificado.</p>
            </div>
          )}

          <p className="text-xs text-slate-600 text-right">Analisado em {result.analisadoEm}</p>
        </div>
      )}
    </div>
  )
}
