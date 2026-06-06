import { useEffect, useState } from "react";
import { UserCog, Mail, Phone, CheckCircle, UserPlus } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoEquipe } from "@/data/demoData";

const papelColors = {
  "Admin da Oficina": "bg-amber-500/20 text-amber-400",
  "Técnico / Mecânico": "bg-blue-500/20 text-blue-400",
  "Atendimento / Recepção": "bg-purple-500/20 text-purple-400",
  "Financeiro / Administrativo": "bg-green-500/20 text-green-400",
};

export default function Equipe() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Equipe</h1>
              <p className="text-gray-500 text-sm mt-1">Gestão de membros e permissões de acesso</p>
            </div>
            <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm">
              <UserPlus className="w-4 h-4" /> Convidar Membro
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {demoEquipe.map(membro => (
              <div key={membro.id} className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-xl p-5 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30">
                      <span className="text-amber-400 font-bold">{membro.nome.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{membro.nome}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${papelColors[membro.papel] || "bg-gray-500/20 text-gray-400"}`}>
                        {membro.papel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-xs text-green-400">Ativo</span>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Mail className="w-3 h-3" /> {membro.email}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Phone className="w-3 h-3" /> {membro.telefone}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><UserCog className="w-3 h-3" /> {membro.especialidade}</div>
                </div>
                {membro.os_concluidas_mes > 0 && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-gray-500">{membro.os_concluidas_mes} OS concluídas no mês</span>
                    {membro.os_ativas > 0 && <span className="text-xs text-blue-400 ml-auto">{membro.os_ativas} ativa{membro.os_ativas !== 1 ? 's' : ''}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}