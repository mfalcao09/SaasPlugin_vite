import DemoLayout from '@/components/layout/DemoLayout';
import { demoAppointments, demoProfessionals } from '@/lib/demoData';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = {
  agendado: { label: 'Agendado', color: 'border-l-blue-400 bg-blue-50' },
  confirmado: { label: 'Confirmado', color: 'border-l-green-400 bg-green-50' },
  em_atendimento: { label: 'Na Cadeira', color: 'border-l-yellow-400 bg-yellow-50' },
  concluido: { label: 'Concluído', color: 'border-l-gray-300 bg-gray-50' },
  cancelado: { label: 'Cancelado', color: 'border-l-red-300 bg-red-50' },
  faltou: { label: 'Faltou', color: 'border-l-orange-300 bg-orange-50' },
};

const hours = Array.from({ length: 12 }, (_, i) => i + 8);

export default function DemoAgenda() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));

  return (
    <DemoLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Agenda</h1>
            <p className="text-gray-500 text-sm mt-1">Visualização semanal</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-black/10 rounded-lg p-1">
              <button onClick={() => setCurrentDate(d => addDays(d, -7))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-2">
                {format(weekStart, "d 'de' MMM", { locale: ptBR })} — {format(addDays(weekStart, 5), "d 'de' MMM", { locale: ptBR })}
              </span>
              <button onClick={() => setCurrentDate(d => addDays(d, 7))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button className="flex items-center gap-2 bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
              <Plus className="w-4 h-4" />
              Novo agendamento
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          {/* Header */}
          <div className="grid border-b border-black/8" style={{ gridTemplateColumns: '64px repeat(6, 1fr)' }}>
            <div className="p-3 border-r border-black/8" />
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} className={`p-3 text-center border-r border-black/8 last:border-r-0 ${isToday ? 'bg-[#1B3A4B]/5' : ''}`}>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    {format(day, 'EEE', { locale: ptBR })}
                  </div>
                  <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-[#1B3A4B]' : 'text-[#1B1C1E]'}`}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="overflow-y-auto max-h-[600px]">
            {hours.map(hour => (
              <div key={hour} className="grid border-b border-black/5" style={{ gridTemplateColumns: '64px repeat(6, 1fr)' }}>
                <div className="p-2 text-xs text-gray-400 text-right border-r border-black/8 py-3">
                  {hour}:00
                </div>
                {weekDays.map((day, di) => {
                  const dayAppts = demoAppointments.filter(a => {
                    const d = new Date(a.scheduled_at);
                    return d.toDateString() === day.toDateString() && d.getHours() === hour;
                  });
                  return (
                    <div key={di} className="border-r border-black/5 last:border-r-0 min-h-[52px] p-1 relative">
                      {dayAppts.map(appt => (
                        <div key={appt.id} className={`rounded border-l-4 p-1.5 mb-1 ${statusConfig[appt.status].color} cursor-pointer hover:opacity-80`}>
                          <div className="text-xs font-semibold text-gray-800 truncate">{appt.customer_name}</div>
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
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          {Object.entries(statusConfig).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className={`w-3 h-3 rounded-sm border-l-2 ${val.color}`} />
              {val.label}
            </div>
          ))}
        </div>
      </div>
    </DemoLayout>
  );
}