import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Scissors, Clock, ChevronRight, Check, User, ChevronLeft, AlertCircle } from 'lucide-react';
import { format, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function generateTimeSlots(openTime, closeTime, durationMin) {
  const slots = [];
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  let current = oh * 60 + om;
  const end = ch * 60 + cm;
  while (current + durationMin <= end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0');
    const m = (current % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += 30; // 30-min interval slots
  }
  return slots;
}

const DAY_MAP = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };

export default function PublicBooking() {
  const { slug } = useParams();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState({ service: null, professional: null, date: null, time: null });
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [bookingDone, setBookingDone] = useState(null);
  const [formError, setFormError] = useState('');

  const { data: companies = [], isLoading: loadingCompany } = useQuery({
    queryKey: ['company-by-slug', slug],
    queryFn: () => base44.entities.Company.filter({ slug }),
    enabled: !!slug,
  });
  const company = companies[0];

  const { data: services = [] } = useQuery({
    queryKey: ['public-services', company?.id],
    queryFn: () => base44.entities.Service.filter({ company_id: company.id, active: true }),
    enabled: !!company?.id,
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ['public-professionals', company?.id],
    queryFn: () => base44.entities.Professional.filter({ company_id: company.id, active: true }),
    enabled: !!company?.id,
  });

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ['public-appointments', company?.id],
    queryFn: () => base44.entities.Appointment.filter({ company_id: company.id }),
    enabled: !!company?.id,
  });

  const createApptMutation = useMutation({
    mutationFn: (data) => base44.entities.Appointment.create(data),
    onSuccess: (result) => setBookingDone(result),
  });

  const primaryColor = company?.primary_color || '#1B3A4B';

  useEffect(() => {
    if (company?.name) {
      document.title = `Agendar | ${company.name}`;
    }
  }, [company?.name]);

  // Compute available time slots for selected date/professional/service
  const getAvailableSlots = () => {
    if (!selected.date || !selected.service || !company) return [];
    const dayKey = DAY_MAP[selected.date.getDay()];
    const hours = company.business_hours?.[dayKey];
    if (!hours?.active) return [];
    const slots = generateTimeSlots(hours.open || '09:00', hours.close || '19:00', selected.service.duration_minutes || 30);

    return slots.filter(time => {
      const [h, m] = time.split(':');
      const slotStart = new Date(selected.date);
      slotStart.setHours(+h, +m, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + (selected.service.duration_minutes || 30) * 60000);

      // Check conflict with existing appointments for this professional
      const proId = selected.professional?.id;
      if (!proId || proId === 'any') return true;

      return !existingAppointments.some(a => {
        if (a.professional_id !== proId) return false;
        if (['cancelado', 'faltou'].includes(a.status)) return false;
        const aStart = new Date(a.scheduled_at);
        const aService = services.find(s => s.id === a.service_id);
        const aDur = aService?.duration_minutes || 30;
        const aEnd = new Date(aStart.getTime() + aDur * 60000);
        return slotStart < aEnd && slotEnd > aStart;
      });
    });
  };

  const handleBook = () => {
    if (!form.name.trim()) { setFormError('Por favor, informe seu nome'); return; }
    if (!form.phone.trim()) { setFormError('Por favor, informe seu telefone'); return; }
    setFormError('');
    const [h, m] = selected.time.split(':');
    const dt = new Date(selected.date);
    dt.setHours(+h, +m, 0, 0);
    createApptMutation.mutate({
      company_id: company.id,
      professional_id: selected.professional?.id === 'any' ? professionals[0]?.id : selected.professional?.id,
      service_id: selected.service.id,
      service_name: selected.service.name,
      professional_name: selected.professional?.id === 'any' ? 'Qualquer disponível' : selected.professional?.name,
      customer_name: form.name,
      customer_phone: form.phone,
      scheduled_at: dt.toISOString(),
      notes: form.notes,
      status: 'agendado',
      price: selected.service.price,
      source: 'online',
    });
  };

  const next7Days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i + 1)).filter(day => {
    if (!company?.business_hours) return true;
    const dayKey = DAY_MAP[day.getDay()];
    return company.business_hours[dayKey]?.active !== false;
  });

  const availableSlots = getAvailableSlots();

  // Error state if slug not found
  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F7F3]">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="font-semibold text-gray-700">Link de agendamento inválido</p>
        </div>
      </div>
    );
  }

  if (loadingCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F7F3]">
        <div className="w-8 h-8 border-4 border-[#1B3A4B]/20 border-t-[#1B3A4B] rounded-full animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F7F3]">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <p className="font-semibold text-gray-700">Barbearia não encontrada</p>
          <p className="text-sm text-gray-400 mt-2">Verifique o link e tente novamente</p>
        </div>
      </div>
    );
  }

  if (bookingDone) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex flex-col">
        <header className="bg-white border-b border-black/10 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#1B1C1E]">{company.name}</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl border border-black/8 p-10 text-center max-w-sm w-full shadow-lg">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-[#1B1C1E] mb-2">Agendado!</h2>
            <p className="text-gray-500 text-sm mb-6">Seu horário foi confirmado com sucesso.</p>
            <div className="bg-[#F8F7F3] rounded-xl p-4 text-left space-y-2 mb-6">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Serviço</span><span className="font-semibold">{selected.service?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Profissional</span><span className="font-semibold">{selected.professional?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Data</span><span className="font-semibold">{selected.date ? format(selected.date, "d 'de' MMMM", { locale: ptBR }) : ''}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Horário</span><span className="font-semibold">{selected.time}</span></div>
              <div className="flex justify-between text-sm border-t border-black/8 pt-2 mt-2"><span className="text-gray-500">Valor</span><span className="font-black text-lg" style={{ color: primaryColor }}>R${selected.service?.price}</span></div>
            </div>
            {company.whatsapp && (
              <a href={`https://wa.me/55${company.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center text-white text-sm font-bold py-3 rounded-xl transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#25D366' }}>
                Confirmar pelo WhatsApp
              </a>
            )}
            <p className="text-xs text-gray-400 mt-4">Dúvidas? Entre em contato com {company.name}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-black/10 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-[#1B1C1E]">{company.name}</div>
            {company.address && <div className="text-xs text-gray-400">{company.address}</div>}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-black/10">
        <div className="max-w-xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2">
            {['Serviço', 'Profissional', 'Horário', 'Seus dados'].map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < step ? 'text-white' : i === step ? 'text-white' : 'bg-gray-100 text-gray-400'}`}
                  style={{ backgroundColor: i <= step ? primaryColor : undefined }}>
                  {i < step ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-[#1B1C1E]' : 'text-gray-400'}`}>{s}</span>
                {i < 3 && <div className={`flex-1 h-px`} style={{ backgroundColor: i < step ? primaryColor : '#e5e7eb' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-6 py-8">

        {/* Step 0: Service */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-black text-[#1B1C1E] mb-6">Escolha o serviço</h2>
            {services.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p>Nenhum serviço disponível no momento.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {services.map(s => (
                  <button key={s.id} onClick={() => { setSelected(p => ({ ...p, service: s })); setStep(1); }}
                    className="bg-white rounded-2xl border border-black/8 p-5 text-left hover:shadow-md transition-all flex items-center justify-between group"
                    style={{ borderColor: selected.service?.id === s.id ? primaryColor : undefined }}>
                    <div>
                      <div className="font-bold text-[#1B1C1E] mb-1">{s.name}</div>
                      {s.description && <div className="text-sm text-gray-500 mb-2">{s.description}</div>}
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />{s.duration_minutes} min
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-xl font-black mb-2" style={{ color: primaryColor }}>R${s.price}</div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#1B3A4B] ml-auto transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Professional */}
        {step === 1 && (
          <div>
            <button onClick={() => setStep(0)} className="flex items-center gap-1 text-sm text-gray-500 mb-5 hover:text-[#1B1C1E]">
              <ChevronLeft className="w-4 h-4" />Voltar
            </button>
            <h2 className="text-xl font-black text-[#1B1C1E] mb-6">Escolha o profissional</h2>
            <div className="grid gap-3">
              <button onClick={() => { setSelected(p => ({ ...p, professional: { id: 'any', name: 'Qualquer disponível' } })); setStep(2); }}
                className="bg-white rounded-2xl border border-black/8 p-5 text-left hover:shadow-md transition-all flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-[#1B1C1E]">Qualquer disponível</div>
                  <div className="text-xs text-gray-400">Primeiro horário livre</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </button>
              {professionals.map(p => (
                <button key={p.id} onClick={() => { setSelected(s => ({ ...s, professional: p })); setStep(2); }}
                  className="bg-white rounded-2xl border border-black/8 p-5 text-left hover:shadow-md transition-all flex items-center gap-4">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ backgroundColor: primaryColor }}>
                      {(p.name || '?')[0]}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-bold text-[#1B1C1E]">{p.name}</div>
                    {p.specialty && <div className="text-xs text-gray-400">{p.specialty}</div>}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-gray-500 mb-5 hover:text-[#1B1C1E]">
              <ChevronLeft className="w-4 h-4" />Voltar
            </button>
            <h2 className="text-xl font-black text-[#1B1C1E] mb-6">Escolha o horário</h2>
            
            {next7Days.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>Nenhum dia disponível nas próximas 2 semanas</p>
              </div>
            ) : (
              <>
                {/* Date picker */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {next7Days.slice(0, 10).map((day, i) => {
                    const isSelected = selected.date?.toDateString() === day.toDateString();
                    return (
                      <button key={i} onClick={() => setSelected(p => ({ ...p, date: day, time: null }))}
                        className={`flex-shrink-0 flex flex-col items-center p-3 rounded-2xl border transition-all min-w-[64px] ${isSelected ? 'text-white border-transparent' : 'bg-white border-black/10 text-gray-600 hover:border-[#1B3A4B]'}`}
                        style={{ backgroundColor: isSelected ? primaryColor : undefined }}>
                        <span className="text-xs uppercase tracking-wide opacity-70">{format(day, 'EEE', { locale: ptBR })}</span>
                        <span className="text-xl font-black">{format(day, 'd')}</span>
                        <span className="text-xs opacity-70">{format(day, 'MMM', { locale: ptBR })}</span>
                      </button>
                    );
                  })}
                </div>

                {selected.date && (
                  <div>
                    <div className="text-sm font-semibold text-gray-500 mb-3">
                      {format(selected.date, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </div>
                    {availableSlots.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p className="text-sm">Nenhum horário disponível neste dia</p>
                        <p className="text-xs mt-1">Tente outro dia</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-4 gap-2">
                          {availableSlots.map(t => {
                            const isSelected = selected.time === t;
                            return (
                              <button key={t} onClick={() => setSelected(p => ({ ...p, time: t }))}
                                className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white border-black/10 text-gray-700 hover:border-[#1B3A4B]'}`}
                                style={{ backgroundColor: isSelected ? primaryColor : undefined }}>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                        {selected.time && (
                          <button onClick={() => setStep(3)} className="mt-6 w-full text-white font-bold py-4 rounded-2xl text-sm transition-opacity hover:opacity-90"
                            style={{ backgroundColor: primaryColor }}>
                            Continuar <ChevronRight className="w-4 h-4 inline ml-1" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Customer info */}
        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-gray-500 mb-5 hover:text-[#1B1C1E]">
              <ChevronLeft className="w-4 h-4" />Voltar
            </button>
            <h2 className="text-xl font-black text-[#1B1C1E] mb-6">Seus dados</h2>
            
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-black/8 p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Serviço</span><span className="font-semibold">{selected.service?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Profissional</span><span className="font-semibold">{selected.professional?.name}</span></div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Data e hora</span>
                <span className="font-semibold">{selected.date ? format(selected.date, "d 'de' MMM", { locale: ptBR }) : ''} às {selected.time}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-black/8 pt-2 mt-2">
                <span className="text-gray-500">Valor</span>
                <span className="font-black text-lg" style={{ color: primaryColor }}>R${selected.service?.price}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Seu nome *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Como você se chama?"
                  className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white" style={{ '--tw-ring-color': primaryColor + '40' }} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">WhatsApp / Telefone *</label>
                <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Observações (opcional)</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  placeholder="Preferências ou informações adicionais"
                  className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white resize-none" />
              </div>
            </div>

            {formError && (
              <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}
              </div>
            )}

            <button onClick={handleBook} disabled={!form.name || !form.phone || createApptMutation.isPending}
              className="mt-6 w-full text-white font-bold py-4 rounded-2xl text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor }}>
              {createApptMutation.isPending ? 'Confirmando...' : 'Confirmar agendamento'}
            </button>
          </div>
        )}
      </div>

      <footer className="bg-white border-t border-black/10 py-4 text-center">
        <p className="text-xs text-gray-400">Agendamento online por <span className="font-semibold text-[#1B3A4B]">BarbeiroPro AI</span></p>
      </footer>
    </div>
  );
}