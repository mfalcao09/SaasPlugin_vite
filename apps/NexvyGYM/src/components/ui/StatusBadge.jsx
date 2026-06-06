import { cn } from "@/lib/utils";

const variants = {
  ativo: "bg-gym-green/15 text-gym-green border border-gym-green/30",
  inativo: "bg-gym-red/15 text-gym-red border border-gym-red/30",
  pago: "bg-gym-green/15 text-gym-green border border-gym-green/30",
  pendente: "bg-gym-yellow/15 text-gym-yellow border border-gym-yellow/30",
  vencendo: "bg-gym-yellow/15 text-gym-yellow border border-gym-yellow/30",
  bloqueado: "bg-gym-red/15 text-gym-red border border-gym-red/30",
  agendado: "bg-gym-blue/15 text-gym-blue border border-gym-blue/30",
  concluido: "bg-gym-green/15 text-gym-green border border-gym-green/30",
  novo: "bg-gym-blue/15 text-gym-blue border border-gym-blue/30",
  recorrente: "bg-gym-orange/15 text-gym-orange border border-gym-orange/30",
  "queda frequência": "bg-gym-yellow/15 text-gym-yellow border border-gym-yellow/30",
  "plano vencendo": "bg-gym-yellow/15 text-gym-yellow border border-gym-yellow/30",
  pro: "bg-gym-purple/15 text-gym-purple border border-gym-purple/30",
  starter: "bg-gym-blue/15 text-gym-blue border border-gym-blue/30",
};

export default function StatusBadge({ status }) {
  const key = (status || "").toLowerCase();
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide",
      variants[key] || "bg-gym-border/20 text-gym-muted border border-gym-border"
    )}>
      {status}
    </span>
  );
}