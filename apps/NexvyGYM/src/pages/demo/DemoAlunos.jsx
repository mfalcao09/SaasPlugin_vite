import { useState } from "react";
import { Search } from "lucide-react";
import { demoStudents } from "@/lib/demoData";
import StatusBadge from "@/components/ui/StatusBadge";

export default function DemoAlunos() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const filtered = demoStudents.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "todos" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar aluno..."
            className="w-full bg-[#18181B] border border-gym-border text-white rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#18181B] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none">
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="bloqueado">Bloqueados</option>
        </select>
      </div>

      <div className="text-sm text-gym-subtle">{filtered.length} aluno{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</div>

      <div className="bg-[#18181B] border border-gym-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-[#111114]">
                <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                <th className="text-left px-4 py-3 font-semibold">Plano</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Vencimento</th>
                <th className="text-left px-4 py-3 font-semibold">Check-ins/mês</th>
                <th className="text-left px-4 py-3 font-semibold">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} className={`border-b border-gym-border/30 hover:bg-white/[0.02] ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gym-orange/15 flex items-center justify-center text-gym-orange font-bold text-xs">{s.name[0]}</div>
                      <div>
                        <div className="font-medium text-white">{s.name}</div>
                        <div className="text-xs text-gym-subtle">{s.phone || s.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gym-muted">{s.plan_name || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{s.expiry_date ? new Date(s.expiry_date).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 text-white font-semibold text-tabular">{s.checkin_count_month ?? 0}x</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(s.tags || []).map(t => <StatusBadge key={t} status={t} />)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}