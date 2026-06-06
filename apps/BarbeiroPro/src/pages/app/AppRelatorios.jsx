import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['#1B3A4B', '#2D5C73', '#3D7A96', '#4F9AB8', '#6ABCD0'];

export default function AppRelatorios() {
  const { companyId, isLoading: loadingCompany } = useCompany();
  const [period, setPeriod] = useState('this_month');

  const { data: appointments = [], isLoading: loadingAppts } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: () => base44.entities.Appointment.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: financial = [] } = useQuery({
    queryKey: ['financial', companyId],
    queryFn: () => base44.entities.FinancialEntry.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => base44.entities.Customer.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const now = new Date();
  const filterByPeriod = (item, dateField = 'scheduled_at') => {
    const d = new Date(item[dateField]);
    if (period === 'this_month') return d >= startOfMonth(now) && d <= endOfMonth(now);
    if (period === 'last_month') { const lm = subMonths(now, 1); return d >= startOfMonth(lm) && d <= endOfMonth(lm); }
    return true;
  };

  const periodAppts = appointments.filter(a => filterByPeriod(a));
  const completedAppts = periodAppts.filter(a => a.status === 'concluido');
  const periodFinancial = financial.filter(f => filterByPeriod(f, 'date'));

  const totalRevenue = periodFinancial.filter(f => f.type === 'entrada').reduce((s, f) => s + (f.amount || 0), 0);
  const apptRevenue = completedAppts.reduce((s, a) => s + (a.price || 0), 0);
  const effectiveRevenue = totalRevenue || apptRevenue; // Use financial if available, else from appointments
  const avgTicket = completedAppts.length > 0 ? effectiveRevenue / completedAppts.length : 0;
  const cancelledRate = periodAppts.length > 0 ? ((periodAppts.filter(a => a.status === 'cancelado').length / periodAppts.length) * 100).toFixed(0) : 0;

  // Service stats
  const serviceMap = {};
  completedAppts.forEach(a => {
    if (!a.service_name) return;
    serviceMap[a.service_name] = (serviceMap[a.service_name] || 0) + 1;
  });
  const serviceData = Object.entries(serviceMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);

  // Professional stats
  const proMap = {};
  completedAppts.forEach(a => {
    if (!a.professional_name) return;
    proMap[a.professional_name] = (proMap[a.professional_name] || 0) + 1;
  });
  const proData = Object.entries(proMap).map(([name, atendimentos]) => ({ name, atendimentos })).sort((a, b) => b.atendimentos - a.atendimentos);

  // Recurring customers (2+ appointments in period)
  const customerMap = {};
  completedAppts.forEach(a => { if (a.customer_id) customerMap[a.customer_id] = (customerMap[a.customer_id] || 0) + 1; });
  const recurringCount = Object.values(customerMap).filter(v => v >= 2).length;

  if (loadingCompany || loadingAppts) {
    return (
      <AppLayout>
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-[#1B3A4B]/20 border-t-[#1B3A4B] rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Relatórios</h1>
            <p className="text-gray-500 text-sm mt-1">Dados reais da sua operação</p>
          </div>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 border border-black/10 rounded-lg text-sm bg-white focus:outline-none">
            <option value="this_month">Este mês</option>
            <option value="last_month">Mês passado</option>
            <option value="all">Todo o período</option>
          </select>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total agendamentos', value: periodAppts.length },
            { label: 'Concluídos', value: completedAppts.length },
            { label: 'Receita', value: `R$${effectiveRevenue.toFixed(0)}` },
            { label: 'Ticket médio', value: `R$${avgTicket.toFixed(0)}` },
            { label: 'Taxa cancelamento', value: `${cancelledRate}%` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-black/8 p-4">
              <div className="text-xl font-black text-[#1B1C1E]">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          {/* Top services chart */}
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-4">Serviços mais vendidos</h2>
            {serviceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serviceData} margin={{ left: -10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#1B3A4B" radius={[4, 4, 0, 0]} name="Vendas" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
                Sem atendimentos concluídos no período
              </div>
            )}
          </div>

          {/* Top professionals */}
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-4">Profissionais mais ativos</h2>
            {proData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={proData} margin={{ left: -10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="atendimentos" fill="#2D5C73" radius={[4, 4, 0, 0]} name="Atendimentos" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
                Sem dados no período
              </div>
            )}
          </div>
        </div>

        {/* Pie + text stats */}
        <div className="grid lg:grid-cols-2 gap-5">
          {serviceData.length > 0 && (
            <div className="bg-white rounded-2xl border border-black/8 p-6">
              <h2 className="font-bold text-[#1B1C1E] mb-4">Distribuição de serviços</h2>
              <div className="flex items-center gap-6">
                <PieChart width={140} height={140}>
                  <Pie data={serviceData} dataKey="total" cx={65} cy={65} outerRadius={60} innerRadius={30}>
                    {serviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
                <div className="space-y-2 flex-1">
                  {serviceData.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-600 truncate max-w-[100px]">{s.name}</span>
                      </div>
                      <span className="text-xs font-bold text-[#1B1C1E]">{s.total}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-4">Indicadores de clientes</h2>
            <div className="space-y-4">
              {[
                { label: 'Total de clientes cadastrados', value: customers.length },
                { label: 'Clientes recorrentes no período', value: recurringCount },
                { label: 'Novos agendamentos no período', value: periodAppts.length },
                { label: 'Taxa de conclusão', value: periodAppts.length > 0 ? `${((completedAppts.length / periodAppts.length) * 100).toFixed(0)}%` : '–' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className="text-sm font-bold text-[#1B3A4B]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}