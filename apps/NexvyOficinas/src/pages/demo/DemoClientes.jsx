import { useState } from "react";
import { Search, Plus, Car, Phone, Mail, Calendar } from "lucide-react";
import { demoClientes } from "@/data/demoData";

export default function DemoClientes() {
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const filtrados = demoClientes.filter(c => {
    const matchSearch = c.nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search);
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Clientes</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{demoClientes.length} clientes cadastrados</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo cliente
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--ink-muted)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full rounded border pl-9 pr-4 py-2.5 text-sm focus:outline-none transition-colors"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)", color: "var(--ink)" }}
          />
        </div>
        <div className="flex gap-2">
          {["todos", "ativo", "inativo"].map(f => (
            <button key={f} onClick={() => setFiltroStatus(f)}
              className="px-4 py-2.5 rounded text-sm font-semibold transition-all capitalize"
              style={filtroStatus === f
                ? { backgroundColor: "var(--brand)", color: "white" }
                : { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line-soft)", color: "var(--ink-muted)" }
              }>
              {f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtrados.map(c => (
          <div key={c.id} className="rounded border p-5 cursor-pointer transition-all hover:border-brand"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: "var(--brand)" }}>
                  {c.nome.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{c.nome}</h3>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {c.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded font-semibold"
                        style={tag === "VIP"
                          ? { backgroundColor: "var(--brand-subtle)", color: "var(--brand)" }
                          : tag === "Inativo"
                            ? { backgroundColor: "#FEE2E2", color: "#991B1B" }
                            : { backgroundColor: "#F3F4F6", color: "#4B5563" }
                        }>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded font-semibold"
                style={c.status === "ativo"
                  ? { backgroundColor: "#D1FAE5", color: "#065F46" }
                  : { backgroundColor: "#FEE2E2", color: "#991B1B" }
                }>{c.status}</span>
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: "var(--ink-muted)" }}>
              <div className="flex items-center gap-2"><Phone className="w-3 h-3 flex-shrink-0" />{c.telefone}</div>
              <div className="flex items-center gap-2"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{c.email}</span></div>
              <div className="flex items-center gap-2"><Calendar className="w-3 h-3 flex-shrink-0" />Última visita: {new Date(c.ultima_visita).toLocaleDateString("pt-BR")}</div>
            </div>
            <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                <Car className="w-3 h-3" />{c.veiculos} veículo{c.veiculos > 1 ? "s" : ""}
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--brand)" }}>
                R$ {c.total_gasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}