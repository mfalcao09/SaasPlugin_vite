import { useEffect, useState } from "react";
import { Shield, Building2, TrendingUp, Users, DollarSign, CheckCircle, Clock, AlertCircle, Globe } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoMasterData } from "@/data/demoData";

const statusConfig = {
  ativo: { label: "Ativo", color: "bg-green-500/20 text-green-400" },
  trial: { label: "Trial", color: "bg-amber-500/20 text-amber-400" },
  inativo: { label: "Inativo", color: "bg-red-500/20 text-red-400" },
};

export default function PainelMaster() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const data = demoMasterData;

  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Painel Master</h1>
              <p className="text-gray-500 text-sm">Visão super admin — todas as oficinas da plataforma</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total de Oficinas", value: data.total_oficinas, icon: Building2, color: "bg-blue-500/20 text-blue-400" },
              { label: "Oficinas Ativas", value: data.oficinas_ativas, icon: CheckCircle, color: "bg-green-500/20 text-green-400" },
              { label: "Em Trial", value: data.total_oficinas - data.oficinas_ativas, icon: Clock, color: "bg-amber-500/20 text-amber-400" },
              { label: "MRR Estimado", value: `R$ ${data.mrr.toLocaleString('pt-BR')}`, icon: DollarSign, color: "bg-purple-500/20 text-purple-400" },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500 text-xs">{card.label}</span>
                    <div className={`w-8 h-8 ${card.color} rounded-lg flex items-center justify-center`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white">{card.value}</div>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-white">Oficinas Cadastradas</h3>
              <button className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1.5 rounded-lg transition-colors">+ Nova Oficina</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Oficina</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Plano</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Status</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">OS/mês</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Faturamento</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Onboarding</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.oficinas.map((of) => {
                    const sc = statusConfig[of.status];
                    return (
                      <tr key={of.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{of.nome}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1"><Globe className="w-3 h-3" />{of.cidade}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded-lg border border-gray-700">{of.plano}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">{of.os_mes}</td>
                        <td className="px-5 py-4 text-sm font-medium text-white">R$ {of.faturamento.toLocaleString('pt-BR')}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${of.onboarding}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{of.onboarding}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <button className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors">Gerenciar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}