import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, DollarSign, TrendingUp, Users, BarChart3 } from 'lucide-react';

export default function AppRelatorios() {
  const { user, loading: companyLoading } = useCompany();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.company_id) return;
    base44.entities.Order.filter({ company_id: user.company_id }, '-created_date', 500)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.company_id]);

  const delivered = orders.filter(o => o.status === 'entregue');
  const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
  const avgTicket = delivered.length > 0 ? totalRevenue / delivered.length : 0;

  // Pedidos por dia (últimos 7 dias)
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split('T')[0];
    const dayOrders = orders.filter(o => o.created_date?.startsWith(ds));
    return {
      day: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
      pedidos: dayOrders.length,
      faturamento: dayOrders.filter(o => o.payment_status === 'pago').reduce((s, o) => s + (o.total || 0), 0),
    };
  });

  // Bairros
  const neighborhoodMap = {};
  orders.forEach(o => {
    if (o.neighborhood) {
      neighborhoodMap[o.neighborhood] = (neighborhoodMap[o.neighborhood] || 0) + 1;
    }
  });
  const neighborhoodData = Object.entries(neighborhoodMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, pedidos]) => ({ name, pedidos }));

  if (companyLoading || loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Últimos 30 dias de operação</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total de Pedidos', value: orders.length, icon: Package, color: 'text-accent' },
          { label: 'Entregues', value: delivered.length, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Faturamento', value: `R$ ${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-blue-600' },
          { label: 'Ticket Médio', value: `R$ ${avgTicket.toFixed(0)}`, icon: Users, color: 'text-purple-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-4">
            <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="py-20 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Sem dados para exibir</h2>
          <p className="text-sm text-muted-foreground">Os relatórios serão gerados conforme os pedidos chegarem.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="font-bold text-foreground mb-4">Pedidos — Últimos 7 Dias</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={last7} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="pedidos" fill="hsl(12 65% 38%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {neighborhoodData.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-bold text-foreground mb-4">Bairros Mais Fortes</h2>
              <div className="space-y-3">
                {neighborhoodData.map((n, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-foreground font-medium">{n.name}</span>
                      <span className="text-xs font-bold text-accent">{n.pedidos} pedidos</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div className="bg-accent h-2 rounded-full" style={{ width: `${(n.pedidos / neighborhoodData[0].pedidos) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}