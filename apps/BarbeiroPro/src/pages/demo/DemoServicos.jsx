import DemoLayout from '@/components/layout/DemoLayout';
import { demoServices } from '@/lib/demoData';
import { Clock, DollarSign, Star, Plus } from 'lucide-react';

export default function DemoServicos() {
  return (
    <DemoLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Serviços</h1>
            <p className="text-gray-500 text-sm mt-1">{demoServices.length} serviços cadastrados</p>
          </div>
          <button className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
            + Novo serviço
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {demoServices.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-black/8 p-6 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-bold text-[#1B1C1E]">{s.name}</h3>
                {s.featured && (
                  <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 font-semibold px-2 py-1 rounded-lg">
                    <Star className="w-3 h-3" />Destaque
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">{s.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    {s.duration_minutes} min
                  </div>
                </div>
                <div className="text-xl font-black text-[#1B3A4B]">R${s.price}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-black/5">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DemoLayout>
  );
}