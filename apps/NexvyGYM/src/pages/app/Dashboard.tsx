import { useEffect, useState } from "react";
import { Users, TrendingUp, AlertCircle, DollarSign, CheckSquare, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Student, type Checkin, type Financial } from "@/lib/db";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";

export default function Dashboard() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [students, setStudents] = useState<Student[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [financial, setFinancial] = useState<Financial[]>([]);
  const [expiringStudents, setExpiringStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const limitDate7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    if (!aid) return;
    setLoading(true);
    Promise.all([
      db.students.list(aid),
      db.checkins.list(aid),
      db.financial.list(aid),
      db.students.getExpiring(aid, limitDate7d),
    ]).then(([sRes, cRes, fRes, expRes]) => {
      setStudents((sRes.data as Student[]) ?? []);
      setCheckins((cRes.data as Checkin[]) ?? []);
      setFinancial((fRes.data as Financial[]) ?? []);
      setExpiringStudents((expRes.data as Student[]) ?? []);
      setLoading(false);
    });
  }, [aid]);

  const activeStudents = students.filter((s) => s.status === "ativo").length;
  const inactiveStudents = students.filter((s) => s.status === "inativo").length;
  const checkinsToday = checkins.filter((c) => c.date === today).length;
  const revenueMonth = financial
    .filter((f) => f.tipo === "receita" && f.status_pagamento === "pago" && f.data?.startsWith(monthPrefix))
    .reduce((acc, f) => acc + (f.valor || 0), 0);
  const receivable = financial
    .filter((f) => f.tipo === "receita" && f.status_pagamento === "pendente")
    .reduce((acc, f) => acc + (f.valor || 0), 0);

  const recentCheckins = checkins.slice(0, 6);

  if (loading && aid) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Alunos Ativos" value={activeStudents} color="orange" />
        <StatCard icon={UserPlus} label="Inativos" value={inactiveStudents} color="red" />
        <StatCard icon={CheckSquare} label="Check-ins Hoje" value={checkinsToday} color="green" />
        <StatCard icon={AlertCircle} label="Vencendo em 7d" value={expiringStudents.length} color="yellow" />
        <StatCard
          icon={DollarSign}
          label="A Receber"
          value={`R$ ${receivable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          color="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Receita do Mês"
          value={`R$ ${revenueMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Check-ins recentes */}
        <div className="lg:col-span-2 bg-white border border-gym-border rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-gym-text">Check-ins Recentes</h3>
          </div>
          <div className="divide-y divide-gym-border/30">
            {recentCheckins.length === 0 ? (
              <div className="p-6 text-center text-gym-subtle text-sm">Nenhum check-in registrado</div>
            ) : (
              recentCheckins.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gym-surface/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gym-green/12 flex items-center justify-center text-gym-green text-xs font-bold">
                      {(c.student_nome || "?")[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gym-text">{c.student_nome || "—"}</div>
                      <div className="text-xs text-gym-muted">
                        {c.modality || "—"} • Prof. {c.professor || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gym-muted">{c.time || "—"}</div>
                    <div className="text-xs text-gym-subtle">
                      {c.date ? new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alunos vencendo */}
        <div className="bg-white border border-gym-border rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-gym-yellow" />
            <h3 className="font-semibold text-gym-text">Planos Vencendo (7d)</h3>
          </div>
          <div className="divide-y divide-gym-border/30">
            {expiringStudents.length === 0 ? (
              <div className="p-6 text-center text-gym-subtle text-sm">
                Nenhum plano vencendo nos próximos 7 dias
              </div>
            ) : (
              expiringStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gym-surface/50">
                  <div>
                    <div className="text-sm font-semibold text-gym-text">{s.nome}</div>
                    <div className="text-xs text-gym-muted">{s.plano_nome || "—"}</div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status="plano vencendo" />
                    <div className="text-xs text-gym-subtle mt-1">
                      {s.data_vencimento
                        ? new Date(s.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
