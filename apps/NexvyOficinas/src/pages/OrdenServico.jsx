import { useEffect, useState } from "react";
import { Plus, ClipboardList, User, Car, Wrench, CheckCircle, Clock, Package, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoOrdens } from "@/data/demoData";

const statusConfig = {
  em_andamento: { label: "Em Andamento", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  concluida: { label: "Concluída", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  aguardando_peca: { label: "Aguard. Peça", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

const itemStatusIcon = { concluido: CheckCircle, em_andamento: Clock, pendente: Clock, aguardando_peca: Package };
const itemStatusColor = { concluido: "text-green-400", em_andamento: "text-blue-400", pendente: "text-gray-500", aguardando_peca: "text-yellow-400" };

export default function OrdenServico() {
  const [user, setUser] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [expanded, setExpanded] = useState("os1");
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const filtradas = demoOrdens.filter(o => filtro === "todos" || o.status === filtro);
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Ordens de Serviço</h1>
              <p className="text-gray-500 text-sm mt-1">Acompanhe o andamento técnico de cada OS</p>
            </div>
            <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm">
              <Plus className="w-4 h-4" /> Nova OS
            </button>
          </div>
          <div className="flex gap-2 mb-6">
            {["todos", "em_andamento", "aguardando_peca", "concluida"].map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${filtro === f ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600"}`}>
                {f === "todos" ? "Todos" : statusConfig[f]?.label || f}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filtradas.map(os => {
              const sc = statusConfig[os.status];
              const isExp = expanded === os.id;
              const concluidos = os.itens.filter(i => i.status === "concluido").length;
              const progresso = Math.round((concluidos / os.itens.length) * 100);
              return (
                <div key={os.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="p-5 cursor-pointer" onClick={() => setExpanded(isExp ? null : os.id)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-white">{os.numero}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc.color}`}>{sc.label}</span>
                          {os.prioridade === "alta" && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Alta</span>}
                          {os.pagamento_status === "pago" && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Pago</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{os.cliente_nome}</span>
                          <span className="flex items-center gap-1"><Car className="w-3 h-3" />{os.veiculo_desc}</span>
                          <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{os.tecnico}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-32">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progresso}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{progresso}% concluído</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-white">R$ {os.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        {isExp ? <ChevronUp className="w-4 h-4 text-gray-500 ml-auto mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-500 ml-auto mt-1" />}
                      </div>
                    </div>
                  </div>
                  {isExp && (
                    <div className="border-t border-gray-800 p-5 bg-gray-900/50">
                      <div className="space-y-2 mb-4">
                        {os.itens.map((item, i) => {
                          const ItemIcon = itemStatusIcon[item.status] || Clock;
                          return (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                              <ItemIcon className={`w-4 h-4 flex-shrink-0 ${itemStatusColor[item.status]}`} />
                              <span className="flex-1 text-sm text-gray-300">{item.descricao}</span>
                              <span className="text-sm font-medium text-white">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })}
                      </div>
                      {os.observacoes && <p className="text-xs text-gray-500 italic bg-gray-800/50 px-3 py-2 rounded-lg mb-3">"{os.observacoes}"</p>}
                      {os.orcamento_id && <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">↗ Originado do orçamento · Itens aproveitados automaticamente</div>}
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