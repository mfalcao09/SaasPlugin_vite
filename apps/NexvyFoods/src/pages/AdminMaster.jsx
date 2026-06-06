import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isSuperAdmin } from '@/lib/isSuperAdmin';
import { hashPassword, generatePassword } from '@/lib/auth-local';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  Building2, Plus, Shield, LogOut, CheckCircle, Clock,
  XCircle, Search, X, Copy, Eye, ChevronDown
} from 'lucide-react';

const STATUS_COBRANCA_COLORS = {
  trial: 'bg-yellow-100 text-yellow-800',
  ativo: 'bg-green-100 text-green-800',
  inadimplente: 'bg-red-100 text-red-800',
  suspenso: 'bg-orange-100 text-orange-800',
  cancelado: 'bg-gray-100 text-gray-600',
};

const PLANOS = ['starter', 'pro', 'premium'];

function PasswordModal({ password, companyName, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-7 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Empresa criada!</h2>
            <p className="text-sm text-muted-foreground">{companyName}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Senha provisória do owner (exibida <strong>apenas uma vez</strong>):
        </p>
        <div className="bg-secondary rounded-xl p-4 flex items-center justify-between gap-3 mb-5">
          <span className="font-mono text-lg font-bold text-foreground tracking-widest">{password}</span>
          <button onClick={copy} className="flex-shrink-0 p-2 hover:bg-border rounded-lg transition-colors">
            {copied ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
          </button>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
          ⚠️ Esta senha não será exibida novamente. Copie antes de fechar.
        </p>
        <button onClick={onClose} className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold">
          Entendido, fechar
        </button>
      </div>
    </div>
  );
}

function NovaEmpresaForm({ onSaved, onCancel }) {
  const today14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [form, setForm] = useState({
    name: '', nome_fantasia: '', cnpj: '',
    owner_nome: '', owner_cpf: '', owner_email: '', owner_telefone: '',
    plano: 'starter', ciclo: 'mensal', valor: '', trial_ate: today14,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSave = async () => {
    if (!form.name || !form.owner_email) { setError('Nome e email do owner são obrigatórios.'); return; }
    setSaving(true);
    setError('');
    try {
      const slug = slugify(form.name) + '-' + Date.now().toString(36);
      const company = await base44.entities.Company.create({
        name: form.name,
        nome_fantasia: form.nome_fantasia || form.name,
        cnpj: form.cnpj,
        owner_nome: form.owner_nome,
        owner_cpf: form.owner_cpf,
        owner_email: form.owner_email.toLowerCase().trim(),
        owner_telefone: form.owner_telefone,
        slug,
        plano: form.plano,
        ciclo: form.ciclo,
        valor: form.valor ? parseFloat(form.valor) : 0,
        trial_ate: form.trial_ate,
        status_cobranca: 'trial',
        status: 'ativo',
        onboarding_step: 0,
        onboarding_completed: false,
        limite_usuarios: 3,
      });

      const senha = generatePassword(10);
      const senha_hash = await hashPassword(senha);
      await base44.entities.CompanyUser.create({
        company_id: company.id,
        email: form.owner_email.toLowerCase().trim(),
        nome: form.owner_nome || form.owner_email.split('@')[0],
        senha_hash,
        role: 'owner',
        ativo: true,
        forcar_troca_senha: true,
      });

      onSaved(company, senha);
    } catch (err) {
      setError('Erro ao criar empresa: ' + err.message);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, children }) => (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
  const inp = "w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-bold text-foreground text-lg">Novo Estabelecimento</h2>
          <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <F label="Nome *"><input className={inp} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Hamburgueria do Zé" /></F>
          <F label="Nome Fantasia"><input className={inp} value={form.nome_fantasia} onChange={e => setForm({...form, nome_fantasia: e.target.value})} /></F>
          <F label="CNPJ"><input className={inp} value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></F>
          <F label="Nome do Owner"><input className={inp} value={form.owner_nome} onChange={e => setForm({...form, owner_nome: e.target.value})} /></F>
          <F label="Email do Owner *"><input type="email" className={inp} value={form.owner_email} onChange={e => setForm({...form, owner_email: e.target.value})} placeholder="dono@email.com" /></F>
          <F label="Telefone do Owner"><input className={inp} value={form.owner_telefone} onChange={e => setForm({...form, owner_telefone: e.target.value})} /></F>
          <F label="CPF do Owner"><input className={inp} value={form.owner_cpf} onChange={e => setForm({...form, owner_cpf: e.target.value})} /></F>
          <F label="Plano">
            <select className={inp + ' bg-white'} value={form.plano} onChange={e => setForm({...form, plano: e.target.value})}>
              {PLANOS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </F>
          <F label="Ciclo">
            <select className={inp + ' bg-white'} value={form.ciclo} onChange={e => setForm({...form, ciclo: e.target.value})}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </F>
          <F label="Valor (R$)"><input type="number" className={inp} value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} placeholder="99.90" /></F>
          <F label="Trial Até">
            <input type="date" className={inp} value={form.trial_ate} onChange={e => setForm({...form, trial_ate: e.target.value})} />
          </F>
        </div>
        {error && <p className="mx-6 mb-4 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="p-6 border-t border-border flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'Criando...' : 'Criar Estabelecimento'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ company, onSaved, onClose }) {
  const [form, setForm] = useState({
    plano: company.plano || 'starter',
    ciclo: company.ciclo || 'mensal',
    valor: company.valor || '',
    status_cobranca: company.status_cobranca || 'trial',
    trial_ate: company.trial_ate || '',
    proximo_vencimento: company.proximo_vencimento || '',
    observacoes_internas: company.observacoes_internas || '',
    status: company.status || 'ativo',
    limite_usuarios: company.limite_usuarios || 3,
  });
  const [saving, setSaving] = useState(false);
  const inp = "w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";
  const F = ({ label, children }) => (
    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{label}</label>{children}</div>
  );

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Company.update(company.id, {
      ...form,
      valor: form.valor ? parseFloat(form.valor) : 0,
      limite_usuarios: parseInt(form.limite_usuarios) || 3,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">{company.name}</h2>
            <p className="text-xs text-muted-foreground">{company.owner_email}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <F label="Plano">
            <select className={inp + ' bg-white'} value={form.plano} onChange={e => setForm({...form, plano: e.target.value})}>
              {PLANOS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </F>
          <F label="Ciclo">
            <select className={inp + ' bg-white'} value={form.ciclo} onChange={e => setForm({...form, ciclo: e.target.value})}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </F>
          <F label="Valor (R$)"><input type="number" className={inp} value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} /></F>
          <F label="Limite Usuários"><input type="number" className={inp} value={form.limite_usuarios} onChange={e => setForm({...form, limite_usuarios: e.target.value})} /></F>
          <F label="Status Cobrança">
            <select className={inp + ' bg-white'} value={form.status_cobranca} onChange={e => setForm({...form, status_cobranca: e.target.value})}>
              {['trial','ativo','inadimplente','suspenso','cancelado'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </F>
          <F label="Status Empresa">
            <select className={inp + ' bg-white'} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </F>
          <F label="Trial Até"><input type="date" className={inp} value={form.trial_ate} onChange={e => setForm({...form, trial_ate: e.target.value})} /></F>
          <F label="Próximo Vencimento"><input type="date" className={inp} value={form.proximo_vencimento} onChange={e => setForm({...form, proximo_vencimento: e.target.value})} /></F>
          <div className="col-span-2">
            <F label="Obs. Internas">
              <textarea className={inp + ' resize-none'} rows={2} value={form.observacoes_internas} onChange={e => setForm({...form, observacoes_internas: e.target.value})} />
            </F>
          </div>
        </div>
        <div className="p-6 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminMaster() {
  useDocumentTitle('Admin Master | FoodControl AI');
  const [masterUser, setMasterUser] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [authorized, setAuthorized] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showNovaForm, setShowNovaForm] = useState(false);
  const [passwordModal, setPasswordModal] = useState(null);
  const [editModal, setEditModal] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [u, configs] = await Promise.all([
          base44.auth.me().catch(() => null),
          base44.entities.AppConfig.list(),
        ]);
        const config = configs[0] || null;
        setAppConfig(config);
        setMasterUser(u);
        if (!u || !isSuperAdmin(u, config)) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        setAuthorized(true);
        const all = await base44.entities.Company.list('-created_date', 500);
        setCompanies(all);
      } catch (e) {
        console.error(e);
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const reload = async () => {
    const all = await base44.entities.Company.list('-created_date', 500);
    setCompanies(all);
  };

  const handleNovaEmpresaSaved = (company, senha) => {
    setShowNovaForm(false);
    setPasswordModal({ company, senha });
    reload();
  };

  const toggleStatus = async (company) => {
    const novoStatus = company.status === 'bloqueado' ? 'ativo' : 'bloqueado';
    await base44.entities.Company.update(company.id, { status: novoStatus });
    reload();
  };

  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.owner_email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter || c.status_cobranca === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: companies.length,
    ativos: companies.filter(c => c.status === 'ativo').length,
    trial: companies.filter(c => c.status_cobranca === 'trial').length,
    bloqueados: companies.filter(c => c.status === 'bloqueado').length,
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authorized) {
    if (!masterUser) {
      base44.auth.redirectToLogin();
      return null;
    }
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-border p-10 text-center max-w-sm">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground text-xl mb-2">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar este painel.</p>
          <button onClick={() => base44.auth.logout('/')} className="mt-5 px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-medium">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm leading-none">Admin Master</p>
              <p className="text-xs text-muted-foreground">FoodControl AI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{masterUser?.email}</span>
            <button onClick={() => base44.auth.logout('/')} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg">
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, icon: Building2, color: 'text-accent' },
            { label: 'Ativos', value: stats.ativos, icon: CheckCircle, color: 'text-green-600' },
            { label: 'Em Trial', value: stats.trial, icon: Clock, color: 'text-yellow-600' },
            { label: 'Bloqueados', value: stats.bloqueados, icon: XCircle, color: 'text-red-600' },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-5">
              <s.icon className={`w-5 h-5 ${s.color} mb-3`} />
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Buscar empresa ou email..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {[
              { k: 'todos', l: 'Todas' },
              { k: 'ativo', l: 'Ativas' },
              { k: 'trial', l: 'Trial' },
              { k: 'bloqueado', l: 'Bloqueadas' },
            ].map(f => (
              <button key={f.k} onClick={() => setStatusFilter(f.k)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === f.k ? 'bg-foreground text-background' : 'bg-white border border-border text-muted-foreground hover:text-foreground'}`}>
                {f.l}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNovaForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium ml-auto">
            <Plus className="w-4 h-4" /> Novo Estabelecimento
          </button>
        </div>

        {/* Tabela */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-3 px-5 py-3 border-b border-border bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2">Empresa</div>
            <div>Plano</div>
            <div>Cobrança</div>
            <div>Trial Até</div>
            <div>Último Acesso</div>
            <div>Ações</div>
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada</p>
            </div>
          ) : filtered.map((company, i) => (
            <div key={company.id} className={`grid grid-cols-7 gap-3 px-5 py-4 items-center ${i < filtered.length - 1 ? 'border-b border-border' : ''} hover:bg-secondary/20 transition-colors`}>
              <div className="col-span-2 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{company.name}</p>
                <p className="text-xs text-muted-foreground truncate">{company.owner_email}</p>
              </div>
              <div>
                <span className="text-xs px-2 py-1 rounded-full bg-secondary text-foreground font-medium capitalize">{company.plano || 'starter'}</span>
              </div>
              <div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COBRANCA_COLORS[company.status_cobranca] || 'bg-gray-100 text-gray-600'}`}>
                  {company.status_cobranca || 'trial'}
                </span>
              </div>
              <div>
                {company.trial_ate ? (
                  <span className="text-xs text-muted-foreground">{company.trial_ate}</span>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
              <div>
                {company.ultimo_acesso_owner ? (
                  <span className="text-xs text-muted-foreground">
                    {new Date(company.ultimo_acesso_owner).toLocaleDateString('pt-BR')}
                  </span>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditModal(company)} className="text-xs text-accent hover:underline font-medium">Editar</button>
                <button
                  onClick={() => toggleStatus(company)}
                  className={`text-xs font-medium hover:underline ${company.status === 'bloqueado' ? 'text-green-600' : 'text-red-500'}`}
                >
                  {company.status === 'bloqueado' ? 'Ativar' : 'Bloquear'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNovaForm && (
        <NovaEmpresaForm onSaved={handleNovaEmpresaSaved} onCancel={() => setShowNovaForm(false)} />
      )}
      {passwordModal && (
        <PasswordModal
          password={passwordModal.senha}
          companyName={passwordModal.company.name}
          onClose={() => { setPasswordModal(null); }}
        />
      )}
      {editModal && (
        <EditModal company={editModal} onSaved={() => { setEditModal(null); reload(); }} onClose={() => setEditModal(null)} />
      )}
    </div>
  );
}