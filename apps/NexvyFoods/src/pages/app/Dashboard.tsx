import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import {
  ShoppingBag, DollarSign, TrendingUp, Clock, ChevronRight, BarChart2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Order {
  id: string;
  status: string;
  total: number;
  created_at: string;
  customers?: { nome: string } | null;
}

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-orange-100 text-orange-700',
  aceito: 'bg-blue-100 text-blue-700',
  em_preparo: 'bg-blue-100 text-blue-700',
  pronto: 'bg-purple-100 text-purple-700',
  saiu_entrega: 'bg-indigo-100 text-indigo-700',
  entregue: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
  recusado: 'bg-red-100 text-red-700',
};

export default function Dashboard() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) return;
    db.orders.list(company.id).then(({ data }) => {
      setOrders(data ?? []);
    }).finally(() => setLoading(false));
  }, [company?.id]);

  const today = new Date().toISOString().split('T')[0];
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
  const monthRevenue = orders
    .filter(o => o.created_at?.startsWith(monthPrefix) && !['cancelado', 'recusado'].includes(o.status))
    .reduce((s, o) => s + (o.total ?? 0), 0);
  const paidToday = todayOrders.filter(o => !['cancelado', 'recusado'].includes(o.status));
  const avgTicket = paidToday.length > 0
    ? paidToday.reduce((s, o) => s + (o.total ?? 0), 0) / paidToday.length
    : 0;
  const activeOrders = orders.filter(
    o => !['entregue', 'cancelado', 'recusado'].includes(o.status),
  );

  // Pedidos por hora — hoje
  const hourlyMap: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = 0;
  todayOrders.forEach(o => {
    const h = new Date(o.created_at).getHours();
    hourlyMap[h] = (hourlyMap[h] ?? 0) + 1;
  });
  const chartData = Object.entries(hourlyMap).map(([h, qty]) => ({
    hora: `${h}h`,
    pedidos: qty,
  }));

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Bom dia! 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{company?.name}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={ShoppingBag} label="Pedidos hoje" value={todayOrders.length} color="bg-accent" />
        <KpiCard icon={DollarSign} label="Faturamento mês" value={`R$ ${monthRevenue.toFixed(2)}`} color="bg-emerald-500" />
        <KpiCard icon={TrendingUp} label="Ticket médio" value={`R$ ${avgTicket.toFixed(2)}`} color="bg-blue-500" />
        <KpiCard icon={Clock} label="Em andamento" value={activeOrders.length} color="bg-orange-500" />
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-foreground">Pedidos por hora — hoje</h2>
          </div>
          <Link to="/app/pedidos" className="text-xs text-accent flex items-center gap-1 hover:underline">
            Ver pedidos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pedidosGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="pedidos"
              stroke="hsl(var(--accent))"
              fill="url(#pedidosGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pedidos recentes */}
      <div className="bg-white border border-border rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Pedidos recentes</h2>
          <Link to="/app/pedidos" className="text-xs text-accent flex items-center gap-1 hover:underline">
            Ver todos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {orders.slice(0, 8).map(o => (
            <div key={o.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {o.customers?.nome ?? 'Cliente'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? 'bg-secondary text-muted-foreground'}`}>
                  {o.status.replace('_', ' ')}
                </span>
                <span className="text-sm font-bold text-foreground">R$ {(o.total ?? 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum pedido ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
