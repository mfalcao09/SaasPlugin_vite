import { useOutletContext } from "react-router-dom";
import { Users, TrendingUp, AlertCircle, DollarSign, CheckSquare, Zap, Clock, UserPlus } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { demoDashboardStats, demoStudents, demoCheckins, demoAIOpportunities, demoFinancial } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import StatusBadge from "@/components/ui/StatusBadge";

export default function Dashboard() {
  const { demo } = useOutletContext() || {};
  const { academy, user, viewingAsAdmin } = useAcademy();
  const slug = new URLSearchParams(window.location.search).get("slug");
  console.log("[Dashboard]", { user: user?.email, academy: academy?.name, slug, viewingAsAdmin });

  const academyId = demo ? null : academy?.id;
  const { data: students } = useRealData("Student", academyId);
  const { data: checkins } = useRealData("Checkin", academyId);
  const { data: financial } = useRealData("Financial", academyId);

  const today = new Date().toISOString().slice(0, 10);

  const stats = demo ? demoDashboardStats : (() => {
    const active = students.filter(s => s.status === "ativo").length;
    const inactive = students.filter(s => s.status === "inativo").length;
    const checkinsToday = checkins.filter(c => c.date === today).length;
    const receivable = financial.filter(f => f.type === "receita" && f.status === "pendente").reduce((s, f) => s + (f.value || 0), 0);
    const revenueMonth = financial.filter(f => f.type === "receita" && f.status === "pago" && f.date?.startsWith(today.slice(0, 7))).reduce((s, f) => s + (f.value || 0), 0);
    const expiring = students.filter(s => {
      if (!s.expiry_date) return false;
      const diff = (new Date(s.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;
    return { active_students: active, inactive_students: inactive, checkins_today: checkinsToday, receivable, revenue_month: revenueMonth, plans_expiring_soon: expiring };
  })();

  const recentCheckins = demo ? demoCheckins.slice(0, 5) : checkins.slice(0, 5);
  const alerts = demo ? demoAIOpportunities.slice(0, 3) : [];
  const recentStudents = demo ? demoStudents.filter(s => s.tags?.includes("novo")).slice(0, 4) : students.filter(s => s.tags?.includes("novo")).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Alunos Ativos" value={stats.active_students} color="orange" />
        <StatCard icon={UserPlus} label="Inativos" value={stats.inactive_students} color="red" />
        <StatCard icon={CheckSquare} label="Check-ins Hoje" value={stats.checkins_today} color="green" />
        <StatCard icon={AlertCircle} label="Planos Vencendo" value={stats.plans_expiring_soon} color="yellow" />
        <StatCard icon={DollarSign} label="A Receber" value={`R$ ${(stats.receivable || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="blue" />
        <StatCard icon={TrendingUp} label="Receita do Mês" value={`R$ ${(stats.revenue_month || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent check-ins */}
        <div className="lg:col-span-2 bg-white border border-gym-border rounded-xl p-0 shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2 bg-white rounded-t-xl">
            <CheckSquare className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-gym-text">Check-ins Recentes</h3>
          </div>
          <div className="divide-y divide-gym-border/30 p-0">
             {recentCheckins.length === 0 ? (
               <div className="p-6 text-center text-gym-subtle text-sm bg-white">Nenhum check-in registrado</div>
            ) : recentCheckins.map((c, i) => (
              <div key={c.id || i} className="flex items-center justify-between px-4 py-3 hover:bg-gym-surface/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gym-green/12 flex items-center justify-center text-gym-green text-xs font-bold">
                    {(c.student_name || "?")[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gym-text">{c.student_name}</div>
                    <div className="text-xs text-gym-muted">{c.modality || "—"} • Prof. {c.professor || "—"}</div>
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

        {/* AI Alerts */}
        <div className="bg-white border border-gym-border rounded-xl p-0 shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2 bg-white rounded-t-xl">
            <Zap className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-gym-text">AI Alertas</h3>
            {demo && <span className="ml-auto text-[9px] bg-gym-orange text-white px-1.5 py-0.5 rounded-full font-bold">DEMO</span>}
          </div>
          <div className="divide-y divide-gym-border/30 p-0">
             {alerts.length === 0 ? (
               <div className="p-6 text-center text-gym-subtle text-sm bg-white">Nenhum alerta no momento</div>
            ) : alerts.map(a => (
              <div key={a.id} className="p-4 hover:bg-gym-surface/50 transition-colors border-b border-gym-border/30 last:border-0">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.priority === "alta" ? "bg-gym-red/12" : "bg-gym-yellow/12"}`}>
                    <AlertCircle className={`w-4 h-4 ${a.priority === "alta" ? "text-gym-red" : "text-gym-yellow"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gym-text leading-tight">{a.title}</div>
                    <div className="text-xs text-gym-muted mt-1">{a.metric}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New students */}
      {recentStudents.length > 0 && (
        <div className="bg-white border border-gym-border rounded-xl p-0 shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2 bg-white rounded-t-xl">
            <UserPlus className="w-4 h-4 text-gym-blue" />
            <h3 className="font-semibold text-gym-text">Novos Alunos</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gym-border/30 bg-white">
            {recentStudents.map((s, i) => (
              <div key={s.id || i} className="p-4 flex items-center gap-3 hover:bg-gym-surface/50 transition-colors bg-white">
                <div className="w-9 h-9 rounded-full bg-gym-blue/12 flex items-center justify-center text-gym-blue font-bold">{s.name[0]}</div>
                <div>
                  <div className="text-sm font-semibold text-gym-text">{s.name}</div>
                  <div className="text-xs text-gym-muted">{s.plan_name || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}