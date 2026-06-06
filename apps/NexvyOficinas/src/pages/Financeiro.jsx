import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoFinanceiro } from "@/data/demoData";

export default function Financeiro() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const fin = demoFinanceiro;
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-white">Financeiro</h1>
            <p className="text-gray-500 text-sm mt-1">Visão financeira da operação · Abril 2026</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Faturamento do Mês", value: `R$ ${fin.faturamento_mes.toLocaleString('pt-BR')}`, sub: "+18% vs. mês anterior", icon: DollarSign, color: "text-green-400", bg: "bg-green-500/20" },
              { label: "Recebido no Mês", value: `R$ ${fin.total_recebido_mes.toLocaleString('pt-BR')}`, sub: "76% do faturamento", icon: CheckCircle, color: "text-blue-400", bg: "bg-blue-500/20" },
              { label: "A Receber", value: `R$ ${fin.total_receber.toLocaleString('pt-BR')}`, sub: "3 lançamentos pendentes", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20" },
              { label: "Ticket Médio", value: `R$ ${fin.ticket_medio.toLocaleString('pt-BR')}`, sub: `${fin.os_concluidas_mes} OS no mês`, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/20" },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500 text-xs">{card.label}</span>
                    <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center`}><Icon className={`w-4 h-4 ${card.color}`} /></div>
                  </div>
                  <div className="text-2xl font-black text-white mb-1">{card.value}</div>
                  <div className="text-xs text-green-400">{card.sub}</div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">Faturamento por semana</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={fin.faturamento_semanal}>
                  <XAxis dataKey="semana" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} formatter={v => [`R$ ${v.toLocaleString('pt-BR')}`, 'Faturamento']} />
                  <Bar dataKey="valor" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">Resultado estimado</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2"><ArrowUpRight className="w-4 h-4 text-green-400" /><span className="text-sm text-gray-300">Faturamento bruto</span></div>
                  <span className="font-bold text-green-400">R$ {fin.faturamento_mes.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-2"><ArrowDownRight className="w-4 h-4 text-red-400" /><span className="text-sm text-gray-300">Custos estimados</span></div>
                  <span className="font-bold text-red-400">- R$ {(fin.faturamento_mes - fin.lucro_bruto_estimado).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-400" /><span className="text-sm font-bold text-white">Lucro bruto estimado</span></div>
                  <span className="font-black text-amber-400 text-lg">R$ {fin.lucro_bruto_estimado.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="font-bold text-white mb-4">Últimos Lançamentos</h3>
            <div className="space-y-2">
              {fin.lancamentos.map(l => (
                <div key={l.id} className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${l.tipo === 'entrada' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {l.tipo === 'entrada' ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{l.descricao}</p>
                    <p className="text-xs text-gray-500">{new Date(l.data).toLocaleDateString('pt-BR')} · {l.forma}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-sm ${l.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                      {l.tipo === 'entrada' ? '+' : '-'} R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${l.status === 'confirmado' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {l.status === 'confirmado' ? 'Confirmado' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}