import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Zap, AlertCircle, TrendingDown, Clock, Users, MessageSquare, DollarSign, RefreshCw } from "lucide-react";
import { demoAIOpportunities } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";

const typeIcon = { inativo: TrendingDown, vencendo: Clock, queda: AlertCircle, financeiro: DollarSign, horario: Users };
const typeColor = { inativo: "text-gym-red", vencendo: "text-gym-yellow", queda: "text-gym-orange", financeiro: "text-gym-green", horario: "text-gym-blue" };
const typeBg = { inativo: "bg-gym-red/10", vencendo: "bg-gym-yellow/10", queda: "bg-gym-orange/10", financeiro: "bg-gym-green/10", horario: "bg-gym-blue/10" };
const priorityColor = {
  alta: "bg-gym-red/10 border-gym-red/20 text-gym-red",
  media: "bg-gym-yellow/10 border-gym-yellow/20 text-gym-yellow",
  baixa: "bg-gym-blue/10 border-gym-blue/20 text-gym-blue"
};

function generateOpportunities(students, financial, checkins) {
  const opps = [];
  const today = new Date();
  const monthStr = today.toISOString().slice(0, 7);

  // 1. Alunos inativos (sem check-in há > 21 dias)
  students.filter(s => s.status === "ativo").forEach(s => {
    if (s.last_checkin) {
      const diff = Math.floor((today - new Date(s.last_checkin)) / (1000 * 60 * 60 * 24));
      if (diff > 21) {
        const potentialLoss = s.plan_name ? "receita em risco" : null;
        opps.push({
          id: `inativo-${s.id}`, type: "inativo",
          priority: diff > 45 ? "alta" : diff > 30 ? "media" : "baixa",
          title: `${s.name} ausente há ${diff} dias`,
          description: `Aluno ativo sem frequência há ${diff} dias. Risco de cancelamento aumenta significativamente após 30 dias sem presença.`,
          student_id: s.id, student_name: s.name,
          metric: `${diff} dias sem check-in`,
          oportunidade: potentialLoss,
          action: diff > 45 ? "Contato urgente de reativação" : "Enviar mensagem motivacional",
          context: { dias_ausente: diff, plano: s.plan_name, telefone: s.phone }
        });
      }
    } else if (s.start_date) {
      // nunca fez check-in
      const diff = Math.floor((today - new Date(s.start_date)) / (1000 * 60 * 60 * 24));
      if (diff > 7) {
        opps.push({
          id: `semcheckin-${s.id}`, type: "inativo",
          priority: "alta",
          title: `${s.name} nunca fez check-in`,
          description: `Aluno cadastrado há ${diff} dias mas sem nenhum check-in registrado. Pode estar insatisfeito ou com dificuldades de acesso.`,
          student_id: s.id, student_name: s.name,
          metric: `0 check-ins em ${diff} dias`,
          action: "Entrar em contato — possível desistência precoce",
          context: { dias_cadastrado: diff, plano: s.plan_name, telefone: s.phone }
        });
      }
    }
  });

  // 2. Planos vencendo (próximos 10 dias)
  students.filter(s => s.status === "ativo" && s.expiry_date).forEach(s => {
    const diff = Math.floor((new Date(s.expiry_date) - today) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff <= 10) {
      opps.push({
        id: `vencendo-${s.id}`, type: "vencendo",
        priority: diff <= 3 ? "alta" : "media",
        title: `${s.name} — plano vence em ${diff === 0 ? "hoje" : `${diff} dia${diff !== 1 ? "s" : ""}`}`,
        description: `Plano "${s.plan_name || "atual"}" vence ${diff === 0 ? "hoje" : `em ${diff} dia${diff !== 1 ? "s" : ""}`}. Momento ideal para oferecer renovação com desconto ou upgrade.`,
        student_id: s.id, student_name: s.name,
        metric: `Vence em ${diff} dia${diff !== 1 ? "s" : ""}`,
        action: "Oferecer renovação / upgrade de plano",
        context: { dias_para_vencer: diff, plano: s.plan_name, telefone: s.phone }
      });
    }
  });

  // 3. Queda de frequência (< 4 check-ins no mês, mas ativo)
  const checkinsMes = {};
  checkins.filter(c => (c.date || "").startsWith(monthStr)).forEach(c => {
    checkinsMes[c.student_id] = (checkinsMes[c.student_id] || 0) + 1;
  });
  students.filter(s => s.status === "ativo").forEach(s => {
    const count = checkinsMes[s.id] || 0;
    const expected = 12; // ~3x semana
    if (count > 0 && count < 4) {
      opps.push({
        id: `queda-${s.id}`, type: "queda",
        priority: count <= 1 ? "media" : "baixa",
        title: `${s.name} — apenas ${count} check-in${count > 1 ? "s" : ""} este mês`,
        description: `Frequência abaixo do esperado. Com ${count} visita${count > 1 ? "s" : ""} no mês, o aluno pode não estar aproveitando o plano e tende a cancelar na renovação.`,
        student_id: s.id, student_name: s.name,
        metric: `${count}/${expected} check-ins esperados`,
        action: "Incentivar retorno com desafio ou meta pessoal",
        context: { checkins_mes: count, plano: s.plan_name, telefone: s.phone }
      });
    }
  });

  // 4. Oportunidade financeira — mensalidades a receber vencidas
  const vencidos = financial.filter(f =>
    f.type === "receita" && f.status === "pendente" &&
    f.due_date && new Date(f.due_date) < today
  );
  if (vencidos.length > 0) {
    const total = vencidos.reduce((s, f) => s + (f.value || 0), 0);
    opps.push({
      id: "financeiro-vencidos", type: "financeiro",
      priority: total > 500 ? "alta" : "media",
      title: `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em mensalidades vencidas`,
      description: `Existem ${vencidos.length} lançamento${vencidos.length > 1 ? "s" : ""} de receita pendente${vencidos.length > 1 ? "s" : ""} com vencimento já ultrapassado. Cobrança proativa pode recuperar este valor.`,
      metric: `${vencidos.length} cobranças em atraso`,
      action: "Contatar alunos com pagamentos em atraso",
      context: { total, quantidade: vencidos.length }
    });
  }

  // 5. Alunos inativos com potencial de reativação
  const inativos = students.filter(s => s.status === "inativo");
  if (inativos.length >= 3) {
    opps.push({
      id: "campanha-reativacao", type: "inativo",
      priority: "media",
      title: `${inativos.length} alunos inativos — campanha de reativação`,
      description: `Você tem ${inativos.length} alunos inativos que já conhecem sua academia. Reativar mesmo 30% deles representa receita imediata sem custo de aquisição.`,
      metric: `${inativos.length} alunos inativos`,
      action: "Criar campanha de reativação com oferta especial",
      context: { total_inativos: inativos.length }
    });
  }

  // Sort: alta > media > baixa
  const order = { alta: 0, media: 1, baixa: 2 };
  return opps.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 15);
}

export default function AIGrowth() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: students } = useRealData("Student", academyId);
  const { data: financial } = useRealData("Financial", academyId);
  const { data: checkins } = useRealData("Checkin", academyId);

  const opportunities = useMemo(() => {
    if (demo) return demoAIOpportunities;
    return generateOpportunities(students, financial, checkins);
  }, [demo, students, financial, checkins]);

  const [generating, setGenerating] = useState(null);
  const [messages, setMessages] = useState({});
  const [filterType, setFilterType] = useState("todos");

  const alta = opportunities.filter(o => o.priority === "alta").length;
  const media = opportunities.filter(o => o.priority === "media").length;
  const baixa = opportunities.filter(o => o.priority === "baixa").length;

  const filtered = filterType === "todos" ? opportunities : opportunities.filter(o => o.priority === filterType);

  async function generateMessage(opp) {
    setGenerating(opp.id);
    try {
      const ctx = opp.context ? JSON.stringify(opp.context) : "";
      const prompt = opp.student_name
        ? `Você é gestor de uma academia fitness. Escreva uma mensagem de WhatsApp para o aluno "${opp.student_name}" de forma amigável, empática e objetiva (máximo 4 linhas). Contexto: ${opp.description}. Dados adicionais: ${ctx}. Ação desejada: ${opp.action}. Use 1-2 emojis adequados. Não use saudação genérica — seja direto e personalizado.`
        : `Você é gestor de uma academia fitness. Escreva uma mensagem curta (máximo 4 linhas) para campanha sobre: ${opp.description}. Contexto: ${ctx}. Ação: ${opp.action}. Tom motivador, objetivo, 1-2 emojis.`;
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages(prev => ({ ...prev, [opp.id]: res }));
    } catch {
      setMessages(prev => ({ ...prev, [opp.id]: "Erro ao gerar mensagem. Tente novamente." }));
    }
    setGenerating(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gym-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gym-orange/12 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-gym-orange" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gym-text">AI Growth Engine</h2>
              <p className="text-xs text-gym-muted">
                {demo ? "Dados demonstrativos" : `${opportunities.length} oportunidades identificadas nos seus dados reais`}
              </p>
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
              <div className="text-2xl font-bold text-gym-blue text-tabular">{baixa}</div>
              <div className="text-xs text-gym-subtle">Baixa</div>
            </div>
          </div>
        </div>
      </div>

      {/* Priority filter */}
      <div className="flex gap-2 flex-wrap">
        {["todos", "alta", "media", "baixa"].map(f => (
          <button key={f} onClick={() => setFilterType(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold uppercase transition-all ${filterType === f ? "bg-gym-orange text-white border-gym-orange" : "border-gym-border text-gym-muted hover:text-white"}`}>
            {f === "todos" ? "Todas" : f}
          </button>
        ))}
      </div>

      {/* Opportunities */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gym-subtle bg-gym-surface border border-gym-border rounded-xl">
            {students.length === 0 ? "Adicione alunos para gerar oportunidades reais." : "Nenhuma oportunidade nesta categoria no momento. Ótimo sinal! 🎉"}
          </div>
        ) : filtered.map(opp => {
          const Icon = typeIcon[opp.type] || AlertCircle;
          return (
            <div key={opp.id} className="bg-white border border-gym-border rounded-xl p-5 hover:shadow-md transition-all shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeBg[opp.type] || "bg-gym-border/5"}`}>
                  <Icon className={`w-5 h-5 ${typeColor[opp.type] || "text-gym-muted"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="font-semibold text-gym-text">{opp.title}</div>
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

                  {/* Generated message */}
                  {messages[opp.id] && (
                    <div className="mt-4 bg-gym-green/5 border border-gym-green/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-gym-green" />
                          <span className="text-xs font-semibold text-gym-green">Mensagem gerada por IA</span>
                        </div>
                        <button onClick={() => navigator.clipboard?.writeText(messages[opp.id])}
                          className="text-xs text-gym-muted hover:text-gym-text border border-gym-border px-2 py-1 rounded hover:bg-white/40 transition-all">
                          Copiar
                        </button>
                      </div>
                      <p className="text-sm text-gym-text whitespace-pre-wrap leading-relaxed">{messages[opp.id]}</p>
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