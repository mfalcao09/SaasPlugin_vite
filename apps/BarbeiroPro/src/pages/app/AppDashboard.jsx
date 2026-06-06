import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState, useEffect } from 'react';
import { Calendar, Users, DollarSign, CheckCircle, TrendingUp, Clock, AlertCircle, X, AlertTriangle, Zap, Globe, Copy } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfMonth, isToday, differenceInMinutes, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

const statusConfig = {
  agendado: { label: 'Agendado', color: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  em_atendimento: { label: 'Na Cadeira', color: 'bg-yellow-100 text-yellow-700' },
  concluido: { label: 'Concluído', color: 'bg-gray-100 text-gray-600' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
  faltou: { label: 'Faltou', color: 'bg-orange-100 text-orange-600' },
};

export default function AppDashboard() {
  const { company, companyId, isLoading: loadingCompany } = useCompany();
  const [alerts, setAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const { data: appointments = [], isLoading: loadingAppts } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: () => base44.entities.Appointment.filter({ company_id: companyId }, '-scheduled_at', 200),
    enabled: !!companyId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => base44.entities.Customer.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: financial = [] } = useQuery({
    queryKey: ['financial', companyId],
    queryFn: () => base44.entities.FinancialEntry.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const now = new Date();
  const todayStr = now.toDateString();

  const todayAppts = appointments.filter(a => new Date(a.scheduled_at).toDateString() === todayStr);
  const upcomingToday = todayAppts
    .filter(a => new Date(a.scheduled_at) >= now && !['cancelado', 'concluido', 'faltou'].includes(a.status))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const monthStart = startOfMonth(now);
  const monthAppts = appointments.filter(a => new Date(a.scheduled_at) >= monthStart);
  const completedMonth = monthAppts.filter(a => a.status === 'concluido');
  const revenue = financial.filter(f => f.type === 'entrada' && new Date(f.date) >= monthStart).reduce((s, f) => s + (f.amount || 0), 0);
  const avgTicket = completedMonth.length > 0 ? revenue / completedMonth.length : 0;

  // Top services
  const serviceMap = {};
  completedMonth.forEach(a => {
    if (!a.service_name) return;
    serviceMap[a.service_name] = (serviceMap[a.service_name] || 0) + 1;
  });
  const topServices = Object.entries(serviceMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // AI bottleneck detection
  useEffect(() => {
    if (!appointments.length && !customers.length) return;
    const detected = [];

    // 1. Agendamentos pendentes sem confirmação há mais de 2h
    const pendingOld = todayAppts.filter(a =>
      a.status === 'agendado' &&
      differenceInMinutes(now, new Date(a.scheduled_at)) > 120
    );
    if (pendingOld.length > 0) {
      detected.push({
        id: 'pending_old',
        level: 'high',
        title: `${pendingOld.length} agendamento${pendingOld.length > 1 ? 's' : ''} sem confirmação há +2h`,
        desc: 'Clientes podem estar esperando. Confirme ou entre em contato.',
        href: '/app/agenda',
        icon: 'clock',
      });
    }

    // 2. Alta taxa de cancelamento hoje
    const cancelledToday = todayAppts.filter(a => a.status === 'cancelado' || a.status === 'faltou');
    const cancelRate = todayAppts.length > 0 ? cancelledToday.length / todayAppts.length : 0;
    if (cancelRate >= 0.3 && cancelledToday.length >= 2) {
      detected.push({
        id: 'high_cancel',
        level: 'high',
        title: `Taxa de cancelamento alta hoje: ${Math.round(cancelRate * 100)}%`,
        desc: `${cancelledToday.length} cancelamentos/faltas registrados. Verifique os horários vagos.`,
        href: '/app/agenda',
        icon: 'warning',
      });
    }

    // 3. Clientes VIP inativos
    const vipInactive = customers.filter(c => {
      if (c.status !== 'vip' || !c.last_appointment_at) return false;
      return differenceInDays(now, new Date(c.last_appointment_at)) > 21;
    });
    if (vipInactive.length > 0) {
      detected.push({
        id: 'vip_inactive',
        level: 'medium',
        title: `${vipInactive.length} cliente${vipInactive.length > 1 ? 's' : ''} VIP sem retorno há +21 dias`,
        desc: 'Seus melhores clientes estão sumindo. Use o AI Growth para reativá-los.',
        href: '/app/ai-growth',
        icon: 'zap',
      });
    }

    // 4. Nenhum agendamento hoje
    if (!loadingAppts && todayAppts.length === 0) {
      detected.push({
        id: 'empty_today',
        level: 'medium',
        title: 'Agenda vazia hoje',
        desc: 'Nenhum agendamento para hoje. Compartilhe seu link público para receber mais clientes.',
        href: '/app/configuracoes',
        icon: 'warning',
      });
    }

    setAlerts(detected);
  }, [appointments, customers, loadingAppts]);

  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));
  const dismissAlert = (id) => setDismissedAlerts(prev => new Set([...prev, id]));

  const [copiedLink, setCopiedLink] = useState(false);
  const bookingLink = company?.slug ? `${window.location.origin}/agendar/${company.slug}` : null;
  const copyBookingLink = () => {
    if (!bookingLink) return;
    navigator.clipboard.writeText(bookingLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Top professionals
  const proMap = {};
  completedMonth.forEach(a => {
    if (!a.professional_name) return;
    proMap[a.professional_name] = (proMap[a.professional_name] || 0) + 1;
  });
  const topPros = Object.entries(proMap).sort((a, b) => b[1] - a[1]).slice(0, 3);



  const isLoading = loadingCompany || loadingAppts;

  if (isLoading) {
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
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#1B1C1E]">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })} · {company?.name || 'Sua barbearia'}</p>
        </div>

        {/* Link público de agendamento */}
        {bookingLink ? (
          <div className="bg-[#1B3A4B]/5 border border-[#1B3A4B]/20 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-9 h-9 bg-[#1B3A4B] rounded-xl flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#1B3A4B] mb-0.5">Seu link público de agendamento</div>
              <div className="text-sm text-gray-700 truncate">{bookingLink}</div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={copyBookingLink}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${copiedLink ? 'bg-green-100 text-green-700' : 'bg-[#1B3A4B] text-white hover:bg-[#1B3A4B]/90'}`}>
                <Copy className="w-3 h-3" />{copiedLink ? 'Copiado!' : 'Copiar'}
              </button>
              <a href={bookingLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#1B3A4B] text-[#1B3A4B] hover:bg-[#1B3A4B]/5 transition-all">
                Ver página
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Globe className="w-4 h-4 text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-700 flex-1">Configure o <strong>slug</strong> da sua barbearia para ativar o link público de agendamento.</p>
            <Link to="/app/configuracoes" className="text-xs font-semibold text-yellow-700 underline whitespace-nowrap">Configurar →</Link>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Agendamentos hoje', value: todayAppts.length, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Faturamento (mês)', value: `R$${revenue.toFixed(0)}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total clientes', value: customers.length, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Ticket médio', value: `R$${avgTicket.toFixed(0)}`, icon: TrendingUp, color: 'text-[#1B3A4B]', bg: 'bg-[#1B3A4B]/10' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-black/8 p-5">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="text-2xl font-black text-[#1B1C1E]">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Agenda do dia */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-black/8 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1B1C1E]">Agenda de hoje</h2>
              <Link to="/app/agenda" className="text-xs text-[#1B3A4B] font-medium hover:underline">Ver agenda →</Link>
            </div>
            {todayAppts.length > 0 ? (
              <div className="space-y-2 max-h-[340px] overflow-y-auto">
                {todayAppts.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).map(appt => (
                  <div key={appt.id} className="flex items-center gap-4 p-3 rounded-xl bg-[#F8F7F3]">
                    <div className="w-14 text-center flex-shrink-0">
                      <div className="font-bold text-sm text-[#1B1C1E]">{format(new Date(appt.scheduled_at), 'HH:mm')}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[#1B1C1E] truncate">{appt.customer_name || 'Cliente'}</div>
                      <div className="text-xs text-gray-400">{appt.service_name} · {appt.professional_name}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 ${statusConfig[appt.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {statusConfig[appt.status]?.label || appt.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum agendamento hoje</p>
                <Link to="/app/agenda" className="text-xs text-[#1B3A4B] font-medium mt-2 inline-block hover:underline">Criar agendamento →</Link>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Próximos horários */}
            {upcomingToday.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/8 p-5">
                <h3 className="font-bold text-[#1B1C1E] mb-3 text-sm">Próximos horários</h3>
                <div className="space-y-2">
                  {upcomingToday.slice(0, 4).map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Clock className="w-3.5 h-3.5 text-[#1B3A4B] flex-shrink-0" />
                      <span className="font-semibold text-[#1B1C1E]">{format(new Date(a.scheduled_at), 'HH:mm')}</span>
                      <span className="text-gray-500 truncate">{a.customer_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top serviços */}
            {topServices.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/8 p-5">
                <h3 className="font-bold text-[#1B1C1E] mb-3 text-sm">Serviços mais vendidos (mês)</h3>
                <div className="space-y-2">
                  {topServices.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 truncate">{name}</span>
                      <span className="text-sm font-bold text-[#1B3A4B]">{count}x</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top profissionais */}
            {topPros.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/8 p-5">
                <h3 className="font-bold text-[#1B1C1E] mb-3 text-sm">Profissionais ativos (mês)</h3>
                <div className="space-y-2">
                  {topPros.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 truncate">{name}</span>
                      <span className="text-sm font-bold text-[#1B3A4B]">{count} atend.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ações rápidas */}
            <div className="bg-white rounded-2xl border border-black/8 p-5">
              <h3 className="font-bold text-[#1B1C1E] mb-3 text-sm">Ações rápidas</h3>
              <div className="space-y-2">
                {[
                  { label: '+ Novo agendamento', href: '/app/agenda' },
                  { label: '+ Novo cliente', href: '/app/clientes' },
                  { label: '+ Lançamento financeiro', href: '/app/financeiro' },
                ].map(item => (
                  <Link key={item.href} to={item.href}
                    className="block text-sm font-medium text-[#1B3A4B] hover:underline py-1">
                    {item.label}
                  </Link>
                ))}
                {bookingLink && (
                  <a href={bookingLink} target="_blank" rel="noopener noreferrer"
                    className="block text-sm font-medium text-[#1B3A4B] hover:underline py-1">
                    🔗 Abrir link de agendamento
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Bottleneck Alerts */}
      {visibleAlerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
          {visibleAlerts.map(alert => (
            <div
              key={alert.id}
              className={`bg-white rounded-2xl border shadow-xl p-4 flex gap-3 items-start ${
                alert.level === 'high' ? 'border-red-200' : 'border-yellow-200'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                alert.level === 'high' ? 'bg-red-100' : 'bg-yellow-100'
              }`}>
                {alert.icon === 'clock' && <Clock className={`w-4 h-4 ${alert.level === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />}
                {alert.icon === 'warning' && <AlertTriangle className={`w-4 h-4 ${alert.level === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />}
                {alert.icon === 'zap' && <Zap className="w-4 h-4 text-yellow-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold mb-0.5 ${alert.level === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                  {alert.level === 'high' ? '🔴 ' : '🟡 '}{alert.title}
                </div>
                <p className="text-xs text-gray-500 mb-2">{alert.desc}</p>
                <Link to={alert.href} onClick={() => dismissAlert(alert.id)}
                  className={`text-xs font-semibold underline ${
                    alert.level === 'high' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                  Ver agora →
                </Link>
              </div>
              <button onClick={() => dismissAlert(alert.id)} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}