import { demoVeiculos } from "@/data/demoData";
import { Car, Search, Calendar, Gauge, Wrench, Plus } from "lucide-react";
import { useState } from "react";

export default function DemoVeiculos() {
  const [search, setSearch] = useState("");

  const filtered = demoVeiculos.filter((v) =>
    v.modelo.toLowerCase().includes(search.toLowerCase()) ||
    v.marca.toLowerCase().includes(search.toLowerCase()) ||
    v.placa.toLowerCase().includes(search.toLowerCase()) ||
    v.cliente_nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Veículos</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{demoVeiculos.length} veículos cadastrados</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo veículo
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--ink-muted)" }} />
        <input
          type="text"
          placeholder="Buscar por modelo, placa ou cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border pl-9 pr-4 py-2.5 text-sm focus:outline-none transition-colors"
          style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)", color: "var(--ink)" }}
        />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((v) => (
          <div key={v.id} className="rounded border p-5 cursor-pointer transition-all hover:border-brand"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded flex items-center justify-center"
                  style={{ backgroundColor: "var(--brand-subtle)" }}>
                  <Car className="w-5 h-5" style={{ color: "var(--brand)" }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{v.marca} {v.modelo}</h3>
                  <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{v.ano} · {v.cor}</span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line-soft)", color: "var(--ink)" }}>
                {v.placa}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}>
                  <Gauge className="w-3 h-3" /> Quilometragem
                </span>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{v.quilometragem.toLocaleString("pt-BR")} km</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}>
                  <Calendar className="w-3 h-3" /> Última revisão
                </span>
                <span style={{ color: "var(--ink)" }}>{new Date(v.ultima_revisao).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}>
                  <Wrench className="w-3 h-3" /> Próxima revisão
                </span>
                <span className="font-semibold" style={{ color: "var(--brand)" }}>{new Date(v.proxima_revisao).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 flex items-center justify-between text-xs"
              style={{ borderTop: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
              <span>Cliente: <span className="font-semibold" style={{ color: "var(--ink)" }}>{v.cliente_nome}</span></span>
              <span>{v.historico_servicos} serviços</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}