import { useState } from "react";
import { Search } from "lucide-react";
import { demoCheckins } from "@/lib/demoData";

export default function DemoCheckins() {
  const [search, setSearch] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = demoCheckins.filter(c =>
    (c.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.date || "").includes(search)
  );

  const todayCount = demoCheckins.filter(c => c.date === today).length || 8;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por aluno ou data..."
            className="w-full bg-[#18181B] border border-gym-border text-white rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#18181B] border border-gym-border rounded-xl p-5">
          <div className="text-3xl font-bold text-gym-green text-tabular">{todayCount}</div>
          <div className="text-sm text-gym-muted mt-1">Check-ins hoje</div>
        </div>
        <div className="bg-[#18181B] border border-gym-border rounded-xl p-5">
          <div className="text-3xl font-bold text-gym-orange text-tabular">{demoCheckins.length}</div>
          <div className="text-sm text-gym-muted mt-1">Total registrados</div>
        </div>
      </div>

      <div className="bg-[#18181B] border border-gym-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-[#111114]">
                <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-left px-4 py-3 font-semibold">Horário</th>
                <th className="text-left px-4 py-3 font-semibold">Modalidade</th>
                <th className="text-left px-4 py-3 font-semibold">Professor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i} className="border-b border-gym-border/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gym-green/15 flex items-center justify-center text-gym-green text-xs font-bold">{(c.student_name || "?")[0]}</div>
                      <span className="font-medium text-white">{c.student_name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{c.date ? new Date(c.date).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 text-gym-muted text-tabular">{c.time || "—"}</td>
                  <td className="px-4 py-3 text-gym-muted">{c.modality || "—"}</td>
                  <td className="px-4 py-3 text-gym-muted">{c.professor || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}