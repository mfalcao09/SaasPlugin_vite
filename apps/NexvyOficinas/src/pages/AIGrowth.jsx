import { useEffect, useState } from "react";
import { Zap, User, Car, Clock, FileText, Package, Copy, CheckCircle, TrendingUp } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoAIInsights } from "@/data/demoData";

const tipoConfig = {
  retorno: { label: "Retorno de Cliente", icon: User, color: "text-purple-400", bg: "bg-purple-500/20" },
  orcamento: { label: "Follow-up Orçamento", icon: FileText, color: "text-amber-400", bg: "bg-amber-500/20" },
  revisao: { label: "Revisão Programada", icon: Car, color: "text-blue-400", bg: "bg-blue-500/20" },
  inativo: { label: "Cliente Inativo", icon: Clock, color: "text-red-400", bg: "bg-red-500/20" },
  os_parada: { label: "OS Parada", icon: Package, color: "text-orange-400", bg: "bg-orange-500/20" },
};

export default function AIGrowth() {
  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(null);
  const [expanded, setExpanded] = useState("ai1");
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">AI Growth Engine</h1>
              <p className="text-gray-500 text-sm">IA assistida para identificar oportunidades de receita</p>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-gray-400 text-sm">
              A IA analisa sua base de clientes, histórico de veículos, orçamentos e ordens para identificar oportunidades.
              Opera em modo <strong className="text-white">assistido</strong>: identifica → sugere mensagem → você decide e envia.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-red-400 mb-1">{demoAIInsights.filter(i => i.prioridade === "alta").length}</div>
              <div className="text-xs text-gray-400">Alta prioridade</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-amber-400 mb-1">{demoAIInsights.filter(i => i.prioridade === "media").length}</div>
              <div className="text-xs text-gray-400">Média prioridade</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-green-400 mb-1">R$+</div>
              <div className="text-xs text-gray-400">Potencial de receita</div>
            </div>
          </div>

          <div className="space-y-3">
            {demoAIInsights.map(insight => {
              const tc = tipoConfig[insight.tipo];
              const Icon = tc.icon;
              const isExp = expanded === insight.id;
              return (
                <div key={insight.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="p-5 cursor-pointer" onClick={() => setExpanded(isExp ? null : insight.id)}>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 ${tc.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${tc.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${insight.prioridade === 'alta' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                            {insight.prioridade === 'alta' ? 'Alta' : 'Média'} prioridade
                          </span>
                          <span className="text-xs text-gray-500">{tc.label}</span>
                        </div>
                        <h3 className="font-bold text-white">{insight.titulo}</h3>
                      </div>
                    </div>
                  </div>
                  {isExp && (
                    <div className="border-t border-gray-800 p-5 bg-gray-900/50">
                      <p className="text-sm text-gray-400 mb-4">{insight.descricao}</p>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ação sugerida</p>
                      <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">{insight.acao_sugerida}</p>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Mensagem gerada pela IA</p>
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 leading-relaxed mb-3">{insight.mensagem_sugerida}</div>
                      <button onClick={() => handleCopy(insight.id, insight.mensagem_sugerida)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${copied === insight.id ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"}`}>
                        {copied === insight.id ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied === insight.id ? "Copiado!" : "Copiar mensagem"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}