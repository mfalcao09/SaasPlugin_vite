import { useEffect, useState } from "react";
import { Plus, X, Target, TrendingUp, Users, Trophy } from "lucide-react";
import { useAcademy } from "@/lib/AcademyContext";
import { db, type Meta, type Student, type Financial } from "@/lib/db";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

const TIPOS_META = [
  { value: "novos_alunos",     label: "Novos Alunos/Mês",    icon: Users,      color: "text-gym-blue",   bg: "bg-gym-blue/12" },
  { value: "receita_mensal",   label: "Receita Mensal",       icon: TrendingUp, color: "text-gym-green",  bg: "bg-gym-green/12" },
  { value: "retencao",         label: "Taxa de Retenção (%)", icon: Trophy,     color: "text-gym-purple", bg: "bg-gym-purple/12" },
  { value: "checkins_mensais", label: "Check-ins Mensais",    icon: Target,     color: "text-gym-orange", bg: "bg-gym-orange/12" },
];

const thisMonth = new Date().toISOString().slice(0, 7);

const emptyForm = {
  tipo: "novos_alunos",
  valor_meta: "",
  periodo: thisMonth,
  data_inicio: `${thisMonth}-01`,
  data_fim: `${thisMonth}-28`,
};

export default function Metas() {
  const { academy } = useAcademy();
  const aid = academy?.id ?? "";

  const [metas, setMetas] = useState<Meta[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [financial, setFinancial] = useState<Financial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meta | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const [mRes, sRes, fRes] = await Promise.all([
      db.metas.list(aid),
      db.students.list(aid),
      db.financial.list(aid),
    ]);
    setMetas((mRes.data as Meta[]) ?? []);
    setStudents((sRes.data as Student[]) ?? []);
    setFinancial((fRes.data as Financial[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  function calcReal(tipo: string, periodo: string): number {
    switch (tipo) {
      case "novos_alunos":
        return students.filter((s) => s.data_inicio?.startsWith(periodo)).length;

      case "receita_mensal":
        return financial
          .filter((f) => f.tipo === "receita" && f.status_pagamento === "pago" && f.data?.startsWith(periodo))
          .reduce((acc, f) => acc + (f.valor || 0), 0);

      case "retencao": {
        const total = students.length;
        const ativos = students.filter((s) => s.status === "ativo").length;
        return total > 0 ? Math.round((ativos / total) * 100) : 0;
      }

      case "checkins_mensais":
        // Aproximação via alunos ativos (checkins requerem join separado)
        return students.filter((s) => s.status === "ativo").length;

      default:
        return 0;
    }
  }

  // Leaderboard: alunos ativos por plano como proxy de "modalidade/instrutor"
  const planCount: Record<string, number> = {};
  students.filter((s) => s.status === "ativo").forEach((s) => {
    const key = s.plano_nome || "Sem plano";
    planCount[key] = (planCount[key] || 0) + 1;
  });
  const leaderboard = Object.entries(planCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(m: Meta) {
    setEditing(m);
    setForm({
      tipo: m.tipo,
      valor_meta: String(m.valor_meta),
      periodo: m.periodo,
      data_inicio: m.data_inicio,
      data_fim: m.data_fim,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const data = { ...form, valor_meta: parseFloat(form.valor_meta) || 0, academia_id: aid };
    if (editing) {
      await db.metas.update(editing.id, data);
    } else {
      await db.metas.create(data as Omit<Meta, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover meta?")) return;
    await db.metas.delete(id);
    load();
  }

  function pct(real: number, meta: number) {
    return meta > 0 ? Math.min(Math.round((real / meta) * 100), 100) : 0;
  }

  function barColor(p: number) {
    if (p >= 100) return "bg-gym-green";
    if (p >= 60) return "bg-gym-orange";
    return "bg-gym-red";
  }

  function fmtValue(tipo: string, v: number) {
    if (tipo === "receita_mensal") return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    if (tipo === "retencao") return `${v}%`;
    return String(v);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Nova Meta
        </button>
      </div>

      {/* Cards de metas com progress bar */}
      {metas.length === 0 ? (
        <div className="bg-white border border-gym-border rounded-xl p-10 text-center text-gym-subtle shadow-sm">
          Nenhuma meta cadastrada. Clique em "Nova Meta" para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metas.map((m) => {
            const info = TIPOS_META.find((t) => t.value === m.tipo);
            const Icon = info?.icon ?? Target;
            const real = calcReal(m.tipo, m.periodo);
            const p = pct(real, m.valor_meta);
            return (
              <div key={m.id} className="bg-white border border-gym-border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 ${info?.bg ?? "bg-gym-orange/12"} rounded-lg flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${info?.color ?? "text-gym-orange"}`} />
                    </div>
                    <div>
                      <div className="font-semibold text-gym-text text-sm">{info?.label ?? m.tipo}</div>
                      <div className="text-xs text-gym-subtle">
                        {m.periodo} • {new Date(m.data_inicio + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – {new Date(m.data_fim + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(m)} className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all">
                      <Target className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="text-gym-red/60 hover:text-gym-red border border-gym-red/20 p-1.5 rounded transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className="text-2xl font-bold text-gym-text text-tabular">{fmtValue(m.tipo, real)}</div>
                    <div className="text-xs text-gym-muted">de {fmtValue(m.tipo, m.valor_meta)} meta</div>
                  </div>
                  <div className={`text-lg font-bold text-tabular ${p >= 100 ? "text-gym-green" : p >= 60 ? "text-gym-orange" : "text-gym-red"}`}>
                    {p}%
                  </div>
                </div>

                <div className="w-full bg-gym-border/30 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${barColor(p)}`}
                    style={{ width: `${p}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard por plano */}
      {leaderboard.length > 0 && (
        <div className="bg-white border border-gym-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gym-border/30 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gym-orange" />
            <h3 className="font-semibold text-gym-text">Alunos Ativos por Plano</h3>
          </div>
          <div className="divide-y divide-gym-border/30">
            {leaderboard.map(([nome, qtd], idx) => {
              const maxQtd = leaderboard[0][1];
              const p = maxQtd > 0 ? Math.round((qtd / maxQtd) * 100) : 0;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={nome} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-7 text-center text-sm">
                    {idx < 3 ? medals[idx] : <span className="font-bold text-gym-subtle">#{idx + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gym-text">{nome}</span>
                      <span className="text-sm font-bold text-gym-text text-tabular">{qtd} aluno{qtd !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="w-full bg-gym-border/20 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gym-orange transition-all duration-500" style={{ width: `${p}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border">
              <h2 className="font-semibold text-gym-text">{editing ? "Editar Meta" : "Nova Meta"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gym-subtle hover:text-gym-text" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Tipo de Meta *</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputCls}>
                  {TIPOS_META.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Valor da Meta *</label>
                <input
                  required
                  type="number"
                  step={form.tipo === "receita_mensal" ? "0.01" : "1"}
                  min="0"
                  value={form.valor_meta}
                  onChange={(e) => setForm({ ...form, valor_meta: e.target.value })}
                  className={inputCls}
                  placeholder={form.tipo === "receita_mensal" ? "15000.00" : form.tipo === "retencao" ? "85" : "20"}
                />
              </div>
              <div>
                <label className={labelCls}>Período</label>
                <input
                  type="month"
                  value={form.periodo}
                  onChange={(e) => {
                    const p = e.target.value;
                    setForm({ ...form, periodo: p, data_inicio: `${p}-01`, data_fim: `${p}-28` });
                  }}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data Início</label>
                  <input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Data Fim</label>
                  <input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all">{editing ? "Salvar" : "Criar Meta"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
