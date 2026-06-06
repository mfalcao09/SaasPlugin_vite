import { useState } from "react";
import { Zap, AlertCircle, TrendingDown, Clock, Users, MessageSquare, RefreshCw } from "lucide-react";
import { demoAIOpportunities } from "@/lib/demoData";
import { base44 } from "@/api/base44Client";

const typeIcon = { inativo: TrendingDown, vencendo: Clock, queda: AlertCircle, horario: Users };
const typeColor = { inativo: "text-gym-red", vencendo: "text-gym-yellow", queda: "text-gym-orange", horario: "text-gym-blue" };
const typeBg = { inativo: "bg-gym-red/10", vencendo: "bg-gym-yellow/10", queda: "bg-gym-orange/10", horario: "bg-gym-blue/10" };
const priorityColor = {
  alta: "bg-gym-red/10 border-gym-red/20 text-gym-red",
  media: "bg-gym-yellow/10 border-gym-yellow/20 text-gym-yellow",
  baixa: "bg-gym-blue/10 border-gym-blue/20 text-gym-blue"
};

export default function DemoAIGrowth() {
  const opportunities = demoAIOpportunities;
  const [generating, setGenerating] = useState(null);
  const [messages, setMessages] = useState({});

  const alta = opportunities.filter(o => o.priority === "alta").length;
  const media = opportunities.filter(o => o.priority === "media").length;

  async function generateMessage(opp) {
    setGenerating(opp.id);
    try {
      const prompt = opp.student_name
        ? `Você é um assistente de academia. Crie uma mensagem de WhatsApp curta (máximo 3 parágrafos) e personalizada para o aluno "${opp.student_name}" com o seguinte contexto: ${opp.description}. Ação desejada: ${opp.action}. A mensagem deve ser amigável, empática e encorajadora. Use emojis com moderação.`
        : `Crie uma mensagem de campanha para academia sobre: ${opp.description}. Ação: ${opp.action}. Máximo 3 parágrafos, tom motivador.`;
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages(prev => ({ ...prev, [opp.id]: res }));
    } catch {
      setMessages(prev => ({ ...prev, [opp.id]: "Erro ao gerar mensagem. Tente novamente." }));
    }
    setGenerating(null);
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gym-orange/10 to-gym-purple/10 border border-gym-orange/20 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gym-orange/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-gym-orange" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Growth Engine</h2>
              <p className="text-xs text-gym-muted">Oportunidades identificadas pela IA para crescimento da academia</p>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gym-red text-tabular">{alta}</div>
              <div className="text-xs text-gym-subtle">Alta</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gym-yellow text-tabular">{media}</div>
              <div className="text-xs text-gym-subtle">Média</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white text-tabular">{opportunities.length}</div>
              <div className="text-xs text-gym-subtle">Total</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {opportunities.map(opp => {
          const Icon = typeIcon[opp.type] || AlertCircle;
          return (
            <div key={opp.id} className="bg-[#18181B] border border-gym-border rounded-xl p-5 hover:border-gym-orange/30 transition-all">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeBg[opp.type] || "bg-gym-border/50"}`}>
                  <Icon className={`w-5 h-5 ${typeColor[opp.type] || "text-gym-muted"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="font-semibold text-white">{opp.title}</div>
                      <div className="text-sm text-gym-muted mt-1 leading-relaxed">{opp.description}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border flex-shrink-0 ${priorityColor[opp.priority]}`}>
                      {opp.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs text-gym-subtle bg-gym-border/30 px-2 py-1 rounded">{opp.metric}</span>
                    <span className="text-xs text-gym-orange font-medium">→ {opp.action}</span>
                  </div>

                  {messages[opp.id] && (
                    <div className="mt-4 bg-[#111114] border border-gym-green/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-gym-green" />
                          <span className="text-xs font-semibold text-gym-green">Mensagem gerada por IA</span>
                        </div>
                        <button onClick={() => navigator.clipboard?.writeText(messages[opp.id])}
                          className="text-xs text-gym-subtle hover:text-white border border-gym-border/50 px-2 py-1 rounded transition-all">
                          Copiar
                        </button>
                      </div>
                      <p className="text-sm text-gym-muted whitespace-pre-wrap leading-relaxed">{messages[opp.id]}</p>
                    </div>
                  )}

                  <button onClick={() => generateMessage(opp)} disabled={generating === opp.id}
                    className="mt-3 flex items-center gap-2 text-xs font-semibold text-gym-orange hover:text-gym-orange-light border border-gym-orange/30 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                    {generating === opp.id
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Gerando...</>
                      : <><Zap className="w-3 h-3" />{messages[opp.id] ? "Gerar nova mensagem" : "Gerar mensagem com IA"}</>
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}