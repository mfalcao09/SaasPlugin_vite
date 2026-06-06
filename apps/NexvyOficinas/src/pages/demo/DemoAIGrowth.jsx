import { demoAIInsights } from "@/data/demoData";
import { Brain, Copy, CheckCircle2, User, TrendingUp, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const tipoConfig = {
  retorno: { icon: User, color: "var(--brand)" },
  orcamento: { icon: CheckCircle2, color: "#D97706" },
  revisao: { icon: TrendingUp, color: "var(--brand)" },
  inativo: { icon: User, color: "#DC2626" },
  os_parada: { icon: Wrench, color: "#D97706" },
};

export default function DemoAIGrowth() {
  const [copied, setCopied] = useState(null);
  const [expanded, setExpanded] = useState(demoAIInsights[0]?.id);

  const handleCopy = (id, msg) => {
    navigator.clipboard.writeText(msg);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5" style={{ color: "var(--brand)" }} />
            <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>AI Growth Engine</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Oportunidades identificadas automaticamente pela IA</p>
        </div>
        <div className="rounded border px-4 py-2 text-center"
          style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)" }}>
          <div className="text-2xl font-black" style={{ color: "var(--brand)" }}>{demoAIInsights.length}</div>
          <div className="text-xs" style={{ color: "var(--ink-muted)" }}>insights</div>
        </div>
      </div>

      <div className="space-y-3">
        {demoAIInsights.map((insight) => {
          const tc = tipoConfig[insight.tipo] || tipoConfig.retorno;
          const isExpanded = expanded === insight.id;
          const Icon = tc.icon;
          const isAlta = insight.prioridade === "alta";

          return (
            <div key={insight.id} className="rounded border overflow-hidden"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: isAlta ? "#FCA5A5" : "var(--line-soft)" }}>
              <div className="p-5 cursor-pointer transition-colors hover:bg-[#F0EEE8]"
                onClick={() => setExpanded(isExpanded ? null : insight.id)}>
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "var(--brand-subtle)" }}>
                    <Icon className="w-4 h-4" style={{ color: tc.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded"
                        style={isAlta
                          ? { backgroundColor: "#FEE2E2", color: "#991B1B" }
                          : { backgroundColor: "#FEF3C7", color: "#92400E" }
                        }>
                        {isAlta ? "URGENTE" : "ATENÇÃO"}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{insight.titulo}</h3>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>{insight.descricao}</p>
                    <div className="flex gap-3 mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                      <span>👤 {insight.cliente}</span>
                      <span>🚗 {insight.veiculo}</span>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--ink-muted)" }} />
                    : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--ink-muted)" }} />
                  }
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-0 space-y-4"
                  style={{ borderTop: "1px solid var(--line-soft)", backgroundColor: "var(--surface)" }}>
                  <div className="pt-4">
                    <h4 className="text-xs font-bold uppercase mb-2" style={{ color: "var(--ink-muted)" }}>Ação sugerida</h4>
                    <div className="rounded p-3 text-sm" style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--line-soft)", color: "var(--ink)" }}>
                      {insight.acao_sugerida}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2" style={{ color: "var(--ink-muted)" }}>Mensagem sugerida</h4>
                    <div className="rounded p-4" style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--line-soft)" }}>
                      <p className="text-sm leading-relaxed italic" style={{ color: "var(--ink)" }}>"{insight.mensagem_sugerida}"</p>
                      <button
                        onClick={() => handleCopy(insight.id, insight.mensagem_sugerida)}
                        className="mt-3 flex items-center gap-2 text-white font-bold px-4 py-2 rounded text-sm transition-all hover:opacity-90"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {copied === insight.id
                          ? <><CheckCircle2 className="w-4 h-4" /> Copiado!</>
                          : <><Copy className="w-4 h-4" /> Copiar mensagem</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}