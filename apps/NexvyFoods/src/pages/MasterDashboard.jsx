import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom'; // base44 já importado acima
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useCompanyContext } from '@/context/CompanyContext';
import { isSuperAdmin } from '@/lib/isSuperAdmin';
import { Building2, Plus, BarChart3, Users, CheckCircle, Clock, Search } from 'lucide-react';

export default function MasterDashboard() {
  const navigate = useNavigate();
  const { appConfig, user, loading: ctxLoading, isSuperAdmin: isSuper, authChecked } = useCompanyContext();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  useDocumentTitle('Master | FoodControl AI');

  useEffect(() => {
    // Wait for auth check to complete AND appConfig to load
    if (ctxLoading || appConfig === undefined || !authChecked) return;

    // If user is null after auth check completed, redirect to login
    if (user === null) {
      base44.auth.redirectToLogin();
      return;
    }

    // Redirect non-super-admin users to app dashboard
    if (!isSuper) {
      navigate('/app/dashboard');
      return;
    }

    const load = async () => {
      try {
        const all = await base44.entities.Company.list('-created_date', 200);
        setCompanies(all);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [ctxLoading, appConfig, isSuper, navigate]);

  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.slug?.includes(search);
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const active = companies.filter(c => c.status === 'ativo').length;
  const pendingOnboarding = companies.filter(c => !c.onboarding_completed).length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Master Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerenciamento de todas as empresas</p>
        </div>
        <Link to="/master/companies">
          <button className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Empresas', value: companies.length, icon: Building2, color: 'text-accent' },
          { label: 'Ativas', value: active, icon: CheckCircle, color: 'text-green-600' },
          { label: 'Pendentes Onboarding', value: pendingOnboarding, icon: Clock, color: 'text-yellow-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5">
            <s.icon className={`w-5 h-5 ${s.color} mb-3`} />
            <p className="text-3xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Buscar empresa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {[{ key: 'todos', label: 'Todas' }, { key: 'ativo', label: 'Ativas' }, { key: 'inativo', label: 'Inativas' }].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === f.key ? 'bg-foreground text-background' : 'bg-white border border-border text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empresas */}
      {companies.length === 0 ? (
        <div className="py-20 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Nenhuma empresa cadastrada</h2>
          <p className="text-sm text-muted-foreground mb-4">Cadastre a primeira empresa para começar.</p>
          <Link to="/master/companies">
            <button className="px-6 py-3 bg-accent text-white rounded-xl text-sm font-medium">+ Nova Empresa</button>
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border bg-secondary/30">
            {['Empresa', 'Slug', 'Status', 'Onboarding', 'Ações'].map(h => (
              <p key={h} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {filtered.map((company, i) => (
            <div key={company.id} className={`grid grid-cols-5 gap-4 px-5 py-4 items-center ${i < filtered.length - 1 ? 'border-b border-border' : ''} hover:bg-secondary/20 transition-colors`}>
              <div>
                <p className="font-semibold text-foreground text-sm">{company.name}</p>
                {company.phone && <p className="text-xs text-muted-foreground mt-0.5">{company.phone}</p>}
              </div>
              <p className="text-xs font-mono text-muted-foreground">{company.slug}</p>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex w-fit ${company.status === 'ativo' ? 'bg-green-100 text-green-800' : company.status === 'bloqueado' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                {company.status}
              </span>
              <div>
                {company.onboarding_completed ? (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-800">Completo</span>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-yellow-100 text-yellow-800">
                    Etapa {company.onboarding_step || 0}/6
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <a href={`/app/dashboard?company=${company.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline font-medium">Ver</a>
                <a href={`/pedido/${company.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">Link Público</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}