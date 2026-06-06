import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Scissors, Plus, Globe, CheckCircle, XCircle, Clock, X, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = {
  active: { label: 'Ativa', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inativa', color: 'bg-gray-100 text-gray-500' },
  blocked: { label: 'Bloqueada', color: 'bg-red-100 text-red-600' },
};

export default function MasterPanel() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', owner_email: '', plan_name: 'Starter', status: 'active' });
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Master | BarbeiroPro AI';
    return () => { document.title = 'BarbeiroPro AI'; };
  }, []);
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['master-companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['master-companies'] }); setShowForm(false); setForm({ name: '', owner_email: '', plan_name: 'Starter', status: 'active' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Company.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['master-companies'] }),
  });

  const active = companies.filter(c => c.status === 'active').length;
  const onboarding = companies.filter(c => !c.onboarding_completed).length;

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Header */}
      <header className="bg-[#1B3A4B] text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold">BarbeiroPro AI — Master</div>
            <div className="text-xs text-white/60">Painel Super Admin</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs text-white/60 hover:text-white">← LP Pública</Link>
          <Link to="/app/dashboard" className="text-xs text-white/60 hover:text-white">App →</Link>
        </div>
      </header>

      <div className="p-8">
        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total de empresas', value: companies.length },
            { label: 'Ativas', value: active },
            { label: 'Em onboarding', value: onboarding },
            { label: 'Bloqueadas', value: companies.filter(c => c.status === 'blocked').length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-black/8 p-5">
              <div className="text-3xl font-black text-[#1B1C1E]">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Companies table */}
        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <div className="p-5 border-b border-black/8 flex items-center justify-between">
            <h2 className="font-bold text-[#1B1C1E]">Empresas cadastradas</h2>
            <button onClick={() => setShowForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />Nova empresa
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/8">
                {['Empresa', 'Slug / Link', 'Plano', 'Onboarding', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id} className="border-b border-black/5 hover:bg-[#F8F7F3] transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-sm text-[#1B1C1E]">{c.name}</div>
                    {c.owner_email && <div className="text-xs text-gray-400">{c.owner_email}</div>}
                  </td>
                  <td className="p-4">
                    {c.slug ? (
                      <a href={`/agendar/${c.slug}`} target="_blank" className="flex items-center gap-1 text-xs text-[#1B3A4B] hover:underline">
                        <Globe className="w-3 h-3" />/agendar/{c.slug}
                      </a>
                    ) : <span className="text-xs text-gray-400">–</span>}
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-medium px-2 py-1 bg-[#1B3A4B]/10 text-[#1B3A4B] rounded-lg">{c.plan_name || 'Starter'}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      {c.onboarding_completed
                        ? <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600">Completo</span></>
                        : <><Clock className="w-4 h-4 text-orange-400" /><span className="text-xs text-orange-600">Etapa {c.onboarding_step || 1}</span></>
                      }
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusConfig[c.status || 'active'].color}`}>
                      {statusConfig[c.status || 'active'].label}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {c.slug && (
                        <button onClick={() => navigate(`/app/dashboard?slug=${c.slug}`)}
                          className="text-xs px-2 py-1 rounded-lg font-medium bg-[#1B3A4B]/10 text-[#1B3A4B] hover:bg-[#1B3A4B]/20 transition-colors flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />Ver painel
                        </button>
                      )}
                      <button onClick={() => updateMutation.mutate({ id: c.id, data: { status: c.status === 'active' ? 'blocked' : 'active' } })}
                        className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${c.status === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                        {c.status === 'active' ? 'Bloquear' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-sm">Nenhuma empresa cadastrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#1B1C1E]">Nova Empresa Cliente</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Nome da barbearia *', key: 'name', type: 'text' },
                { label: 'E-mail do responsável', key: 'owner_email', type: 'email' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Plano</label>
                <select value={form.plan_name} onChange={e => setForm(p => ({ ...p, plan_name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                  <option>Starter</option>
                  <option>Pro</option>
                  <option>Enterprise</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-black/10 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={() => createMutation.mutate(form)} disabled={!form.name}
                className="flex-1 px-4 py-2.5 bg-[#1B3A4B] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A4B]/90 disabled:opacity-50">Criar empresa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}