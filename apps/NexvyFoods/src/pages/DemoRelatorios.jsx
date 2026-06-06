import React from 'react';
import DemoMode from './DemoMode';
import { DEMO_WEEKLY_SALES, DEMO_TOP_PRODUCTS, DEMO_CUSTOMERS, DEMO_ZONES } from '@/lib/demo-data';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Package, Users, DollarSign, Clock, MapPin } from 'lucide-react';

const neighborhoodData = [
  { name: 'Pinheiros', pedidos: 42 },
  { name: 'Jardins', pedidos: 35 },
  { name: 'Vila Madalena', pedidos: 28 },
  { name: 'Bela Vista', pedidos: 22 },
  { name: 'Cerqueira César', pedidos: 18 },
];

const hourlyData = [
  { hora: '11h', pedidos: 2 }, { hora: '12h', pedidos: 8 }, { hora: '13h', pedidos: 12 },
  { hora: '14h', pedidos: 6 }, { hora: '18h', pedidos: 14 }, { hora: '19h', pedidos: 22 },
  { hora: '20h', pedidos: 28 }, { hora: '21h', pedidos: 18 }, { hora: '22h', pedidos: 10 },
];

export default function DemoRelatorios() {
  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">Análise da última semana</p>
          </div>
          <select className="text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none">
            <option>Esta semana</option>
            <option>Este mês</option>
            <option>Últimos 30 dias</option>
          </select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total de Pedidos', value: '107', sub: '+18% vs semana anterior', icon: Package, color: 'text-accent' },
            { label: 'Faturamento', value: 'R$ 4.670', sub: '+22%', icon: DollarSign, color: 'text-green-600' },
            { label: 'Ticket Médio', value: 'R$ 43,65', sub: 'Estável', icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Clientes Únicos', value: '64', sub: '8 novos', icon: Users, color: 'text-purple-600' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-4">
              <kpi.icon className={`w-4 h-4 ${kpi.color} mb-2`} />
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              <p className="text-xs text-accent mt-1 font-medium">{kpi.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Vendas por dia */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="font-bold text-foreground mb-4">Pedidos por Dia</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={DEMO_WEEKLY_SALES} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="pedidos" fill="hsl(12 65% 38%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Horários de pico */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="font-bold text-foreground">Horários de Pico</h2>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hora" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Line type="monotone" dataKey="pedidos" stroke="hsl(12 65% 38%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Produtos */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="font-bold text-foreground mb-4">Produtos Mais Vendidos</h2>
            <div className="space-y-3">
              {DEMO_TOP_PRODUCTS.map((p, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground font-medium">{p.name}</span>
                    <span className="text-xs font-bold text-accent">{p.qty}x</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-accent h-2 rounded-full transition-all"
                      style={{ width: `${(p.qty / DEMO_TOP_PRODUCTS[0].qty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bairros Mais Fortes */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-accent" />
              <h2 className="font-bold text-foreground">Bairros Mais Fortes</h2>
            </div>
            <div className="space-y-3">
              {neighborhoodData.map((n, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground font-medium">{n.name}</span>
                    <span className="text-xs font-bold text-accent">{n.pedidos} pedidos</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(n.pedidos / neighborhoodData[0].pedidos) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DemoMode>
  );
}