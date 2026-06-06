import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ClipboardList, FileText, Car, Users, DollarSign, TrendingUp, AlertCircle, Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoDashboardStats } from "@/data/demoData";

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const stats = demoDashboardStats;

  const StatCard = ({ label, value, sub, icon: Icon, color, link }) => (
    <Link to={link || "#"} className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-xl p-5 flex flex-col gap-3 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-black text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </Link>
  );

  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-black text-white">Dashboard</h1>
              <p className="text-gray-500 text-sm mt-1">Bem-vindo, {user?.full_name || "Admin"} · Visão geral da operação</p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-amber-400 font-semibold text-sm">AI Growth Engine — 5 oportunidades identificadas</p>
              <p className="text-gray-400 text-xs mt-0.5">Clientes inativos, orçamentos sem resposta, revisões programadas</p>
            </div>
            <Link to="/ai-growth" className="flex-shrink-0 flex items-center gap-1 text-amber-400 text-xs font-semibold hover:text-amber-300">
              Ver tudo <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="OS Abertas" value={stats.os_abertas} sub="Em andamento" icon={ClipboardList} color="bg-blue-500/20 text-blue-400" link="/ordens" />
            <StatCard label="Orç. Pendentes" value={stats.orcamentos_pendentes} sub="Aguardando aprovação" icon={FileText} color="bg-amber-500/20 text-amber-400" link="/orcamentos" />
            <StatCard label="Em Atendimento" value={stats.veiculos_em_atendimento} sub="Veículos na oficina" icon={Car} color="bg-orange-500/20 text-orange-400" link="/veiculos" />
            <StatCard label="Clientes Inativos" value={stats.clientes_inativos} sub="Sem visita há 60+ dias" icon={Users} color="bg-red-500/20 text-red-400" link="/clientes" />
            <StatCard label="Faturamento" value={`R$ ${stats.faturamento_mes.toLocaleString('pt-BR')}`} sub="Mês atual" icon={DollarSign} color="bg-green-500/20 text-green-400" link="/financeiro" />
            <StatCard label="Ticket Médio" value={`R$ ${stats.ticket_medio.toLocaleString('pt-BR')}`} sub="Por OS no mês" icon={TrendingUp} color="bg-purple-500/20 text-purple-400" link="/financeiro" />
            <StatCard label="A Receber" value={`R$ ${stats.contas_receber.toLocaleString('pt-BR')}`} sub="Pendente de pagamento" icon={AlertCircle} color="bg-yellow-500/20 text-yellow-400" link="/financeiro" />
            <StatCard label="Taxa Aprovação" value={`${stats.taxa_aprovacao}%`} sub="Orçamentos aprovados" icon={CheckCircle2} color="bg-teal-500/20 text-teal-400" link="/orcamentos" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">OS por dia da semana</h3>
              <ResponsiveContainer width="100%" height={200}>
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
              <h3 className="font-bold text-white mb-4">Serviços mais executados</h3>
              <div className="space-y-3">
                {stats.servicos_top.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-gray-500 text-xs w-4">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{s.servico}</span>
                        <span className="text-xs text-gray-500">{s.quantidade}x</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(s.quantidade / 38) * 100}%` }} />
                      </div>
                    </div>
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