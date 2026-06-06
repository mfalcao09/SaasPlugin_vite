import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = {
  agendado: { label: 'Agendado', color: 'border-l-blue-400 bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'border-l-green-400 bg-green-50', badge: 'bg-green-100 text-green-700' },
  em_atendimento: { label: 'Na Cadeira', color: 'border-l-yellow-400 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700' },
  concluido: { label: 'Concluído', color: 'border-l-gray-300 bg-gray-50', badge: 'bg-gray-100 text-gray-600' },
  cancelado: { label: 'Cancelado', color: 'border-l-red-300 bg-red-50', badge: 'bg-red-100 text-red-600' },
  faltou: { label: 'Faltou', color: 'border-l-orange-300 bg-orange-50', badge: 'bg-orange-100 text-orange-600' },
};

const hours = Array.from({ length: 13 }, (_, i) => i + 8);

const emptyForm = {
  customer_name: '', customer_phone: '', customer_id: '',
  professional_id: '', service_id: '', scheduled_at: '', notes: '', status: 'agendado', price: 0,
};

export default function AppAgenda() {
  const { company, companyId, isLoading: loadingCompany } = useCompany();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterPro, setFilterPro] = useState('all');
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading: loadingAppts } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: () => base44.entities.Appointment.filter({ company_id: companyId }, '-scheduled_at', 500),
    enabled: !!companyId,
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ['professionals', companyId],
    queryFn: () => base44.entities.Professional.filter({ company_id: companyId, active: true }),
    enabled: !!companyId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', companyId],
    queryFn: () => base44.entities.Service.filter({ company_id: companyId, active: true }),
    enabled: !!companyId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => base44.entities.Customer.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Appointment.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments', companyId] }); setSelectedAppt(null); },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Appointment.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments', companyId] }); setShowNewForm(false); setForm(emptyForm); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Appointment.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments', companyId] }); setSelectedAppt(null); },
  });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));

  const filteredAppts = filterPro === 'all' ? appointments : appointments.filter(a => a.professional_id === filterPro);

  // Conflict check
  const hasConflict = (proId, dateTime, serviceId, excludeId = null) => {
    if (!proId || !dateTime) return false;
    const service = services.find(s => s.id === serviceId);
    const duration = service?.duration_minutes || 30;
    const start = new Date(dateTime);
    const end = new Date(start.getTime() + duration * 60000);
    return appointments.some(a => {
      if (a.id === excludeId) return false;
      if (a.professional_id !== proId) return false;
      if (['cancelado', 'faltou'].includes(a.status)) return false;
      const aStart = new Date(a.scheduled_at);
      const aService = services.find(s => s.id === a.service_id);
      const aDuration = aService?.duration_minutes || 30;
      const aEnd = new Date(aStart.getTime() + aDuration * 60000);
      return start < aEnd && end > aStart;
    });
  };

  const handleCreate = () => {
    if (!form.professional_id || !form.service_id || !form.scheduled_at || !form.customer_name) return;
    if (hasConflict(form.professional_id, form.scheduled_at, form.service_id)) {
      alert('Conflito de horário! Este profissional já tem um agendamento neste horário.');
      return;
    }
    const pro = professionals.find(p => p.id === form.professional_id);
    const svc = services.find(s => s.id === form.service_id);
    const customer = customers.find(c => c.id === form.customer_id);
    createMutation.mutate({
      ...form,
      company_id: companyId,
      professional_name: pro?.name || '',
      service_name: svc?.name || '',
      customer_name: customer?.name || form.customer_name,
      customer_phone: customer?.phone || form.customer_phone,
      price: svc?.price || form.price,
      source: 'interno',
    });
  };

  const handleServiceChange = (sid) => {
    const svc = services.find(s => s.id === sid);
    setForm(p => ({ ...p, service_id: sid, price: svc?.price || 0 }));
  };

  if (loadingCompany) {
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
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Agenda</h1>
            <p className="text-gray-500 text-sm mt-1">Visualização semanal</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Filter by professional */}
            {professionals.length > 0 && (
              <select value={filterPro} onChange={e => setFilterPro(e.target.value)}
                className="px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none bg-white">
                <option value="all">Todos os profissionais</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1 bg-white border border-black/10 rounded-lg p-1">
              <button onClick={() => setCurrentDate(d => addDays(d, -7))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-2">
                {format(weekStart, "d MMM", { locale: ptBR })} — {format(addDays(weekStart, 5), "d MMM", { locale: ptBR })}
              </span>
              <button onClick={() => setCurrentDate(d => addDays(d, 7))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => setShowNewForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />Novo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <div className="grid border-b border-black/8" style={{ gridTemplateColumns: '56px repeat(6, 1fr)' }}>
            <div className="p-3 border-r border-black/8" />
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const dayCount = filteredAppts.filter(a => new Date(a.scheduled_at).toDateString() === day.toDateString()).length;
              return (
                <div key={i} className={`p-3 text-center border-r border-black/8 last:border-r-0 ${isToday ? 'bg-[#1B3A4B]/5' : ''}`}>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">{format(day, 'EEE', { locale: ptBR })}</div>
                  <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-[#1B3A4B]' : 'text-[#1B1C1E]'}`}>{format(day, 'd')}</div>
                  {dayCount > 0 && <div className="text-xs text-[#1B3A4B] font-medium">{dayCount} ag.</div>}
                </div>
              );
            })}
          </div>

          <div className="overflow-y-auto max-h-[560px]">
            {hours.map(hour => (
              <div key={hour} className="grid border-b border-black/5" style={{ gridTemplateColumns: '56px repeat(6, 1fr)' }}>
                <div className="p-2 text-xs text-gray-400 text-right border-r border-black/8 py-3 flex-shrink-0">{hour}:00</div>
                {weekDays.map((day, di) => {
                  const dayAppts = filteredAppts.filter(a => {
                    const d = new Date(a.scheduled_at);
                    return d.toDateString() === day.toDateString() && d.getHours() === hour;
                  });
                  return (
                    <div key={di} className="border-r border-black/5 last:border-r-0 min-h-[52px] p-1">
                      {dayAppts.map(appt => (
                        <div
                          key={appt.id}
                          onClick={() => setSelectedAppt(appt)}
                          className={`rounded border-l-4 p-1.5 mb-1 ${statusConfig[appt.status]?.color || 'border-l-gray-300 bg-gray-50'} cursor-pointer hover:opacity-80 transition-opacity`}
                        >
                          <div className="text-xs font-semibold text-gray-800 truncate">{appt.customer_name || 'Cliente'}</div>
                          <div className="text-xs text-gray-500 truncate">{appt.service_name}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {Object.entries(statusConfig).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${val.badge.split(' ')[0]}`} />
              <span className="text-xs text-gray-500">{val.label}</span>
            </div>
          ))}
        </div>

        {/* Appointment Detail Modal */}
        {selectedAppt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedAppt(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-[#1B1C1E]">Agendamento</h3>
                <button onClick={() => setSelectedAppt(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-2 mb-5">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-xs text-gray-400 block">Cliente</span><p className="font-semibold text-sm">{selectedAppt.customer_name}</p></div>
                  <div><span className="text-xs text-gray-400 block">Telefone</span><p className="font-semibold text-sm">{selectedAppt.customer_phone || '–'}</p></div>
                  <div><span className="text-xs text-gray-400 block">Serviço</span><p className="font-semibold text-sm">{selectedAppt.service_name}</p></div>
                  <div><span className="text-xs text-gray-400 block">Profissional</span><p className="font-semibold text-sm">{selectedAppt.professional_name}</p></div>
                  <div><span className="text-xs text-gray-400 block">Horário</span><p className="font-semibold text-sm">{format(new Date(selectedAppt.scheduled_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p></div>
                  <div><span className="text-xs text-gray-400 block">Valor</span><p className="font-semibold text-sm">R${selectedAppt.price || '–'}</p></div>
                </div>
                {selectedAppt.notes && <div><span className="text-xs text-gray-400 block">Obs.</span><p className="text-sm text-gray-600">{selectedAppt.notes}</p></div>}
              </div>
              <div className="mb-4">
                <span className="text-xs text-gray-400 block mb-2">Alterar status</span>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(statusConfig).map(([key, val]) => (
                    <button key={key}
                      onClick={() => updateMutation.mutate({ id: selectedAppt.id, data: { status: key } })}
                      className={`text-xs font-medium px-2 py-2 rounded-lg ${selectedAppt.status === key ? val.badge + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { if (confirm('Excluir este agendamento?')) deleteMutation.mutate(selectedAppt.id); }}
                className="w-full text-xs text-red-500 hover:text-red-700 font-medium py-2">
                Excluir agendamento
              </button>
            </div>
          </div>
        )}

        {/* New Appointment Form */}
        {showNewForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewForm(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-[#1B1C1E]">Novo Agendamento</h3>
                <button onClick={() => setShowNewForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {/* Customer */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Cliente</label>
                  <select value={form.customer_id} onChange={e => {
                    const c = customers.find(x => x.id === e.target.value);
                    setForm(p => ({ ...p, customer_id: e.target.value, customer_name: c?.name || '', customer_phone: c?.phone || '' }));
                  }} className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                    <option value="">Selecionar cliente cadastrado</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Nome do cliente *</label>
                    <input type="text" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
                      placeholder="Ou digite o nome"
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Telefone</label>
                    <input type="text" value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Serviço *</label>
                  <select value={form.service_id} onChange={e => handleServiceChange(e.target.value)}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                    <option value="">Selecionar serviço</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes}min · R${s.price}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Profissional *</label>
                  <select value={form.professional_id} onChange={e => setForm(p => ({ ...p, professional_id: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                    <option value="">Selecionar profissional</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Data e hora *</label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Observações</label>
                  <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowNewForm(false)} className="flex-1 px-4 py-2.5 border border-black/10 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={handleCreate} disabled={!form.customer_name || !form.service_id || !form.professional_id || !form.scheduled_at || createMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#1B3A4B] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A4B]/90 disabled:opacity-50">
                  {createMutation.isPending ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}