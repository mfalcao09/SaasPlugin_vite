import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trophy, Plus, X, TrendingUp, ShoppingBag, DollarSign, Target } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────

type Meta = {
  id: string
  company_id: string
  tipo: string
  valor_meta: number
  periodo: string
  data_inicio: string
  data_fim: string
  realizado?: number
  ativo?: boolean
  created_at: string
}

type FormData = {
  tipo: string
  valor_meta: string
  periodo: string
  data_inicio: string
  data_fim: string
}

// ─── Constantes ────────────────────────────────────────────────────────────

const TIPOS = [
  { key: 'faturamento', label: 'Faturamento', icon: DollarSign },
  { key: 'qtd_pedidos', label: 'Qtd. Pedidos', icon: ShoppingBag },
  { key: 'ticket_medio', label: 'Ticket Médio', icon: TrendingUp },
]

function getMonthRange() {
  const now = new Date()
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  return { inicio, fim }
}

function makeEmptyForm(): FormData {
  const { inicio, fim } = getMonthRange()
  return { tipo: 'faturamento', valor_meta: '', periodo: 'mensal', data_inicio: inicio, data_fim: fim }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatVal(tipo: string, val: number): string {
  if (tipo === 'faturamento' || tipo === 'ticket_medio') {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  return String(Math.round(val))
}

function calcProgress(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0
  return Math.min(100, Math.round((realizado / meta) * 100))
}

// ─── Componente ────────────────────────────────────────────────────────────

export default function Metas() {
  const { companyId } = useAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Meta | null>(null)
  const [form, setForm] = useState<FormData>(makeEmptyForm)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ['metas', companyId],
    queryFn: async () => {
      const { data, error } = await db.metas.list(companyId!)
      if (error) throw error
      return (data ?? []) as Meta[]
    },
    enabled: !!companyId,
  })

  // Pedidos do mês para calcular realizado
  const now = new Date()
  const { data: ordersThisMonth = [] } = useQuery({
    queryKey: ['orders-month', companyId, now.getFullYear(), now.getMonth()],
    queryFn: async () => {
      const { inicio } = getMonthRange()
      const { data, error } = await db.orders.listByDate(companyId!, inicio)
      if (error) return []
      return (data ?? []) as Array<{ total_amount?: number; status?: string }>
    },
    enabled: !!companyId,
  })

  const entregues = ordersThisMonth.filter(o => o.status === 'entregue')
  const totalFaturamento = entregues.reduce((s, o) => s + (o.total_amount ?? 0), 0)
  const realizados: Record<string, number> = {
    faturamento: totalFaturamento,
    qtd_pedidos: entregues.length,
    ticket_medio: entregues.length ? totalFaturamento / entregues.length : 0,
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (payload: FormData) => {
      const data = {
        company_id: companyId,
        tipo: payload.tipo,
        valor_meta: parseFloat(payload.valor_meta.replace(',', '.')),
        periodo: payload.periodo,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim,
        ativo: true,
      }
      if (editing) {
        const { error } = await db.metas.update(editing.id, data)
        if (error) throw error
      } else {
        const { error } = await db.metas.create(data)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', companyId] })
      toast.success(editing ? 'Meta atualizada!' : 'Meta criada!')
      closeModal()
    },
    onError: () => toast.error('Erro ao salvar meta'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.metas.delete(id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', companyId] })
      toast.success('Meta removida')
    },
    onError: () => toast.error('Erro ao remover meta'),
  })

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null)
    setForm(makeEmptyForm())
    setShowModal(true)
  }

  function openEdit(meta: Meta) {
    setEditing(meta)
    setForm({
      tipo: meta.tipo,
      valor_meta: String(meta.valor_meta),
      periodo: meta.periodo,
      data_inicio: meta.data_inicio,
      data_fim: meta.data_fim,
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(makeEmptyForm())
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-7 h-7 text-green-500" /> Metas
          </h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe os objetivos do restaurante</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova Meta
        </button>
      </div>

      {/* Realizados do mês (cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TIPOS.map(t => {
          const Icon = t.icon
          return (
            <div key={t.key} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-green-400" />
                <span className="text-slate-400 text-sm">{t.label} (mês)</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatVal(t.key, realizados[t.key] ?? 0)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Metas cadastradas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-green-500 rounded-full animate-spin" />
        </div>
      ) : metas.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma meta definida ainda</p>
          <button onClick={openNew} className="mt-3 text-green-400 hover:text-green-300 text-sm underline">
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metas.map(meta => {
            const tipoInfo = TIPOS.find(t => t.key === meta.tipo) ?? TIPOS[0]
            const Icon = tipoInfo.icon
            const realizado = realizados[meta.tipo] ?? meta.realizado ?? 0
            const pct = calcProgress(realizado, meta.valor_meta)
            const barColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            const textColor = pct >= 70 ? 'text-green-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'

            return (
              <div key={meta.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-green-400" />
                    <span className="font-semibold text-white text-sm">{tipoInfo.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(meta)}
                      className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded px-2 py-0.5 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => { if (confirm('Remover meta?')) deleteMutation.mutate(meta.id) }}
                      className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-2xl font-bold text-white">{formatVal(meta.tipo, realizado)}</span>
                    <span className="text-sm text-slate-400">/ {formatVal(meta.tipo, meta.valor_meta)}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs font-semibold ${textColor}`}>{pct}% atingido</span>
                    <span className="text-xs text-slate-500">{meta.periodo}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500">{meta.data_inicio} → {meta.data_fim}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Meta' : 'Nova Meta'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de Meta</label>
                <select
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                >
                  {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Valor da Meta {form.tipo !== 'qtd_pedidos' ? '(R$)' : '(pedidos)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  value={form.valor_meta}
                  onChange={e => setForm(f => ({ ...f, valor_meta: e.target.value }))}
                  placeholder="Ex: 15000"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Período</label>
                <select
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  value={form.periodo}
                  onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))}
                >
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Início</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                    value={form.data_inicio}
                    onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Fim</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                    value={form.data_fim}
                    onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-700">
              <button
                onClick={closeModal}
                className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2 text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.valor_meta || saveMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
