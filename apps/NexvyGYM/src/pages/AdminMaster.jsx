import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Plus, X, Loader2, RefreshCw, Search, Lock, Unlock, Edit2,
  Building2, TrendingUp, AlertCircle, Clock, Copy, CheckCircle2
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hashPassword, generatePassword } from "@/lib/tenantAuth";

function slugify(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  name: "", nome_fantasia: "", cnpj: "", owner_nome: "", owner_cpf: "",
  owner_email: "", owner_telefone: "", plan_name: "Starter", ciclo: "mensal",
  valor: "", trial_ate: "",
};

export default function AdminMaster() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState("loading"); // loading | ok | forbidden
  const [currentUser, setCurrentUser] = useState(null);

  const [academies, setAcademies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [trialDays, setTrialDays] = useState(14);
  const [saving, setSaving] = useState(false);

  const [provsModal, setProvsModal] = useState(null); // { email, senha }

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        const me = await base44.auth.me();
        setCurrentUser(me);
        if (me.role === "admin") { setAuthStatus("ok"); return; }
        const configs = await base44.entities.AppConfig.list();
        const extras = (configs[0]?.super_admin_emails || []).map(e => e.toLowerCase());
        if (extras.includes(me.email.toLowerCase())) { setAuthStatus("ok"); }
        else { setAuthStatus("forbidden"); }
      } catch {
        base44.auth.redirectToLogin(window.location.href);
      }
    }
    check();
  }, []);

  useEffect(() => {
    async function loadConfig() {
      const configs = await base44.entities.AppConfig.list();
      if (configs[0]?.default_trial_days) setTrialDays(configs[0].default_trial_days);
    }
    loadConfig();
  }, []);

  async function loadAcademies() {
    setLoading(true);
    const data = await base44.entities.Academy.list("-created_date", 500);
    setAcademies(data);
    setLoading(false);
  }

  useEffect(() => {
    if (authStatus === "ok") loadAcademies();
  }, [authStatus]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = academies.filter(a => {
    const q = search.toLowerCase();
    const matchS = !q || (a.name || "").toLowerCase().includes(q) || (a.slug || "").toLowerCase().includes(q) || (a.owner_email || "").toLowerCase().includes(q);
    const sc = a.status_cobranca || a.subscription_status || "trial";
    const matchF = statusFilter === "all" || sc === statusFilter || a.status === statusFilter;
    return matchS && matchF;
  });

  const total = academies.length;
  const ativas = academies.filter(a => (a.status_cobranca || a.subscription_status) === "ativo" || a.status === "active").length;
  const trial = academies.filter(a => (a.status_cobranca || a.subscription_status) === "trial").length;
  const bloqueadas = academies.filter(a => a.status === "blocked").length;

  const kpis = [
    { icon: Building2, label: "Total", value: total, color: "text-gym-purple", bg: "bg-gym-purple/12" },
    { icon: TrendingUp, label: "Ativas", value: ativas, color: "text-gym-green", bg: "bg-gym-green/12" },
    { icon: Clock, label: "Em Trial", value: trial, color: "text-gym-yellow", bg: "bg-gym-yellow/12" },
    { icon: AlertCircle, label: "Bloqueadas", value: bloqueadas, color: "text-gym-red", bg: "bg-gym-red/12" },
  ];

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function toggleStatus(a) {
    const newStatus = a.status === "blocked" ? "active" : "blocked";
    await base44.entities.Academy.update(a.id, { status: newStatus });
    setAcademies(prev => prev.map(x => x.id === a.id ? { ...x, status: newStatus } : x));
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, trial_ate: addDays(trialDays) });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditTarget(a);
    setForm({
      name: a.name || "",
      nome_fantasia: a.nome_fantasia || "",
      cnpj: a.cnpj || "",
      owner_nome: a.owner_nome || "",
      owner_cpf: a.owner_cpf || "",
      owner_email: a.owner_email || a.admin_user_email || "",
      owner_telefone: a.owner_telefone || "",
      plan_name: a.plan_name || "Starter",
      ciclo: a.ciclo || "mensal",
      valor: a.valor || "",
      trial_ate: a.trial_ate || "",
    });
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);

    const slug = slugify(form.name);
    const trialAte = form.trial_ate || addDays(trialDays);

    if (editTarget) {
      await base44.entities.Academy.update(editTarget.id, {
        nome_fantasia: form.nome_fantasia,
        cnpj: form.cnpj,
        owner_nome: form.owner_nome,
        owner_cpf: form.owner_cpf,
        owner_telefone: form.owner_telefone,
        plan_name: form.plan_name,
        ciclo: form.ciclo,
        valor: form.valor ? Number(form.valor) : null,
        trial_ate: trialAte,
      });
      await loadAcademies();
      setSaving(false);
      setShowModal(false);
      return;
    }

    // CRIAR nova academia
    const academy = await base44.entities.Academy.create({
      name: form.name,
      slug,
      nome_fantasia: form.nome_fantasia,
      cnpj: form.cnpj,
      owner_nome: form.owner_nome,
      owner_cpf: form.owner_cpf,
      owner_email: form.owner_email,
      owner_telefone: form.owner_telefone,
      admin_user_email: form.owner_email,
      plan_name: form.plan_name,
      ciclo: form.ciclo,
      valor: form.valor ? Number(form.valor) : null,
      trial_ate: trialAte,
      trial_ends_at: trialAte,
      status: "active",
      status_cobranca: "trial",
      subscription_status: "trial",
      onboarding_step: 1,
      onboarding_completed: false,
      onboarding_complete: false,
    });

    // Criar AcademyUser owner com senha provisória
    const senhaProvisoria = generatePassword(10);
    const hash = await hashPassword(senhaProvisoria);
    await base44.entities.AcademyUser.create({
      academy_id: academy.id,
      user_email: form.owner_email.trim().toLowerCase(),
      full_name: form.owner_nome,
      role: "owner",
      status: "active",
      senha_hash: hash,
      forcar_troca_senha: true,
    });

    await loadAcademies();
    setSaving(false);
    setShowModal(false);
    setProvsModal({ email: form.owner_email, senha: senhaProvisoria, academy_name: form.name });
  }

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-gym-orange rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <Loader2 className="w-5 h-5 text-gym-orange animate-spin" />
          <p className="text-gym-muted text-sm">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (authStatus === "forbidden") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="text-center p-6 max-w-sm">
          <div className="w-14 h-14 bg-gym-red/12 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-gym-red" />
          </div>
          <h2 className="text-xl font-bold text-gym-text mb-2">Acesso restrito</h2>
          <p className="text-gym-muted text-sm mb-4">Você não tem permissão para acessar o Painel Master.</p>
          <button onClick={() => navigate("/app/dashboard")}
            className="bg-gym-orange text-white font-semibold px-6 py-3 rounded-xl hover:bg-gym-orange-light w-full">
            Ir para meu painel
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full bg-white border border-gym-border/50 text-gym-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle";
  const labelCls = "text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1";

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
              <h1 className="text-xl font-bold text-gym-text">Admin Master — GymBoss AI</h1>
              <p className="text-xs text-gym-muted">Gestão SaaS Multi-academia • {currentUser?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAcademies} className="p-2.5 rounded-lg border border-gym-border/50 bg-white text-gym-muted hover:text-gym-text transition-all">
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
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-sm text-gym-muted mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-subtle" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, slug ou e-mail..."
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gym-border/50 rounded-lg text-sm focus:outline-none focus:border-gym-orange transition-colors placeholder:text-gym-subtle" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["all", "trial", "ativo", "blocked"].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${statusFilter === f
                  ? "bg-gym-purple text-white border-gym-purple"
                  : "bg-white text-gym-muted border-gym-border/50 hover:border-gym-border"}`}>
                {f === "all" ? "Todas" : f === "trial" ? "Trial" : f === "ativo" ? "Ativas" : "Bloqueadas"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gym-border/30 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gym-border/30 flex items-center justify-between">
            <h3 className="font-semibold text-gym-text">Academias <span className="text-gym-subtle font-normal text-xs">({filtered.length})</span></h3>
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
                    {["Academia", "Owner", "Plano", "Cobrança", "Trial até", "Último acesso", "Ações"].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gym-border/20">
                  {filtered.map(a => {
                    const sc = a.status_cobranca || a.subscription_status || "trial";
                    const scColors = {
                      trial: "bg-gym-yellow/12 text-gym-yellow",
                      ativo: "bg-gym-green/12 text-gym-green",
                      inadimplente: "bg-gym-red/12 text-gym-red",
                      suspenso: "bg-gym-red/12 text-gym-red",
                      cancelado: "bg-gym-border/30 text-gym-muted",
                      active: "bg-gym-green/12 text-gym-green",
                    };
                    return (
                      <tr key={a.id} className="hover:bg-gym-surface/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-gym-text">{a.name}</div>
                          {a.nome_fantasia && <div className="text-xs text-gym-subtle">{a.nome_fantasia}</div>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-xs text-gym-muted">{a.owner_email || a.admin_user_email || "—"}</div>
                          {a.owner_nome && <div className="text-xs text-gym-subtle">{a.owner_nome}</div>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-gym-blue/12 text-gym-blue">{a.plan_name || "Starter"}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${scColors[sc] || scColors.trial}`}>{sc}</span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gym-muted tabular-nums">
                          {(a.trial_ate || a.trial_ends_at) ? new Date(a.trial_ate || a.trial_ends_at).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gym-muted tabular-nums">
                          {a.ultimo_acesso_owner ? new Date(a.ultimo_acesso_owner).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg border border-gym-border/50 text-gym-muted hover:text-gym-text bg-white transition-all">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleStatus(a)} title={a.status === "blocked" ? "Desbloquear" : "Bloquear"}
                              className={`p-1.5 rounded-lg border transition-all ${a.status === "blocked"
                                ? "text-gym-green border-gym-green/30 hover:bg-gym-green/8"
                                : "text-gym-red border-gym-red/30 hover:bg-gym-red/8"}`}>
                              {a.status === "blocked" ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
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

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gym-border/30 rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gym-text">{editTarget ? "Editar Academia" : "Nova Academia"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gym-subtle hover:text-gym-text p-1.5 rounded-lg hover:bg-gym-surface transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nome da Academia *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="FitZone Performance" />
                </div>
                <div>
                  <label className={labelCls}>Nome Fantasia</label>
                  <input value={form.nome_fantasia} onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))} className={inputCls} placeholder="FitZone" />
                </div>
                <div>
                  <label className={labelCls}>CNPJ</label>
                  <input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} className={inputCls} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className={labelCls}>Nome do Owner *</label>
                  <input required={!editTarget} value={form.owner_nome} onChange={e => setForm(f => ({ ...f, owner_nome: e.target.value }))} className={inputCls} placeholder="João Silva" />
                </div>
                <div>
                  <label className={labelCls}>CPF do Owner</label>
                  <input value={form.owner_cpf} onChange={e => setForm(f => ({ ...f, owner_cpf: e.target.value }))} className={inputCls} placeholder="000.000.000-00" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>E-mail do Owner *</label>
                  <input required={!editTarget} type="email" disabled={!!editTarget} value={form.owner_email} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))} className={inputCls + (editTarget ? " opacity-60" : "")} placeholder="owner@academia.com" />
                </div>
                <div>
                  <label className={labelCls}>Telefone do Owner</label>
                  <input value={form.owner_telefone} onChange={e => setForm(f => ({ ...f, owner_telefone: e.target.value }))} className={inputCls} placeholder="(11) 99999-0000" />
                </div>
                <div>
                  <label className={labelCls}>Trial até</label>
                  <input type="date" value={form.trial_ate} onChange={e => setForm(f => ({ ...f, trial_ate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Plano</label>
                  <select value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} className={inputCls}>
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Ciclo</label>
                  <select value={form.ciclo} onChange={e => setForm(f => ({ ...f, ciclo: e.target.value }))} className={inputCls}>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Valor (R$)</label>
                  <input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className={inputCls} placeholder="0.00" />
                </div>
              </div>

              {!editTarget && (
                <div className="bg-gym-blue/8 border border-gym-blue/20 rounded-lg p-3 text-xs text-gym-blue">
                  Uma senha provisória será gerada para o owner. Anote-a ao salvar.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg border border-gym-border/50 text-gym-muted text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-gym-purple hover:bg-gym-purple/80 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : (editTarget ? "Salvar" : "Criar Academia")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal senha provisória */}
      {provsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gym-border/30 rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-gym-green/12 rounded-xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-gym-green" />
              </div>
              <h2 className="text-lg font-bold text-gym-text">Academia criada!</h2>
              <p className="text-sm text-gym-muted mt-1">
                Guarde a senha provisória abaixo. Ela <strong>não será exibida novamente</strong>.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">Academia</label>
                <div className="text-sm text-gym-text font-semibold">{provsModal.academy_name}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">E-mail do Owner</label>
                <div className="text-sm font-mono text-gym-text">{provsModal.email}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gym-muted uppercase tracking-wide block mb-1">Senha Provisória</label>
                <div className="flex items-center gap-2 bg-gym-surface border border-gym-border/50 rounded-lg px-3 py-2.5">
                  <span className="flex-1 text-base font-mono font-bold text-gym-orange tracking-widest">{provsModal.senha}</span>
                  <button onClick={() => navigator.clipboard.writeText(provsModal.senha)} title="Copiar">
                    <Copy className="w-4 h-4 text-gym-muted hover:text-gym-text" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gym-subtle text-center">O owner deverá trocar a senha no primeiro acesso.</p>
            </div>

            <button onClick={() => setProvsModal(null)}
              className="w-full mt-4 bg-gym-orange hover:bg-gym-orange-light text-white font-semibold py-2.5 rounded-lg text-sm transition-all">
              Entendido — fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}