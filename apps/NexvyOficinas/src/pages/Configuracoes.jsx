import { useEffect, useState } from "react";
import { Settings, Building2, Palette, Phone, MapPin, Save } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { base44 } from "@/api/base44Client";
import { demoEmpresa } from "@/data/demoData";

export default function Configuracoes() {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(demoEmpresa);
  const [saved, setSaved] = useState(false);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppLayout user={user}>
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-white">Configurações</h1>
            <p className="text-gray-500 text-sm mt-1">Identidade visual e dados da oficina</p>
          </div>

          <div className="space-y-6">
            {/* Dados básicos */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white">Dados da Oficina</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Nome da Oficina", key: "nome" },
                  { label: "Slogan", key: "slogan" },
                  { label: "E-mail", key: "email" },
                  { label: "Telefone", key: "telefone" },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-gray-400 font-medium mb-1.5 block">{field.label}</label>
                    <input
                      value={empresa[field.key] || ""}
                      onChange={e => setEmpresa({ ...empresa, [field.key]: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Endereço</label>
                  <input
                    value={empresa.endereco || ""}
                    onChange={e => setEmpresa({ ...empresa, endereco: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>

            {/* White-label */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Palette className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white">Identidade Visual (White-label)</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Cor Primária</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={empresa.cor_primaria || "#f59e0b"} onChange={e => setEmpresa({ ...empresa, cor_primaria: e.target.value })}
                      className="w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer" />
                    <input value={empresa.cor_primaria || ""} onChange={e => setEmpresa({ ...empresa, cor_primaria: e.target.value })}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 font-mono" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Plano Atual</label>
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
                    <span className="text-amber-400 font-bold text-sm">{empresa.plano}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSave}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${saved ? "bg-green-500 text-white" : "bg-amber-500 hover:bg-amber-400 text-black"}`}>
                <Save className="w-4 h-4" />
                {saved ? "Salvo!" : "Salvar configurações"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}