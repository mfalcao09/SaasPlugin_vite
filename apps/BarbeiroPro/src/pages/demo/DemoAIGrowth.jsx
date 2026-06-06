import DemoLayout from '@/components/layout/DemoLayout';
import { demoAIInsights } from '@/lib/demoData';
import { Zap, Copy, AlertCircle, TrendingUp, Star, Package } from 'lucide-react';
import { useState } from 'react';

const typeConfig = {
  reativacao: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Reativação' },
  horario_fraco: { icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Horário Fraco' },
  vip_ausente: { icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'VIP Ausente' },
  servico_baixo: { icon: Package, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Serviço Baixo' },
};

const priorityBadge = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baixa: 'bg-gray-100 text-gray-600',
};

export default function DemoAIGrowth() {
  const [copied, setCopied] = useState(null);

  const handleCopy = (id, msg) => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <DemoLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-900" />
            </div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">AI Growth Engine</h1>
          </div>
          <p className="text-gray-500 text-sm">Insights automáticos para crescer sua barbearia</p>
        </div>

        <div className="bg-[#1B3A4B]/5 border border-[#1B3A4B]/20 rounded-2xl p-5 mb-8 flex items-start gap-4">
          <Zap className="w-5 h-5 text-[#1B3A4B] mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-[#1B1C1E] text-sm mb-1">Como funciona</div>
            <p className="text-sm text-gray-600">A IA analisa automaticamente seus clientes, frequência de visitas, horários de pico e serviços. Em seguida, gera insights acionáveis com mensagens prontas para você enviar via WhatsApp e recuperar receita perdida.</p>
          </div>
        </div>

        <div className="grid gap-5">
          {demoAIInsights.map(insight => {
            const cfg = typeConfig[insight.type];
            return (
              <div key={insight.id} className="bg-white rounded-2xl border border-black/8 p-6">
                <div className="flex items-start gap-4 mb-5">
                  <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-[#1B1C1E]">{insight.title}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${priorityBadge[insight.priority]}`}>
                        {insight.priority.charAt(0).toUpperCase() + insight.priority.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{insight.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-[#1B3A4B]">{insight.count}</div>
                    <div className="text-xs text-gray-400">{cfg.label}</div>
                  </div>
                </div>

                <div className="bg-[#F8F7F3] rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mensagem sugerida</div>
                  <p className="text-sm text-gray-700 italic mb-3">"{insight.message}"</p>
                  <button
                    onClick={() => handleCopy(insight.id, insight.message)}
                    className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                      copied === insight.id
                        ? 'bg-green-100 text-green-700'
                        : 'bg-[#1B3A4B] text-white hover:bg-[#1B3A4B]/90'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied === insight.id ? 'Copiado!' : 'Copiar mensagem'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DemoLayout>
  );
}