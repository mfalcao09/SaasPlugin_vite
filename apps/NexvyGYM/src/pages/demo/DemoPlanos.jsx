import { demoPlans } from "@/lib/demoData";
import StatusBadge from "@/components/ui/StatusBadge";

const recurrenceLabel = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", avulso: "Avulso" };

export default function DemoPlanos() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {demoPlans.map(p => (
          <div key={p.id} className="bg-[#18181B] border border-gym-border rounded-xl p-5 flex flex-col gap-4 hover:border-gym-orange/30 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-white text-lg">{p.name}</div>
                <div className="text-xs text-gym-subtle mt-1">{p.modality} • {recurrenceLabel[p.recurrence] || p.recurrence}</div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-3xl font-bold text-gym-orange text-tabular">
              R$ {(p.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            {p.observations && <p className="text-xs text-gym-muted">{p.observations}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}