import { Users, TrendingUp, AlertCircle, DollarSign, CheckSquare, Zap, UserPlus } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { demoDashboardStats, demoStudents, demoCheckins, demoAIOpportunities, demoFinancial } from "@/lib/demoData";
import StatusBadge from "@/components/ui/StatusBadge";

export default function DemoDashboard() {
  const stats = demoDashboardStats;
  const recentCheckins = demoCheckins.slice(0, 5);
  const alerts = demoAIOpportunities.slice(0, 3);
  const recentStudents = demoStudents.filter(s => s.tags?.includes("novo")).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Alunos Ativos" value={stats.active_students} color="orange" />
        <StatCard icon={UserPlus} label="Inativos" value={stats.inactive_students} color="red" />
        <StatCard icon={CheckSquare} label="Check-ins Hoje" value={stats.checkins_today} color="green" />
        <StatCard icon={AlertCircle} label="Planos Vencendo" value={stats.plans_expiring_soon} color="yellow" />
        <StatCard icon={DollarSign} label="A Receber" value={`R$ ${(stats.receivable || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="blue" />
        <StatCard icon={TrendingUp} label="Receita do Mês" value={`R$ ${(stats.revenue_month || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#18181B] border border-gym-border rounded-xl">
          <div className="p-4 border-b border-gym-border flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-white">Check-ins Recentes</h3>
          </div>
          <div className="divide-y divide-gym-border/30">
            {recentCheckins.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gym-green/15 flex items-center justify-center text-gym-green text-xs font-bold">
                    {(c.student_name || "?")[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{c.student_name}</div>
                    <div className="text-xs text-gym-subtle">{c.modality || "—"} • Prof. {c.professor || "—"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gym-muted">{c.time || "—"}</div>
                  <div className="text-xs text-gym-subtle">{c.date ? new Date(c.date).toLocaleDateString("pt-BR") : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#18181B] border border-gym-border rounded-xl">
          <div className="p-4 border-b border-gym-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-white">AI Alertas</h3>
            <span className="ml-auto text-[9px] bg-gym-orange text-white px-1.5 py-0.5 rounded-full font-bold">IA</span>
          </div>
          <div className="divide-y divide-gym-border/30">
            {alerts.map(a => (
              <div key={a.id} className="p-4 hover:bg-white/[0.02]">
                <div className="flex items-start gap-2">
                  <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${a.priority === "alta" ? "text-gym-red" : "text-gym-yellow"}`} />
                  <div>
                    <div className="text-sm font-medium text-white leading-tight">{a.title}</div>
                    <div className="text-xs text-gym-subtle mt-1">{a.metric}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {recentStudents.length > 0 && (
        <div className="bg-[#18181B] border border-gym-border rounded-xl">
          <div className="p-4 border-b border-gym-border flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-gym-blue" />
            <h3 className="font-semibold text-white">Novos Alunos</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gym-border/30">
            {recentStudents.map((s, i) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gym-blue/15 flex items-center justify-center text-gym-blue font-bold">{s.name[0]}</div>
                <div>
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <div className="text-xs text-gym-subtle">{s.plan_name || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}