import { useEffect, useState } from "react";
import { Plus, Car, User, CheckCircle, Clock, XCircle, ArrowRight, FileText } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoOrcamentos } from "@/data/demoData";

const statusConfig = {
  aprovado: { label: "Aprovado", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
  pendente: { label: "Pendente", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  recusado: { label: "Recusado", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
};

export default function Orcamentos() {
  const [user, setUser] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [selected, setSelected] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const filtrados = demoOrcamentos.filter(o => filtro === "todos" || o.status === filtro);
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Orçamentos</h1>
              <p className="text-gray-500 text-sm mt-1">Orçamento aprovado → vira OS automaticamente com todos os itens</p>
            </div>
            <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm">
              <Plus className="w-4 h-4" /> Novo Orçamento
            </button>
          </div>
          <div className="flex gap-2 mb-6">
            {["todos", "pendente", "aprovado", "recusado"].map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors
                  ${filtro === f ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600"}`}>
                {f === "todos" ? "Todos" : statusConfig[f]?.label || f}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filtrados.map(o => {
              const sc = statusConfig[o.status];
              const Icon = sc.icon;
              const isExpanded = selected?.id === o.id;
              return (
                <div key={o.id} onClick={() => setSelected(isExpanded ? null : o)} className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-xl p-5 cursor-pointer transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-white text-sm">{o.numero}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc.color}`}>{sc.label}</span>
                        {o.convertido_em_os && <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">→ OS Criada</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{o.cliente_nome}</span>
                        <span className="flex items-center gap-1"><Car className="w-3 h-3" />{o.veiculo_desc}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-white text-lg">R$ {o.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-gray-500">{new Date(o.data).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      {o.itens.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1">
                          <span className="text-gray-300">{item.descricao}</span>
                          <span className="text-white font-medium">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-700 font-bold mt-2">
                        <span className="text-white">Total</span>
                        <span className="text-amber-400">R$ {o.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {o.status === "pendente" && (
                        <div className="flex gap-2 mt-4">
                          <button className="flex-1 flex items-center justify-center gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm font-medium">
                            <CheckCircle className="w-4 h-4" /> Aprovar e Criar OS
                          </button>
                          <button className="flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium">
                            <XCircle className="w-4 h-4" /> Recusar
                          </button>
                        </div>
                      )}
                      {o.convertido_em_os && (
                        <div className="flex items-center gap-2 text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mt-3">
                          <ArrowRight className="w-4 h-4" />
                          Orçamento convertido em OS · Itens aproveitados automaticamente
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}