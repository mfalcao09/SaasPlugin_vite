import React from 'react';
import DemoMode from './DemoMode';
import { DEMO_ORDERS, DEMO_WEEKLY_SALES, DEMO_TOP_PRODUCTS, getStatusConfig, timeSince } from '@/lib/demo-data';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Package, DollarSign, TrendingUp, Users, Clock, Flame } from 'lucide-react';

const todayOrders = DEMO_ORDERS;
const todayRevenue = todayOrders.filter(o => o.payment_status === 'pago').reduce((s, o) => s + o.total, 0);
const avgTicket = todayRevenue / todayOrders.filter(o => o.payment_status === 'pago').length;

export default function DemoDashboard() {
  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Segunda-feira, 7 de abril de 2025</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pedidos Hoje', value: todayOrders.length, sub: '+3 vs ontem', icon: Package, color: 'text-accent' },
            { label: 'Faturamento', value: `R$ ${todayRevenue.toFixed(0)}`, sub: 'Hoje (pagos)', icon: DollarSign, color: 'text-green-600' },
            { label: 'Ticket Médio', value: `R$ ${avgTicket.toFixed(0)}`, sub: 'Hoje', icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Clientes Hoje', value: '6', sub: '2 novos', icon: Users, color: 'text-purple-600' },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</p>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Gráfico Semanal */}
          <div className="md:col-span-2 bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">Vendas da Semana</h2>
              <span className="text-xs text-muted-foreground">Pedidos por dia</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={DEMO_WEEKLY_SALES} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [`${v} pedidos`, '']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Bar dataKey="pedidos" fill="hsl(12 65% 38%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Produtos Campeões */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-accent" />
              <h2 className="font-bold text-foreground">Top Produtos</h2>
            </div>
            <div className="space-y-3">
              {DEMO_TOP_PRODUCTS.slice(0, 4).map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}.</span>
                    <p className="text-sm text-foreground truncate">{p.name}</p>
                  </div>
                  <span className="text-xs font-semibold text-accent ml-2 flex-shrink-0">{p.qty}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pedidos Ativos */}
        <div className="bg-white border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground">Pedidos em Andamento</h2>
            <span className="text-xs bg-accent/10 text-accent font-medium px-2 py-1 rounded-full">
              {DEMO_ORDERS.filter(o => !['entregue', 'cancelado', 'recusado'].includes(o.status)).length} ativos
            </span>
          </div>
          <div className="space-y-3">
            {DEMO_ORDERS.filter(o => !['entregue', 'cancelado', 'recusado'].includes(o.status)).map((order) => {
              const sc = getStatusConfig(order.status);
              return (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${sc.dot}`}></div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{order.order_number} — {order.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{order.items.map(i => i.name).join(', ').substring(0, 50)}...</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold text-foreground">R$ {order.total.toFixed(2)}</p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{timeSince(order.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { status: 'novo', count: 1 },
            { status: 'em_preparo', count: 1 },
            { status: 'pronto', count: 1 },
            { status: 'saiu_entrega', count: 1 },
            { status: 'entregue', count: 2 },
            { status: 'cancelado', count: 0 },
          ].map((s) => {
            const sc = getStatusConfig(s.status);
            return (
              <div key={s.status} className={`${sc.bg} rounded-xl p-3 text-center`}>
                <p className={`text-xl font-bold ${sc.text}`}>{s.count}</p>
                <p className={`text-xs font-medium ${sc.text} mt-1`}>{sc.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </DemoMode>
  );
}