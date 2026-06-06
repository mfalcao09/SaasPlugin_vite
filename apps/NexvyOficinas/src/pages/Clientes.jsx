import { useEffect, useState } from "react";
import { Search, Plus, Phone, Mail, Calendar, Car, Tag } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoClientes } from "@/data/demoData";

export default function Clientes() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const filtrados = demoClientes.filter(c => {
    const matchSearch = c.nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search);
    const matchFiltro = filtro === "todos" || c.status === filtro;
    return matchSearch && matchFiltro;
  });

  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Clientes</h1>
              <p className="text-gray-500 text-sm mt-1">{demoClientes.length} clientes cadastrados</p>
            </div>
            <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors">
              <Plus className="w-4 h-4" /> Novo Cliente
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50" />
            </div>
            <div className="flex gap-2">
              {["todos", "ativo", "inativo"].map(f => (
                <button key={f} onClick={() => setFiltro(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors
                    ${filtro === f ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600"}`}>
                  {f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : "Inativos"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map(c => (
              <div key={c.id} className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-xl p-5 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                      <span className="text-amber-400 font-bold">{c.nome.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{c.nome}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === "ativo" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {c.status === "ativo" ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                  {c.tags.includes("VIP") && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 font-medium">VIP</span>
                  )}
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Phone className="w-3 h-3" /> {c.telefone}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Mail className="w-3 h-3" /> {c.email}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Calendar className="w-3 h-3" /> Última visita: {new Date(c.ultima_visita).toLocaleDateString('pt-BR')}</div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <div className="flex items-center gap-2 text-xs text-gray-500"><Car className="w-3 h-3" /> {c.veiculos} veículo{c.veiculos !== 1 ? 's' : ''}</div>
                  <div className="text-xs font-bold text-white">R$ {c.total_gasto.toLocaleString('pt-BR')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}