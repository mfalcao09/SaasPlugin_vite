import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { useTenantEmpresa } from '@/hooks/useTenantEmpresa'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  ClipboardList, DollarSign, FileText, Car, Users, TrendingUp,
  AlertTriangle, Loader2,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; bg: string; fg: string }> = {
  aberto:           { label: 'Aberto',        bg: '#F3F4F6', fg: '#6B7280' },
  em_andamento:     { label: 'Em andamento',  bg: 'var(--status-blue-bg)',  fg: 'var(--status-blue-fg)' },
  aguardando_pecas: { label: 'Aguard. peças', bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  concluido:        { label: 'Concluído',     bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  entregue:         { label: 'Entregue',      bg: '#EDE9FE', fg: '#7C3AED' },
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function DashboardSupabase() {
  const { empresaId, loading: contextLoading } = useTenantEmpresa()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId || contextLoading) return
    const load = async () => {
      setLoading(true)
      const [{ data: clientes }, { data: veiculos }, { data: orcamentos }, { data: ordens }] =
        await Promise.all([
          db.clientes.list(empresaId),
          db.veiculos.list(empresaId),
          db.orcamentos.list(empresaId),
          db.ordensServico.list(empresaId),
        ])

      const os = ordens ?? []
      const orc = orcamentos ?? []

      const hoje = new Date().toISOString().slice(0, 10)
      const osAbertas   = os.filter((o: any) => o.status !== 'concluido' && o.status !== 'entregue')
      const osHoje      = os.filter((o: any) => (o.created_at ?? '').slice(0, 10) === hoje)
      const osConcluidas = os.filter((o: any) => o.status === 'concluido' || o.status === 'entregue')

      const mesAtual = new Date().toISOString().slice(0, 7)
      const faturamentoMes = osConcluidas
        .filter((o: any) => (o.created_at ?? '').slice(0, 7) === mesAtual)
        .reduce((s: number, o: any) => s + (o.valor_total ?? 0), 0)

      const orcPendentes = orc.filter((o: any) => o.status === 'rascunho' || o.status === 'enviado')

      const osPorStatus = Object.entries(statusConfig).map(([k, v]) => ({
        label: v.label,
        qtd: os.filter((o: any) => o.status === k).length,
      })).filter(s => s.qtd > 0)

      const alertas: { titulo: string; sub: string }[] = []
      orcPendentes.slice(0, 2).forEach((o: any) => {
        const dias = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000)
        if (dias >= 2) alertas.push({ titulo: `Orçamento pendente há ${dias} dias`, sub: o.clientes?.nome ?? '' })
      })

      const ultimasOS = [...os]
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)

      setData({
        totalClientes: (clientes ?? []).length,
        totalVeiculos: (veiculos ?? []).length,
        osAbertas: osAbertas.length,
        osHoje: osHoje.length,
        orcPendentes: orcPendentes.length,
        faturamentoMes,
        osPorStatus,
        alertas,
        ultimasOS,
      })
      setLoading(false)
    }
    load()
  }, [empresaId, contextLoading])

  if (!data || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand)' }} />
      </div>
    )
  }

  const kpis = [
    { icon: ClipboardList, label: 'OS em Aberto',    value: data.osAbertas,           link: '/ordens' },
    { icon: ClipboardList, label: 'OS Abertas hoje', value: data.osHoje,              link: '/ordens' },
    { icon: FileText,      label: 'Orç. Pendentes',  value: data.orcPendentes,        link: '/orcamentos' },
    { icon: DollarSign,    label: 'Faturamento mês', value: fmt(data.faturamentoMes), link: '/financeiro' },
    { icon: Users,         label: 'Clientes',        value: data.totalClientes,       link: '/clientes' },
    { icon: Car,           label: 'Veículos',        value: data.totalVeiculos,       link: '/veiculos' },
  ]

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: 'var(--surface)' }}>
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>Dashboard</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>Visão operacional em tempo real</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map(({ icon: Icon, label, value, link }) => (
          <Link key={label} to={link}
            className="block rounded-sm border p-4 transition-all"
            style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--line)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand-line)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center mb-3"
              style={{ backgroundColor: 'var(--brand-subtle)' }}>
              <Icon className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
            </div>
            <div className="text-[22px] font-black leading-none mb-1" style={{ color: 'var(--ink)' }}>{value}</div>
            <div className="text-[12px] font-medium" style={{ color: 'var(--ink-muted)' }}>{label}</div>
          </Link>
        ))}
      </div>

      {/* Gráfico + Alertas */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-sm border p-5" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--line)' }}>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: 'var(--ink)' }}>OS por status</h2>
          {data.osPorStatus.length === 0 ? (
            <p className="text-[12px] py-8 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhuma OS ainda</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.osPorStatus}>
                <XAxis dataKey="label" tick={{ fill: 'var(--ink-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 2, color: 'var(--ink)', fontSize: 11 }}
                  cursor={{ fill: 'var(--surface-sunken)' }}
                />
                <Bar dataKey="qtd" fill="var(--brand)" radius={[2, 2, 0, 0]} name="OS" maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-sm border p-5" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--line)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
              Alertas
            </h2>
          </div>
          {data.alertas.length === 0 ? (
            <div className="rounded-sm border p-4 text-center"
              style={{ backgroundColor: 'var(--status-green-bg)', borderColor: 'var(--status-green-fg)' }}>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--status-green-fg)' }}>Tudo em ordem</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.alertas.map((a: { titulo: string; sub: string }, i: number) => (
                <div key={i} className="rounded-sm border p-3"
                  style={{ backgroundColor: 'var(--surface-sunken)', borderColor: '#FCA5A5' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3 h-3" style={{ color: '#DC2626' }} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: '#DC2626' }}>ATENÇÃO</span>
                  </div>
                  <p className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{a.titulo}</p>
                  {a.sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{a.sub}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Últimas OS */}
      <div className="rounded-sm border" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--line)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <h2 className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>Ordens Recentes</h2>
          <Link to="/ordens" className="text-[11px] font-semibold" style={{ color: 'var(--brand)' }}>Ver todas →</Link>
        </div>
        {data.ultimasOS.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Nenhuma OS registrada ainda.</p>
            <Link to="/ordens"
              className="inline-block mt-3 text-[12px] font-bold px-4 py-2 rounded-sm text-white"
              style={{ backgroundColor: 'var(--brand)' }}>
              Criar primeira OS
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {['Descrição', 'Cliente', 'Status', 'Valor'].map((h, i) => (
                    <th key={h}
                      className={`px-5 py-3 text-left text-[11px] font-semibold tracking-wide ${i === 3 ? 'text-right' : ''} ${i === 1 ? 'hidden sm:table-cell' : ''}`}
                      style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.ultimasOS.map((os: any) => {
                  const sc = statusConfig[os.status] ?? statusConfig.aberto
                  return (
                    <tr key={os.id} style={{ borderBottom: '1px solid var(--line-soft)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-sunken)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-5 py-3 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                        {(os.descricao ?? '').slice(0, 40)}
                      </td>
                      <td className="px-5 py-3 text-[12px] hidden sm:table-cell" style={{ color: 'var(--ink-muted)' }}>
                        {os.clientes?.nome ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold"
                          style={{ backgroundColor: sc.bg, color: sc.fg }}>{sc.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] font-bold" style={{ color: 'var(--brand)' }}>
                        {fmt(os.valor_total ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
