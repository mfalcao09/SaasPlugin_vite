import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Brain, Copy, CheckCircle2, TrendingUp, Wrench, User, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";

const tipoConfig = {
  retorno:    { icon: User,        color: "var(--brand)",             badge: "RETORNO" },
  orcamento:  { icon: CheckCircle2,color: "var(--status-amber-fg)",   badge: "ORÇAMENTO" },
  revisao:    { icon: TrendingUp,  color: "var(--brand)",             badge: "REVISÃO" },
  inativo:    { icon: User,        color: "var(--status-red-fg)",     badge: "INATIVO" },
  os_parada:  { icon: Wrench,      color: "var(--status-amber-fg)",   badge: "OS PARADA" },
};

function diasAtras(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// Pure logic — detect real opportunities from data
function detectarOportunidades(clientes, veiculos, orcamentos, ordens) {
  const insights = [];

  // Clientes inativos (sem OS há 60+ dias)
  const clienteComOS = new Set(ordens.map(o => o.cliente_id));
  clientes.forEach(c => {
    const osDoCliente = ordens.filter(o => o.cliente_id === c.id);
    const ultima = osDoCliente.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    const dias = ultima ? diasAtras(ultima.created_date) : diasAtras(c.created_date);
    if (dias >= 60) {
      insights.push({
        id: `inativo-${c.id}`,
        tipo: "inativo",
        prioridade: dias >= 90 ? "alta" : "media",
        titulo: `${c.nome} está há ${dias} dias sem atendimento`,
        descricao: `Última atividade detectada há ${dias} dias. Alta chance de reengajamento com contato proativo.`,
        cliente: c.nome,
        veiculo: "",
        dados: c,
      });
    }
  });

  // Orçamentos pendentes sem resposta há 3+ dias
  orcamentos.filter(o => o.status === "pendente").forEach(o => {
    const dias = diasAtras(o.created_date);
    if (dias >= 3) {
      insights.push({
        id: `orc-${o.id}`,
        tipo: "orcamento",
        prioridade: dias >= 7 ? "alta" : "media",
        titulo: `Orçamento de ${o.cliente_nome} sem resposta há ${dias} dias`,
        descricao: `Orçamento ${o.numero || ""} no valor de R$ ${(o.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} aguarda aprovação.`,
        cliente: o.cliente_nome,
        veiculo: o.veiculo_desc || "",
        dados: o,
      });
    }
  });

  // OS paradas (em_andamento ou aguardando_peca há 3+ dias)
  ordens.filter(o => ["em_andamento", "aguardando_peca"].includes(o.status)).forEach(o => {
    const dias = diasAtras(o.updated_date || o.created_date);
    if (dias >= 3) {
      insights.push({
        id: `os-${o.id}`,
        tipo: "os_parada",
        prioridade: dias >= 7 ? "alta" : "media",
        titulo: `OS ${o.numero || ""} de ${o.cliente_nome} parada há ${dias} dias`,
        descricao: `Status atual: ${o.status.replace("_", " ")}. Cliente pode precisar de atualização.`,
        cliente: o.cliente_nome,
        veiculo: o.veiculo_desc || "",
        dados: o,
      });
    }
  });

  // Veículos com revisão vencida
  veiculos.filter(v => v.proxima_revisao).forEach(v => {
    const diasAtras_rev = diasAtras(v.proxima_revisao);
    if (diasAtras_rev >= 0) {
      insights.push({
        id: `rev-${v.id}`,
        tipo: "revisao",
        prioridade: diasAtras_rev >= 30 ? "alta" : "media",
        titulo: `Veículo ${v.marca} ${v.modelo} (${v.placa}) com revisão vencida`,
        descricao: `A revisão estava prevista para ${new Date(v.proxima_revisao).toLocaleDateString("pt-BR")}. Já se passaram ${diasAtras_rev} dias.`,
        cliente: v.cliente_nome || "",
        veiculo: `${v.marca} ${v.modelo} — ${v.placa}`,
        dados: v,
      });
    }
  });

  return insights.sort((a, b) => (b.prioridade === "alta" ? 1 : 0) - (a.prioridade === "alta" ? 1 : 0));
}

export default function AIGrowth() {
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  useDocumentTitle(empresa ? `${empresa.nome} | AutoFlow AI` : "AI Growth | AutoFlow AI");
  const [insights, setInsights]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [copied,   setCopied]     = useState(null);
  const [generating, setGenerating] = useState(null);
  const [mensagens, setMensagens] = useState({});

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [c, v, o, os] = await Promise.all([
      base44.entities.Cliente.filter({ empresa_id: empresaId }),
      base44.entities.Veiculo.filter({ empresa_id: empresaId }),
      base44.entities.Orcamento.filter({ empresa_id: empresaId }),
      base44.entities.OrdemServico.filter({ empresa_id: empresaId }),
    ]);
    setInsights(detectarOportunidades(c, v, o, os));
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId]);

  const gerarMensagem = async (insight) => {
    setGenerating(insight.id);
    try {
      const nomeOficina = empresa?.nome || "nossa oficina";
      const prompt = `Você é um assistente de comunicação para a oficina automotiva "${nomeOficina}".

Situação detectada: ${insight.titulo}
Descrição: ${insight.descricao}
Cliente: ${insight.cliente}
${insight.veiculo ? `Veículo: ${insight.veiculo}` : ""}

Gere uma mensagem de WhatsApp profissional, cordial e persuasiva para ${insight.cliente} com base nessa situação.
A mensagem deve:
- Ser breve (máximo 4 linhas)
- Ter tom profissional mas humano
- Incluir uma chamada para ação clara
- Não usar emojis em excesso
- Assinar como "${nomeOficina}"

Retorne apenas o texto da mensagem, sem explicações.`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setMensagens(prev => ({ ...prev, [insight.id]: result }));
    } finally {
      setGenerating(null);
    }
  };

  const handleCopy = (id, msg) => {
    navigator.clipboard.writeText(msg);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loadingEmpresa || loading) return (
    <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>
  );

  const urgentes = insights.filter(i => i.prioridade === "alta");
  const atencao  = insights.filter(i => i.prioridade !== "alta");

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5" style={{ color: "var(--brand)" }} />
            <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>AI Growth Engine</h1>
          </div>
          <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>Oportunidades detectadas automaticamente com base nos seus dados reais</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-sm border transition-all"
            style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
            title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="rounded-sm border px-4 py-2 text-center"
            style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand-line)" }}>
            <div className="text-[20px] font-black" style={{ color: "var(--brand)" }}>{insights.length}</div>
            <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>insights</div>
          </div>
        </div>
      </div>

      {insights.length === 0 && (
        <div className="rounded-sm border p-10 text-center"
          style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          <CheckCircle2 className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--status-green-fg)" }} />
          <p className="font-bold text-[14px]" style={{ color: "var(--ink)" }}>Tudo em ordem por enquanto</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--ink-muted)" }}>
            Nenhuma oportunidade detectada no momento. Volte depois de ter mais dados operacionais.
          </p>
        </div>
      )}

      {[{ label: "🔴 Urgente", items: urgentes }, { label: "🟡 Atenção", items: atencao }].map(grupo => (
        grupo.items.length > 0 && (
          <div key={grupo.label}>
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--ink-muted)" }}>{grupo.label}</h2>
            <div className="space-y-3">
              {grupo.items.map(insight => {
                const tc     = tipoConfig[insight.tipo] || tipoConfig.retorno;
                const Icon   = tc.icon;
                const isExp  = expanded === insight.id;
                const isAlta = insight.prioridade === "alta";
                const msg    = mensagens[insight.id];

                return (
                  <div key={insight.id} className="rounded-sm border overflow-hidden"
                    style={{ backgroundColor: "var(--surface-raised)", borderColor: isAlta ? "#FCA5A5" : "var(--line)" }}>
                    <div className="p-4 cursor-pointer transition-colors"
                      onClick={() => setExpanded(isExp ? null : insight.id)}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: "var(--brand-subtle)" }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: tc.color }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm"
                              style={isAlta
                                ? { backgroundColor: "var(--status-red-bg)", color: "var(--status-red-fg)" }
                                : { backgroundColor: "var(--status-amber-bg)", color: "var(--status-amber-fg)" }}>
                              {tc.badge}
                            </span>
                          </div>
                          <h3 className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{insight.titulo}</h3>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{insight.descricao}</p>
                          {insight.cliente && (
                            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>👤 {insight.cliente}{insight.veiculo ? ` · 🚗 ${insight.veiculo}` : ""}</p>
                          )}
                        </div>
                        {isExp
                          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ink-muted)" }} />
                          : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ink-muted)" }} />}
                      </div>
                    </div>

                    {isExp && (
                      <div className="px-4 pb-4 pt-3 space-y-3"
                        style={{ borderTop: "1px solid var(--line-soft)", backgroundColor: "var(--surface)" }}>
                        {/* Gerar mensagem */}
                        {!msg && (
                          <button
                            disabled={generating === insight.id}
                            onClick={() => gerarMensagem(insight)}
                            className="flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-sm text-white hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: "var(--brand)" }}>
                            {generating === insight.id
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando mensagem...</>
                              : <><Brain className="w-3.5 h-3.5" /> Gerar mensagem com IA</>}
                          </button>
                        )}
                        {msg && (
                          <div className="rounded-sm border p-4"
                            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted)" }}>Mensagem gerada pela IA</div>
                            <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink)" }}>{msg}</p>
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => handleCopy(insight.id, msg)}
                                className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-sm text-white hover:opacity-90"
                                style={{ backgroundColor: "var(--brand)" }}>
                                {copied === insight.id
                                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copiado!</>
                                  : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                              </button>
                              <button onClick={() => { setMensagens(p => ({ ...p, [insight.id]: undefined })); gerarMensagem(insight); }}
                                disabled={generating === insight.id}
                                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-sm border"
                                style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
                                <RefreshCw className="w-3.5 h-3.5" /> Regerar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ))}
    </div>
  );
}