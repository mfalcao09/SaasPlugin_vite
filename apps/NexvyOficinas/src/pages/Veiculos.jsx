import { useEffect, useState } from "react";
import { Search, Plus, Car, User, Gauge, Calendar, Wrench, ChevronRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoVeiculos } from "@/data/demoData";

const marcaColors = { Toyota: "bg-red-500/20 text-red-400", Honda: "bg-blue-500/20 text-blue-400", Volkswagen: "bg-gray-500/20 text-gray-400", Chevrolet: "bg-yellow-500/20 text-yellow-400", Fiat: "bg-orange-500/20 text-orange-400", Jeep: "bg-green-500/20 text-green-400" };

export default function Veiculos() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const filtrados = demoVeiculos.filter(v =>
    v.modelo.toLowerCase().includes(search.toLowerCase()) || v.marca.toLowerCase().includes(search.toLowerCase()) ||
    v.placa.toLowerCase().includes(search.toLowerCase()) || v.cliente_nome.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Veículos</h1>
              <p className="text-gray-500 text-sm mt-1">{demoVeiculos.length} veículos cadastrados · entidade central com histórico completo</p>
            </div>
            <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm">
              <Plus className="w-4 h-4" /> Novo Veículo
            </button>
          </div>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por marca, modelo, placa ou cliente..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map(v => (
              <div key={v.id} className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-xl p-5 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center border border-gray-700">
                      <Car className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{v.marca} {v.modelo}</h3>
                      <p className="text-gray-500 text-xs">{v.ano} · {v.cor}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${marcaColors[v.marca] || "bg-gray-500/20 text-gray-400"}`}>{v.placa}</span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400"><User className="w-3 h-3" /> {v.cliente_nome}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Gauge className="w-3 h-3" /> {v.quilometragem.toLocaleString('pt-BR')} km</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Calendar className="w-3 h-3" /> Próxima revisão: {new Date(v.proxima_revisao).toLocaleDateString('pt-BR')}</div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500"><Wrench className="w-3 h-3" />{v.historico_servicos} serviço{v.historico_servicos !== 1 ? 's' : ''}</div>
                  <button className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"><ChevronRight className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}