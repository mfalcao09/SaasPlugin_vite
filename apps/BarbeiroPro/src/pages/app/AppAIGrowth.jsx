import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { Zap, Copy, AlertCircle, TrendingUp, Star, Users, CheckCircle } from 'lucide-react';
import { differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function AppAIGrowth() {
  const { companyId, isLoading: loadingCompany } = useCompany();
  const [copied, setCopied] = useState(null);

  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => base44.entities.Customer.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: appointments = [], isLoading: loadingAppts } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: () => base44.entities.Appointment.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', companyId],
    queryFn: () => base44.entities.Service.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const now = new Date();
  const completedAppts = appointments.filter(a => a.status === 'concluido');

  // Clientes inativos há 30+ dias (com histórico)
  const inactiveCustomers = customers.filter(c => {
    if (!c.last_appointment_at) return false;
    return differenceInDays(now, new Date(c.last_appointment_at)) > 30;
  });

  // Clientes VIP inativos há 21+ dias
  const vipInactive = customers.filter(c => {
    if (c.status !== 'vip') return false;
    if (!c.last_appointment_at) return false;
    return differenceInDays(now, new Date(c.last_appointment_at)) > 21;
  });

  // Horário fraco (< 2 agendamentos)
  const hourCounts = {};
  appointments.filter(a => {
    const d = new Date(a.scheduled_at);
    return d >= startOfMonth(subMonths(now, 1)) && d <= endOfMonth(subMonths(now, 1));
  }).forEach(a => {
    const h = new Date(a.scheduled_at).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const weakHours = Object.entries(hourCounts).filter(([, v]) => v < 2).map(([h]) => `${h}:00`);

  // Serviço sem venda no mês
  const thisMonthAppts = appointments.filter(a => {
    const d = new Date(a.scheduled_at);
    return d >= startOfMonth(now) && d <= endOfMonth(now);
  });
  const soldServiceIds = new Set(thisMonthAppts.map(a => a.service_id));
  const unsoldServices = services.filter(s => s.active && !soldServiceIds.has(s.id));

  const insights = [
    ...(vipInactive.length > 0 ? [{
      id: 'vip',
      title: `${vipInactive.length} cliente${vipInactive.length > 1 ? 's' : ''} VIP sem retorno há +21 dias`,
      description: 'Seus clientes mais valiosos estão com visita atrasada. Eles merecem atenção especial e mensagem personalizada.',
      priority: 'alta',
      count: vipInactive.length,
      icon: Star,
      iconColor: 'text-yellow-500',
      iconBg: 'bg-yellow-50',
      message: `Olá [Nome]! 🌟 Aqui é da ${appointments[0] ? 'barbearia' : 'equipe'}. Seu espaço preferido está esperando por você! Temos horários disponíveis essa semana — é só confirmar aqui ou me chamar no WhatsApp. Sua satisfação é nossa prioridade! ✂️`,
    }] : []),
    ...(inactiveCustomers.length > 0 ? [{
      id: 'inactive',
      title: `${inactiveCustomers.length} cliente${inactiveCustomers.length > 1 ? 's' : ''} sem visita há +30 dias`,
      description: 'Clientes que costumavam visitar com regularidade pararam de aparecer. Momento ideal para reativar com uma mensagem direta.',
      priority: 'alta',
      count: inactiveCustomers.length,
      icon: AlertCircle,
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-50',
      message: `Oi [Nome]! Já faz um tempinho que não te vemos aqui. 😄 Que tal garantir seu horário essa semana? A agenda está aberta e te esperamos! Bora agendar? ✂️`,
    }] : []),
    ...(weakHours.length > 0 ? [{
      id: 'weak_hours',
      title: `Horários com pouca demanda: ${weakHours.slice(0, 3).join(', ')}`,
      description: 'Esses horários tiveram menos de 2 agendamentos no mês passado. Considere promoções para preencher a agenda.',
      priority: 'media',
      count: weakHours.length,
      icon: TrendingUp,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-50',
      message: `Ei, [Nome]! 🕐 Que tal aproveitar um horário especial? Estamos com disponibilidade em ${weakHours.slice(0, 2).join(' e ')} com condição diferenciada. Me chama pra agendar! ✂️`,
    }] : []),
    ...(unsoldServices.length > 0 ? [{
      id: 'unsold',
      title: `${unsoldServices.length} serviço${unsoldServices.length > 1 ? 's' : ''} sem agendamento este mês`,
      description: `Serviço${unsoldServices.length > 1 ? 's' : ''} ativo${unsoldServices.length > 1 ? 's' : ''} sem nenhum agendamento no mês atual: ${unsoldServices.slice(0, 2).map(s => s.name).join(', ')}`,
      priority: 'media',
      count: unsoldServices.length,
      icon: Zap,
      iconColor: 'text-purple-500',
      iconBg: 'bg-purple-50',
      message: `Oi [Nome]! 💈 Você já conheceu nosso ${unsoldServices[0]?.name}? É um dos favoritos da casa e temos horários disponíveis essa semana. Me chama pra marcar!`,
    }] : []),
  ];

  const handleCopy = (id, msg) => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2500);
    });
  };

  const isLoading = loadingCompany || loadingCustomers || loadingAppts;

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-900" />
            </div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">AI Growth Engine</h1>
          </div>
          <p className="text-gray-500 text-sm">Insights automáticos baseados nos dados reais da sua barbearia</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1B3A4B]/20 border-t-[#1B3A4B] rounded-full animate-spin" />
          </div>
        ) : insights.length > 0 ? (
          <div className="grid gap-5">
            {insights.map(insight => (
              <div key={insight.id} className="bg-white rounded-2xl border border-black/8 p-6">
                <div className="flex items-start gap-4 mb-5">
                  <div className={`w-10 h-10 ${insight.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <insight.icon className={`w-5 h-5 ${insight.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-[#1B1C1E]">{insight.title}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${insight.priority === 'alta' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {insight.priority === 'alta' ? '🔴 Alta' : '🟡 Média'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{insight.description}</p>
                  </div>
                  <div className="text-2xl font-black text-[#1B3A4B] flex-shrink-0">{insight.count}</div>
                </div>
                <div className="bg-[#F8F7F3] rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">💬 Mensagem sugerida para WhatsApp</div>
                  <p className="text-sm text-gray-700 italic mb-3">"{insight.message}"</p>
                  <button onClick={() => handleCopy(insight.id, insight.message)}
                    className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${copied === insight.id ? 'bg-green-100 text-green-700' : 'bg-[#1B3A4B] text-white hover:bg-[#1B3A4B]/90'}`}>
                    {copied === insight.id ? <><CheckCircle className="w-3.5 h-3.5" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar mensagem</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-black/8 p-12 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-bold text-[#1B1C1E] mb-2">Tudo certo por enquanto!</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              {customers.length === 0
                ? 'Cadastre clientes e crie agendamentos para que o AI Growth comece a gerar insights reais.'
                : 'Nenhum alerta crítico no momento. Continue registrando atendimentos para análises mais precisas.'}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}