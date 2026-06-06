import DemoLayout from '@/components/layout/DemoLayout';
import { demoProfessionals, demoAppointments } from '@/lib/demoData';
import { Scissors, Star, CheckCircle, Plus } from 'lucide-react';

export default function DemoProfissionais() {
  return (
    <DemoLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Profissionais</h1>
            <p className="text-gray-500 text-sm mt-1">{demoProfessionals.length} profissionais cadastrados</p>
          </div>
          <button className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
            + Novo profissional
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demoProfessionals.map(pro => {
            const proAppts = demoAppointments.filter(a => a.professional_id === pro.id);
            const concluded = proAppts.filter(a => a.status === 'concluido').length;
            const todayAppts = proAppts.filter(a => new Date(a.scheduled_at).toDateString() === new Date().toDateString()).length;

            return (
              <div key={pro.id} className="bg-white rounded-2xl border border-black/8 p-6 hover:shadow-md transition-all">
                <div className="flex items-center gap-4 mb-5">
                  <img src={pro.photo_url} alt={pro.name} className="w-16 h-16 rounded-2xl object-cover" />
                  <div>
                    <h3 className="font-bold text-[#1B1C1E]">{pro.name}</h3>
                    <p className="text-sm text-gray-500">{pro.specialty}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className={`w-2 h-2 rounded-full ${pro.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-400">{pro.active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#F8F7F3] rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-[#1B1C1E]">{todayAppts}</div>
                    <div className="text-xs text-gray-400">hoje</div>
                  </div>
                  <div className="bg-[#F8F7F3] rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-[#1B1C1E]">{concluded}</div>
                    <div className="text-xs text-gray-400">concluídos</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DemoLayout>
  );
}