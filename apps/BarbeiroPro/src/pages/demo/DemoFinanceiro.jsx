import DemoLayout from '@/components/layout/DemoLayout';
import { demoFinancial } from '@/lib/demoData';
import { TrendingUp, TrendingDown, DollarSign, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function DemoFinanceiro() {
  const entradas = demoFinancial.filter(f => f.type === 'entrada');
  const saidas = demoFinancial.filter(f => f.type === 'saida');
  const totalEntradas = entradas.reduce((s, f) => s + f.amount, 0);
  const totalSaidas = saidas.reduce((s, f) => s + f.amount, 0);
  const saldo = totalEntradas - totalSaidas;

  return (
    <DemoLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Financeiro</h1>
            <p className="text-gray-500 text-sm mt-1">Visão do período atual</p>
          </div>
          <button className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
            + Lançamento manual
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Entradas</span>
            </div>
            <div className="text-3xl font-black text-[#1B1C1E]">R${totalEntradas.toFixed(0)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Saídas</span>
            </div>
            <div className="text-3xl font-black text-[#1B1C1E]">R${totalSaidas.toFixed(0)}</div>
          </div>
          <div className={`rounded-2xl border p-6 ${saldo >= 0 ? 'bg-[#1B3A4B] border-[#1B3A4B]' : 'bg-red-600 border-red-600'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-medium text-white/70">Saldo</span>
            </div>
            <div className="text-3xl font-black text-white">R${saldo.toFixed(0)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <div className="p-5 border-b border-black/8">
            <h2 className="font-bold text-[#1B1C1E]">Lançamentos recentes</h2>
          </div>
          <div className="divide-y divide-black/5">
            {demoFinancial.map(entry => (
              <div key={entry.id} className="flex items-center gap-4 p-4 hover:bg-[#F8F7F3] transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${entry.type === 'entrada' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {entry.type === 'entrada'
                    ? <TrendingUp className="w-4 h-4 text-green-600" />
                    : <TrendingDown className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-[#1B1C1E]">{entry.description}</div>
                  <div className="text-xs text-gray-400">{entry.category} · {format(new Date(entry.date), "d MMM yyyy", { locale: ptBR })}</div>
                </div>
                <div className={`text-sm font-bold ${entry.type === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                  {entry.type === 'entrada' ? '+' : '-'}R${entry.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DemoLayout>
  );
}