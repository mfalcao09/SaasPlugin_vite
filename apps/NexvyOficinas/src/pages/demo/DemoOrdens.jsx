import { demoOrdens } from "@/data/demoData";
import { ClipboardList, Wrench, CheckCircle2, Clock, Package, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useState } from "react";

const statusConfig = {
  em_andamento: { label: "Em andamento", style: { backgroundColor: "#DBEAFE", color: "#1E40AF" } },
  aguardando_peca: { label: "Aguard. peça", style: { backgroundColor: "#FEF3C7", color: "#92400E" } },
  concluida: { label: "Concluída", style: { backgroundColor: "#D1FAE5", color: "#065F46" } },
  pendente: { label: "Pendente", style: { backgroundColor: "#F3F4F6", color: "#4B5563" } },
};

const itemStatusConfig = {
  concluido: { icon: CheckCircle2, color: "#059669" },
  em_andamento: { icon: Wrench, color: "var(--brand)" },
  aguardando_peca: { icon: Package, color: "#D97706" },
  pendente: { icon: Clock, color: "#9CA3AF" },
};

export default function DemoOrdens() {
  const [expanded, setExpanded] = useState(null);
  const [filtro, setFiltro] = useState("todos");

  const filtered = filtro === "todos" ? demoOrdens : demoOrdens.filter((o) => o.status === filtro);

  return (
    <div className="p-4 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Ordens de Serviço</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{demoOrdens.length} ordens registradas</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Nova OS
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {["todos", ...Object.keys(statusConfig)].map((f) => {
          const sc = statusConfig[f];
          return (
            <button key={f} onClick={() => setFiltro(f)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={filtro === f
                ? (sc ? sc.style : { backgroundColor: "var(--brand)", color: "white" })
                : { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line-soft)", color: "var(--ink-muted)" }
              }>
              {sc ? sc.label : "Todos"}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.map((os) => {
          const sc = statusConfig[os.status];
          const concluidos = os.itens.filter((i) => i.status === "concluido").length;
          const prog = Math.round((concluidos / os.itens.length) * 100);
          const isExpanded = expanded === os.id;

          return (
            <div key={os.id} className="rounded border overflow-hidden"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
              <div className="p-5 cursor-pointer transition-colors hover:bg-[#F0EEE8]"
                onClick={() => setExpanded(isExpanded ? null : os.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono" style={{ color: "var(--ink-muted)" }}>{os.numero}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={sc?.style}>{sc?.label}</span>
                    </div>
                    <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{os.cliente_nome}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{os.veiculo_desc}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>Técnico: {os.tecnico}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1" style={{ color: "var(--ink-muted)" }}>
                        <span>{concluidos}/{os.itens.length} concluídos</span>
                        <span className="font-bold" style={{ color: "var(--brand)" }}>{prog}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${prog}%`, backgroundColor: os.status === "concluida" ? "#059669" : "var(--brand)" }} />
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-base" style={{ color: "var(--brand)" }}>
                      R$ {os.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 ml-auto mt-3" style={{ color: "var(--ink-muted)" }} />
                      : <ChevronDown className="w-4 h-4 ml-auto mt-3" style={{ color: "var(--ink-muted)" }} />
                    }
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-0" style={{ borderTop: "1px solid var(--line-soft)", backgroundColor: "var(--surface)" }}>
                  <div className="space-y-2 pt-4">
                    {os.itens.map((item, i) => {
                      const ic = itemStatusConfig[item.status] || itemStatusConfig.pendente;
                      const Icon = ic.icon;
                      return (
                        <div key={i} className="flex items-center justify-between py-2"
                          style={{ borderBottom: "1px solid var(--line-soft)" }}>
                          <div className="flex items-center gap-3">
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: ic.color }} />
                            <span className="text-sm" style={{ color: "var(--ink)" }}>{item.descricao}</span>
                          </div>
                          <span className="font-semibold text-sm" style={{ color: "var(--brand)" }}>
                            R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {os.orcamento_id && (
                    <div className="mt-4 rounded p-3 text-xs font-medium"
                      style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand)" }}>
                      ✅ OS gerada a partir de orçamento aprovado — itens reaproveitados automaticamente
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}