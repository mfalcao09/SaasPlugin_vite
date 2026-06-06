import { demoOrcamentos } from "@/data/demoData";
import { FileText, ArrowRight, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useState } from "react";

const statusStyle = {
  aprovado: { backgroundColor: "#D1FAE5", color: "#065F46" },
  pendente: { backgroundColor: "#FEF3C7", color: "#92400E" },
  recusado: { backgroundColor: "#FEE2E2", color: "#991B1B" },
};
const statusLabel = { aprovado: "Aprovado", pendente: "Pendente", recusado: "Recusado" };

export default function DemoOrcamentos() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="p-4 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Orçamentos</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{demoOrcamentos.length} orçamentos</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo orçamento
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Aprovados", status: "aprovado" },
          { label: "Pendentes", status: "pendente" },
          { label: "Recusados", status: "recusado" },
        ].map((s) => (
          <div key={s.label} className="rounded border p-4 text-center"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="text-2xl font-black" style={{ color: "var(--brand)" }}>
              {demoOrcamentos.filter(o => o.status === s.status).length}
            </div>
            <div className="text-xs font-medium mt-1" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {demoOrcamentos.map((o) => {
          const isExpanded = expanded === o.id;
          return (
            <div key={o.id} className="rounded border overflow-hidden"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
              <div className="p-5 cursor-pointer transition-colors hover:bg-[#F0EEE8]"
                onClick={() => setExpanded(isExpanded ? null : o.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono" style={{ color: "var(--ink-muted)" }}>{o.numero}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={statusStyle[o.status] || { backgroundColor: "#F3F4F6", color: "#4B5563" }}>
                        {statusLabel[o.status] || o.status}
                      </span>
                      {o.convertido_em_os && (
                        <span className="text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-1"
                          style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand)" }}>
                          <ArrowRight className="w-3 h-3" /> Convertido em OS
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{o.cliente_nome}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{o.veiculo_desc}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>
                      {new Date(o.data).toLocaleDateString("pt-BR")} · válido até {new Date(o.validade).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-base" style={{ color: "var(--brand)" }}>
                      R$ {o.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{o.itens.length} itens</div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 ml-auto mt-2" style={{ color: "var(--ink-muted)" }} />
                      : <ChevronDown className="w-4 h-4 ml-auto mt-2" style={{ color: "var(--ink-muted)" }} />
                    }
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--line-soft)", backgroundColor: "var(--surface)" }}>
                  <div className="pt-4 space-y-0">
                    {o.itens.map((item, i) => (
                      <div key={i} className="flex justify-between py-2.5"
                        style={{ borderBottom: "1px solid var(--line-soft)" }}>
                        <span className="text-sm" style={{ color: "var(--ink)" }}>{item.descricao}</span>
                        <span className="font-semibold text-sm" style={{ color: "var(--brand)" }}>
                          R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Total</span>
                    <span className="font-black text-base" style={{ color: "var(--brand)" }}>
                      R$ {o.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {o.status === "aprovado" && !o.convertido_em_os && (
                    <button className="mt-4 w-full text-white font-bold py-2.5 rounded text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ backgroundColor: "var(--brand)" }}>
                      <ArrowRight className="w-4 h-4" /> Converter em OS
                    </button>
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