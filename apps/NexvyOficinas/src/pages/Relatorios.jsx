import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { BarChart2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoDashboardStats, demoFinanceiro } from "@/data/demoData";

const COLORS = ["#f59e0b", "#ea580c", "#3b82f6", "#8b5cf6", "#10b981"];

export default function Relatorios() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const stats = demoDashboardStats;
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-white">Relatórios</h1>
            <p className="text-gray-500 text-sm mt-1">Análise de performance e tendências · Abril 2026</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">OS por dia da semana</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.os_semana}>
                  <XAxis dataKey="dia" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                  <Bar dataKey="concluidas" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Concluídas" />
                  <Bar dataKey="abertas" fill="#374151" radius={[4, 4, 0, 0]} name="Abertas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">Faturamento semanal</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={demoFinanceiro.faturamento_semanal}>
                  <XAxis dataKey="semana" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} formatter={v => [`R$ ${v.toLocaleString('pt-BR')}`, 'Faturamento']} />
                  <Bar dataKey="valor" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">Serviços mais executados</h3>
              <div className="space-y-3">
                {stats.servicos_top.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{s.servico}</span>
                        <span className="text-xs text-gray-500">{s.quantidade}x</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.quantidade / 38) * 100}%`, background: COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">Resumo do mês</h3>
              <div className="space-y-3">
                {[
                  { label: "OS Concluídas", value: "24", color: "text-green-400" },
                  { label: "Taxa de Aprovação de Orçamentos", value: "74%", color: "text-amber-400" },
                  { label: "Ticket Médio", value: "R$ 1.190", color: "text-purple-400" },
                  { label: "Clientes Únicos Atendidos", value: "19", color: "text-blue-400" },
                  { label: "Veículos Atendidos", value: "21", color: "text-orange-400" },
                  { label: "Serviços Recorrentes", value: "68%", color: "text-teal-400" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <span className="text-sm text-gray-400">{item.label}</span>
                    <span className={`font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}