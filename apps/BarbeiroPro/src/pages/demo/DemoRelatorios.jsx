import DemoLayout from '@/components/layout/DemoLayout';
import { demoAppointments, demoServices, demoProfessionals, demoFinancial } from '@/lib/demoData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#1B3A4B', '#2D5C73', '#3D7A9B', '#5499BA', '#7AB8D3'];

export default function DemoRelatorios() {
  const serviceData = demoServices.map(s => ({
    name: s.name,
    total: demoAppointments.filter(a => a.service_id === s.id).length,
    receita: demoAppointments.filter(a => a.service_id === s.id && a.status === 'concluido').length * s.price,
  })).sort((a, b) => b.total - a.total);

  const profData = demoProfessionals.map(p => ({
    name: p.name.split(' ')[0],
    atendimentos: demoAppointments.filter(a => a.professional_id === p.id).length,
  }));

  const totalRevenue = demoFinancial.filter(f => f.type === 'entrada').reduce((s, f) => s + f.amount, 0);
  const avgTicket = totalRevenue / demoAppointments.filter(a => a.status === 'concluido').length;

  return (
    <DemoLayout>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#1B1C1E]">Relatórios</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral do período</p>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Agendamentos', value: demoAppointments.length, unit: 'total' },
            { label: 'Receita total', value: `R$${totalRevenue.toFixed(0)}`, unit: 'período' },
            { label: 'Ticket médio', value: `R$${isNaN(avgTicket) ? '0' : avgTicket.toFixed(0)}`, unit: 'por cliente' },
            { label: 'Taxa conclusão', value: `${Math.round(demoAppointments.filter(a => a.status === 'concluido').length / demoAppointments.length * 100)}%`, unit: 'dos agend.' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-black/8 p-5">
              <div className="text-2xl font-black text-[#1B1C1E]">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
              <div className="text-xs text-[#1B3A4B] font-medium mt-0.5">{s.unit}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-5">Serviços mais vendidos</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serviceData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#1B3A4B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-5">Atendimentos por profissional</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={profData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="atendimentos" fill="#2D5C73" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 p-6">
          <h2 className="font-bold text-[#1B1C1E] mb-4">Distribuição de receita por serviço</h2>
          <div className="flex flex-wrap gap-3">
            {serviceData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span>{s.name}</span>
                <span className="font-semibold text-[#1B1C1E]">R${s.receita}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DemoLayout>
  );
}