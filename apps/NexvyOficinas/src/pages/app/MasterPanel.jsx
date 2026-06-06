import { demoMasterData } from "@/data/demoData";
import { Shield, Building2, TrendingUp, Users, CheckCircle2, Clock } from "lucide-react";

const statusStyle = {
  ativo: { backgroundColor: "#D1FAE5", color: "#065F46" },
  trial: { backgroundColor: "#FEF3C7", color: "#92400E" },
  inativo: { backgroundColor: "#FEE2E2", color: "#991B1B" },
};
const statusLabel = { ativo: "Ativo", trial: "Trial", inativo: "Inativo" };

export default function MasterPanel() {
  const d = demoMasterData;

  return (
    <div className="p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded flex items-center justify-center"
          style={{ backgroundColor: "var(--brand-subtle)" }}>
          <Shield className="w-5 h-5" style={{ color: "var(--brand)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Painel Master</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Visão geral de todas as oficinas na plataforma</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Oficinas", value: d.total_oficinas, icon: Building2 },
          { label: "Ativas", value: d.oficinas_ativas, icon: CheckCircle2 },
          { label: "Em Trial", value: d.oficinas_trial, icon: Clock },
          { label: "MRR", value: `R$ ${d.mrr.toLocaleString("pt-BR")}`, icon: TrendingUp },
        ].map((s) => (
          <div key={s.label} className="rounded border p-4"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="w-8 h-8 rounded flex items-center justify-center mb-3"
              style={{ backgroundColor: "var(--brand-subtle)" }}>
              <s.icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
            </div>
            <div className="text-xl font-black" style={{ color: "var(--ink)" }}>{s.value}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Oficinas Cadastradas</h2>
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ borderBottom: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
                <th className="text-left pb-3 font-semibold">Empresa</th>
                <th className="text-left pb-3 font-semibold hidden md:table-cell">Cidade</th>
                <th className="text-left pb-3 font-semibold">Plano</th>
                <th className="text-left pb-3 font-semibold">Status</th>
                <th className="text-right pb-3 font-semibold hidden sm:table-cell">OS/mês</th>
                <th className="text-right pb-3 font-semibold">Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {d.oficinas.map((of) => (
                <tr key={of.id} className="transition-colors hover:bg-[#F0EEE8]"
                  style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "var(--brand-subtle)" }}>
                        <Building2 className="w-4 h-4" style={{ color: "var(--brand)" }} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{of.nome}</div>
                        <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                          desde {new Date(of.data_inicio).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-sm hidden md:table-cell" style={{ color: "var(--ink-muted)" }}>{of.cidade}</td>
                  <td className="py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line-soft)", color: "var(--ink)" }}>
                      {of.plano}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={statusStyle[of.status]}>
                      {statusLabel[of.status]}
                    </span>
                  </td>
                  <td className="py-3 text-right text-sm hidden sm:table-cell" style={{ color: "var(--ink-muted)" }}>{of.os_mes}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${of.onboarding}%`,
                            backgroundColor: of.onboarding === 100 ? "#059669" : "var(--brand)"
                          }}
                        />
                      </div>
                      <span className="text-xs w-8" style={{ color: "var(--ink-muted)" }}>{of.onboarding}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border p-5 text-center"
        style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)" }}>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          Este painel é exclusivo do <strong style={{ color: "var(--ink)" }}>Super Admin</strong> — dono da plataforma AutoFlow AI.
          <br />
          Gerencie todas as oficinas, acesse dados consolidados e controle o status de cada cliente.
        </p>
      </div>
    </div>
  );
}