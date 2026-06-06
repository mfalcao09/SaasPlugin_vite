import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, UserPlus, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, type Lead } from "@/lib/db";

const inputCls =
  "w-full bg-[#111114] border border-gym-border text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";
const labelCls = "text-xs text-gym-subtle uppercase tracking-wide mb-1 block";

type Etapa = "experimental" | "interesse_plano" | "avaliacao_marcada" | "matriculado";

const ETAPAS: { key: Etapa; label: string; color: string; bg: string }[] = [
  { key: "experimental",      label: "Experimental",       color: "text-gym-blue",   bg: "bg-gym-blue/10 border-gym-blue/30" },
  { key: "interesse_plano",   label: "Interesse em Plano", color: "text-gym-yellow", bg: "bg-gym-yellow/10 border-gym-yellow/30" },
  { key: "avaliacao_marcada", label: "Avaliação Marcada",  color: "text-gym-orange", bg: "bg-gym-orange/10 border-gym-orange/30" },
  { key: "matriculado",       label: "Matriculado",        color: "text-gym-green",  bg: "bg-gym-green/10 border-gym-green/30" },
];

const ORIGENS = ["Instagram", "Indicação", "Google", "Facebook", "Caminhada/Passagem", "WhatsApp", "Outros"];

const emptyForm = {
  nome: "",
  telefone: "",
  email: "",
  origem: "Instagram",
  status: "experimental" as Etapa,
  interesse: "",
  observacoes: "",
};

export default function Leads() {
  const { academiaId } = useAuth();
  if (!academiaId) return null;
  const aid = academiaId;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!aid) return;
    setLoading(true);
    const res = await db.leads.list(aid);
    setLeads((res.data as Lead[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aid]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(l: Lead) {
    setEditing(l);
    setForm({
      nome: l.nome,
      telefone: l.telefone || "",
      email: l.email || "",
      origem: l.origem || "Instagram",
      status: (l.status as Etapa) || "experimental",
      interesse: l.interesse || "",
      observacoes: l.observacoes || "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    const data = { ...form, academia_id: aid };
    if (editing) {
      await db.leads.update(editing.id, data);
    } else {
      await db.leads.create(data as Omit<Lead, "id" | "created_at">);
    }
    load();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover lead?")) return;
    await db.leads.delete(id);
    load();
  }

  async function avancarEtapa(lead: Lead) {
    const idx = ETAPAS.findIndex((e) => e.key === lead.status);
    if (idx < 0 || idx >= ETAPAS.length - 1) return;
    await db.leads.update(lead.id, { status: ETAPAS[idx + 1].key });
    load();
  }

  const byEtapa = (key: Etapa) => leads.filter((l) => l.status === key);

  const conversionRate =
    leads.length > 0
      ? Math.round((byEtapa("matriculado").length / leads.length) * 100)
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com KPIs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white border border-gym-border rounded-xl px-4 py-2.5 shadow-sm text-center">
            <div className="text-2xl font-bold text-gym-orange text-tabular">{leads.length}</div>
            <div className="text-xs text-gym-muted">Total de Leads</div>
          </div>
          <div className="bg-white border border-gym-border rounded-xl px-4 py-2.5 shadow-sm text-center">
            <div className="text-2xl font-bold text-gym-green text-tabular">{conversionRate}%</div>
            <div className="text-xs text-gym-muted">Taxa de Conversão</div>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      {/* Pipeline kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ETAPAS.map((etapa, idx) => {
          const items = byEtapa(etapa.key);
          return (
            <div key={etapa.key} className="flex flex-col gap-3">
              {/* Header da coluna */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${etapa.bg}`}>
                <span className={`text-xs font-semibold ${etapa.color}`}>{etapa.label}</span>
                <span className={`text-xs font-bold ${etapa.color}`}>{items.length}</span>
              </div>

              {/* Cards */}
              {items.length === 0 ? (
                <div className="border border-dashed border-gym-border/40 rounded-xl p-4 text-center text-gym-subtle text-xs">
                  Nenhum lead
                </div>
              ) : (
                items.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white border border-gym-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-gym-orange/12 flex items-center justify-center text-gym-orange text-xs font-bold flex-shrink-0">
                        {lead.nome[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gym-text leading-tight truncate">{lead.nome}</div>
                        {lead.telefone && <div className="text-[10px] text-gym-subtle">{lead.telefone}</div>}
                      </div>
                    </div>

                    {lead.interesse && (
                      <div className="text-[11px] text-gym-muted mb-1 truncate">
                        {lead.interesse}
                      </div>
                    )}
                    {lead.origem && (
                      <div className="text-[10px] text-gym-subtle mb-3">via {lead.origem}</div>
                    )}

                    <div className="flex gap-1.5 items-center">
                      {idx < ETAPAS.length - 1 && (
                        <button
                          onClick={() => avancarEtapa(lead)}
                          title={`Mover para ${ETAPAS[idx + 1].label}`}
                          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all ${etapa.bg} ${etapa.color}`}
                        >
                          <ArrowRight className="w-2.5 h-2.5" />
                          {ETAPAS[idx + 1].label.split(" ")[0]}
                        </button>
                      )}
                      <div className="flex gap-1 ml-auto">
                        <button
                          onClick={() => openEdit(lead)}
                          className="text-gym-muted hover:text-gym-text border border-gym-border/50 p-1.5 rounded transition-all"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="text-gym-red/60 hover:text-gym-red border border-gym-red/20 p-1.5 rounded transition-all"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gym-border sticky top-0 bg-[#18181B]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-gym-orange" />
                <h2 className="font-semibold text-gym-text">{editing ? "Editar Lead" : "Novo Lead"}</h2>
              </div>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-gym-subtle hover:text-gym-text" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Nome *</label>
                <input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputCls} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inputCls} placeholder="(11) 99999-0000" />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="email@exemplo.com" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Origem</label>
                <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className={inputCls}>
                  {ORIGENS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Etapa do pipeline</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Etapa })} className={inputCls}>
                  {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Interesse (plano/modalidade)</label>
                <input value={form.interesse} onChange={(e) => setForm({ ...form, interesse: e.target.value })} className={inputCls} placeholder="Ex: Mensal Musculação" />
              </div>
              <div>
                <label className={labelCls}>Observações</label>
                <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className={inputCls + " resize-none"} rows={2} placeholder="Notas sobre o lead..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gym-border text-gym-muted hover:text-gym-text py-2.5 rounded-lg text-sm transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-gym-orange hover:bg-gym-orange-light text-white py-2.5 rounded-lg text-sm font-semibold transition-all">{editing ? "Salvar" : "Adicionar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
