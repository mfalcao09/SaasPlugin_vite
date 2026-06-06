import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Users, Plus, Search, Filter } from "lucide-react";
import { demoStudents } from "@/lib/demoData";
import { useRealData } from "@/lib/useRealData";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/ui/StatusBadge";
import AlunoForm from "@/components/alunos/AlunoForm";
import AlunoModal from "@/components/alunos/AlunoModal";

export default function Alunos() {
  const { demo } = useOutletContext() || {};
  const { academy } = useAcademy();
  const academyId = demo ? null : academy?.id;

  const { data: realStudents, reload } = useRealData("Student", academyId);
  const students = demo ? demoStudents : realStudents;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "todos" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleSave(form) {
    if (demo) { setShowForm(false); setEditing(null); return; }
    if (editing) {
      await base44.entities.Student.update(editing.id, form);
    } else {
      await base44.entities.Student.create({ ...form, academy_id: academyId, checkin_count_month: 0 });
    }
    reload();
    setShowForm(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    if (demo || !window.confirm("Remover aluno?")) return;
    await base44.entities.Student.delete(id);
    reload();
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar aluno..." className="w-full bg-[#18181B] border border-gym-border text-white rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#18181B] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors">
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="bloqueado">Bloqueados</option>
        </select>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Novo Aluno
        </button>
      </div>

      {/* Count */}
      <div className="text-sm text-gym-subtle">{filtered.length} aluno{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</div>

      {/* Table */}
      <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border bg-gym-surface">
                <th className="text-left px-4 py-3 font-semibold">Aluno</th>
                <th className="text-left px-4 py-3 font-semibold">Plano</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Vencimento</th>
                <th className="text-left px-4 py-3 font-semibold">Check-ins/mês</th>
                <th className="text-left px-4 py-3 font-semibold">Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gym-subtle">Nenhum aluno encontrado</td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} className={`border-b border-gym-border/30 hover:bg-white/[0.02] ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gym-orange/12 flex items-center justify-center text-gym-orange font-bold text-xs">{s.name[0]}</div>
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
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setViewing(s)} className="text-xs text-gym-muted hover:text-white border border-gym-border/50 px-2 py-1 rounded transition-all">Ver</button>
                      <button onClick={() => { setEditing(s); setShowForm(true); }} className="text-xs text-gym-muted hover:text-white border border-gym-border/50 px-2 py-1 rounded transition-all">Editar</button>
                      {!demo && <button onClick={() => handleDelete(s.id)} className="text-xs text-gym-red/70 hover:text-gym-red border border-gym-red/20 px-2 py-1 rounded transition-all">Remover</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <AlunoForm
          student={editing}
          academyId={academyId}
          demo={demo}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {viewing && (
        <AlunoModal
          student={viewing}
          demo={demo}
          academyId={academyId}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}