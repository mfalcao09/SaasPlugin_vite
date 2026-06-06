import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Plus, X, TrendingUp, Building2, AlertCircle,
  Loader2, RefreshCw, Search, ExternalLink, Lock, Unlock, Edit2,
  CheckCircle2, Clock, Settings
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useSuperAdmin } from "@/lib/useSuperAdmin";

const labelClass = "text-xs text-gym-muted uppercase tracking-wide mb-1 block font-semibold";
const inputClass = "w-full bg-white border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle";

const EMPTY_FORM = {
  name: "", slug: "", owner_email: "", plan_name: "Starter", phone: "", whatsapp: ""
};

function slugify(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function StatusBadge({ status }) {
  const map = {
    active:   "bg-gym-green/12 text-gym-green border border-gym-green/30",
    inactive: "bg-gym-yellow/12 text-gym-yellow border border-gym-yellow/30",
    blocked:  "bg-gym-red/12 text-gym-red border border-gym-red/30",
    ativo:    "bg-gym-green/12 text-gym-green border border-gym-green/30",
    bloqueado:"bg-gym-red/12 text-gym-red border border-gym-red/30",
  };
  const labels = { active: "Ativo", inactive: "Inativo", blocked: "Bloqueado", ativo: "Ativo", bloqueado: "Bloqueado" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${map[status] || map.inactive}`}>
      {labels[status] || status}
    </span>
  );
}

function PlanBadge({ plan }) {
  const isPro = (plan || "").toLowerCase() === "pro";
  return (
    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${isPro ? "bg-gym-purple/12 text-gym-purple" : "bg-gym-blue/12 text-gym-blue"}`}>
      {plan || "Starter"}
    </span>
  );
}

export default function MasterPanel() {
  console.log('[MasterPanel] mounted');
  const navigate = useNavigate();
  const { user, isSuperAdmin, loading: authLoading, error: authError } = useSuperAdmin();

  const [academies, setAcademies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadAcademies() {
    setLoading(true);
    const data = await base44.entities.Academy.list("-created_date", 500);
    setAcademies(data);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      console.log("[MasterPanel] Super admin confirmado — carregando academias");
      loadAcademies();
    }
  }, [authLoading, isSuperAdmin]);

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (authLoading) {
    console.log("[MasterPanel] Verificando permissões...");
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-gym-orange rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <Loader2 className="w-6 h-6 text-gym-orange animate-spin" />
          <p className="text-gym-muted text-sm">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // ─── AUTH ERROR / NOT LOGGED ────────────────────────────────────────────────
  if (authError || !user) {
    console.log("[MasterPanel] Não autenticado ou erro de auth — redirecionando para login");
    base44.auth.redirectToLogin(window.location.href);
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-gym-orange animate-spin" />
          <p className="text-gym-muted text-sm">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  // ─── NOT SUPER ADMIN ────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    console.log("[MasterPanel] Usuário NÃO é super admin:", user.email, "— mostrando tela de sem permissão");
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="text-center p-6 max-w-sm">
          <div className="w-14 h-14 bg-gym-red/12 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-gym-red" />
          </div>
          <h2 className="text-xl font-bold text-gym-text mb-2">Acesso restrito</h2>
          <p className="text-gym-muted text-sm mb-2">
            Você não tem permissão para acessar o Painel Master.
          </p>
          <p className="text-gym-subtle text-xs mb-6">
            Logado como: <span className="text-gym-text font-mono">{user.email}</span>
          </p>
          <button onClick={() => navigate("/app/dashboard")}
            className="bg-gym-orange text-white font-semibold px-6 py-3 rounded-xl hover:bg-gym-orange-light transition-all w-full">
            Ir para meu painel
          </button>
        </div>
      </div>
    );
  }

  // ─── SUPER ADMIN — CONTEÚDO REAL ───────────────────────────────────────────
  console.log("[MasterPanel] Renderizando painel master para:", user.email);

  const filtered = academies.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || (a.name || "").toLowerCase().includes(q) || (a.slug || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || a.status === statusFilter ||
      (statusFilter === "active" && a.status === "ativo") ||
      (statusFilter === "blocked" && a.status === "bloqueado");
    return matchSearch && matchStatus;
  });

  const total = academies.length;
  const active = academies.filter(a => a.status === "active" || a.status === "ativo").length;
  const onboarding = academies.filter(a => !a.onboarding_completed && !a.onboarding_complete).length;
  const blocked = academies.filter(a => a.status === "blocked" || a.status === "bloqueado").length;

  const kpis = [
    { icon: Building2, label: "Total de Academias", value: total,      color: "text-gym-purple", bg: "bg-gym-purple/12" },
    { icon: TrendingUp, label: "Ativas",             value: active,     color: "text-gym-green",  bg: "bg-gym-green/12"  },
    { icon: Clock,      label: "Em Onboarding",      value: onboarding, color: "text-gym-yellow", bg: "bg-gym-yellow/12" },
    { icon: AlertCircle,label: "Bloqueadas",          value: blocked,    color: "text-gym-red",    bg: "bg-gym-red/12"    },
  ];

  async function toggleStatus(a) {
    const isActive = a.status === "active" || a.status === "ativo";
    const newStatus = isActive ? "blocked" : "active";
    await base44.entities.Academy.update(a.id, { status: newStatus });
    setAcademies(prev => prev.map(x => x.id === a.id ? { ...x, status: newStatus } : x));
  }

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(a) {
    setEditTarget(a);
    setForm({
      name: a.name || "",
      slug: a.slug || "",
      owner_email: a.owner_email || a.admin_user_email || "",
      plan_name: a.plan_name || "Starter",
      phone: a.phone || "",
      whatsapp: a.whatsapp || "",
    });
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      owner_email: form.owner_email,
      admin_user_email: form.owner_email,
      plan_name: form.plan_name,
      phone: form.phone,
      whatsapp: form.whatsapp,
    };
    if (editTarget) {
      await base44.entities.Academy.update(editTarget.id, payload);
    } else {
      await base44.entities.Academy.create({
        ...payload,
        status: "active",
        onboarding_step: 1,
        onboarding_completed: false,
        onboarding_complete: false,
      });
      try { await base44.users.inviteUser(form.owner_email, "user"); } catch {}
    }
    await loadAcademies();
    setSaving(false);
    setShowModal(false);
  }

  return (
    <div className="min-h-screen bg-gym-surface p-6 font-inter">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gym-purple/12 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-gym-purple" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gym-text">Painel Master — GymBoss AI</h1>
              <p className="text-xs text-gym-muted">Gerenciamento SaaS Multi-academia • {user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin-config")} title="Configurações de Super Admin"
              className="p-2.5 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text hover:border-gym-border bg-white transition-all shadow-sm">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={loadAcademies}
              className="p-2.5 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text hover:border-gym-border bg-white transition-all shadow-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-gym-purple hover:bg-gym-purple/80 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm">
              <Plus className="w-4 h-4" /> Nova Academia
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white border border-gym-border/30 rounded-xl p-5 shadow-sm">
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className={`text-2xl font-bold text-tabular ${color}`}>{value}</div>
              <div className="text-sm text-gym-muted mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou slug..."
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gym-border/50 rounded-lg text-sm text-gym-text focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle"
            />
          </div>
          <div className="flex gap-1.5">
            {[
              { value: "all",     label: "Todas"     },
              { value: "active",  label: "Ativas"    },
              { value: "inactive",label: "Inativas"  },
              { value: "blocked", label: "Bloqueadas"},
            ].map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${statusFilter === f.value
                  ? "bg-gym-purple text-white border-gym-purple"
                  : "bg-white text-gym-muted border-gym-border/50 hover:border-gym-border"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gym-border/30 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gym-border/30 flex items-center justify-between">
            <h3 className="font-semibold text-gym-text">
              Academias Cadastradas
              <span className="ml-2 text-xs text-gym-subtle font-normal">({filtered.length})</span>
            </h3>
            {loading && <Loader2 className="w-4 h-4 text-gym-subtle animate-spin" />}
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-10 text-center text-gym-subtle text-sm">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-gym-subtle text-sm">Nenhuma academia encontrada.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gym-subtle border-b border-gym-border/30 bg-gym-surface">
                    <th className="text-left px-5 py-3 font-semibold">Academia</th>
                    <th className="text-left px-5 py-3 font-semibold">Slug</th>
                    <th className="text-left px-5 py-3 font-semibold">Plano</th>
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold">Onboarding</th>
                    <th className="text-left px-5 py-3 font-semibold">Criada em</th>
                    <th className="text-right px-5 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gym-border/20">
                  {filtered.map((a) => {
                    const isActive = a.status === "active" || a.status === "ativo";
                    const isOnboardingDone = a.onboarding_completed || a.onboarding_complete;
                    return (
                      <tr key={a.id} className="hover:bg-gym-surface/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gym-purple/12 flex items-center justify-center text-gym-purple text-xs font-bold flex-shrink-0">
                              {(a.name || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-gym-text">{a.name}</div>
                              <div className="text-[11px] text-gym-subtle">{a.owner_email || a.admin_user_email || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <code className="text-xs bg-gym-surface px-2 py-1 rounded text-gym-muted font-mono">
                            {a.slug || "—"}
                          </code>
                        </td>
                        <td className="px-5 py-3.5"><PlanBadge plan={a.plan_name} /></td>
                        <td className="px-5 py-3.5"><StatusBadge status={a.status || "active"} /></td>
                        <td className="px-5 py-3.5">
                          {isOnboardingDone ? (
                            <span className="flex items-center gap-1 text-xs text-gym-green font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Completo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gym-yellow font-semibold">
                              <Clock className="w-3.5 h-3.5" /> Passo {a.onboarding_step || 1}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-gym-muted text-tabular text-xs">
                          {a.created_date ? new Date(a.created_date).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            {a.slug && (
                              <a href={`/app/dashboard?slug=${a.slug}`}
                                title="Ver painel da academia"
                                className="flex items-center gap-1 text-xs text-gym-blue border border-gym-blue/30 px-2 py-1 rounded-lg hover:bg-gym-blue/8 transition-all">
                                <ExternalLink className="w-3 h-3" /> Ver painel
                              </a>
                            )}
                            <button onClick={() => openEdit(a)} title="Editar"
                              className="p-1.5 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text hover:border-gym-border bg-white transition-all">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleStatus(a)} title={isActive ? "Bloquear" : "Desbloquear"}
                              className={`p-1.5 rounded-lg border transition-all ${isActive
                                ? "text-gym-red border-gym-red/30 hover:bg-gym-red/8"
                                : "text-gym-green border-gym-green/30 hover:bg-gym-green/8"}`}>
                              {isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal Nova/Editar Academia */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gym-border/30 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gym-text">{editTarget ? "Editar Academia" : "Nova Academia"}</h2>
                <p className="text-xs text-gym-muted mt-0.5">{editTarget ? "Atualize os dados do tenant" : "Cadastrar novo tenant"}</p>
              </div>
              <button onClick={() => setShowModal(false)}
                className="text-gym-subtle hover:text-gym-text p-1.5 rounded-lg hover:bg-gym-surface transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className={labelClass}>Nome da Academia *</label>
                <input required value={form.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({ ...f, name, slug: f.slug || slugify(name) }));
                  }}
                  className={inputClass} placeholder="FitZone Performance" />
              </div>
              <div>
                <label className={labelClass}>Slug (URL do painel) *</label>
                <div className="flex items-center gap-0">
                  <span className="text-xs text-gym-subtle border border-r-0 border-gym-border/50 rounded-l-lg px-3 py-2.5 bg-gym-surface">/app/</span>
                  <input required value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                    className="flex-1 bg-white border border-gym-border/50 text-gym-text rounded-r-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle"
                    placeholder="fitzone" />
                </div>
              </div>
              <div>
                <label className={labelClass}>E-mail do Admin da Academia *</label>
                <input required type="email" value={form.owner_email}
                  onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))}
                  className={inputClass} placeholder="admin@academia.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Plano</label>
                  <select value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))}
                    className={inputClass}>
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Telefone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={inputClass} placeholder="(11) 99999-0000" />
                </div>
              </div>
              <div>
                <label className={labelClass}>WhatsApp</label>
                <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  className={inputClass} placeholder="(11) 99999-0000" />
              </div>

              {!editTarget && (
                <div className="bg-gym-blue/8 border border-gym-blue/20 rounded-lg p-3 text-xs text-gym-blue">
                  Um convite de acesso será enviado automaticamente para o e-mail do admin.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text text-sm font-semibold transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-gym-purple hover:bg-gym-purple/80 text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : (editTarget ? "Salvar Alterações" : "Criar Academia")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}