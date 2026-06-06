import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scissors, Plus, Globe, ExternalLink, RefreshCw, Mail, Lock, MoreHorizontal, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const planoLabels = { starter: 'Starter', pro: 'Pro', premium: 'Premium' };
const statusCobrancaBadge = {
  trial:       'bg-blue-100 text-blue-700',
  ativo:       'bg-green-100 text-green-700',
  inadimplente:'bg-orange-100 text-orange-700',
  suspenso:    'bg-red-100 text-red-600',
  cancelado:   'bg-gray-100 text-gray-500',
};
const statusBadge = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-400',
  blocked:  'bg-red-100 text-red-600',
};

export default function ListaBarbearias() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroPlano, setFiltroPlano] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [toast, setToast] = useState(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['master-companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 300),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Company.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['master-companies'] }),
  });

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleAction(action, company) {
    setOpenMenu(null);
    if (action === 'suspender') {
      await updateMutation.mutateAsync({ id: company.id, data: { status: 'blocked', status_cobranca: 'suspenso' } });
      showToast('Barbearia suspensa.');
    } else if (action === 'reativar') {
      await updateMutation.mutateAsync({ id: company.id, data: { status: 'active', status_cobranca: 'ativo' } });
      showToast('Barbearia reativada.');
    } else if (action === 'reenviar') {
      const res = await base44.functions.invoke('barbeariaUserActions', { action: 'reenviar_credenciais', company_id: company.id, origin: window.location.origin });
      if (res.data?.success) showToast('Credenciais reenviadas por e-mail!');
      else showToast(res.data?.error || 'Erro ao reenviar', 'error');
    } else if (action === 'forcar_reset') {
      // Buscar BarbeariaUser owner
      const users = await base44.entities.BarbeariaUser.filter({ barbearia_id: company.id, role: 'owner' });
      if (users[0]) {
        const res = await base44.functions.invoke('barbeariaUserActions', { action: 'forcar_reset_senha', user_id: users[0].id });
        if (res.data?.success) showToast('Reset de senha forçado. Usuário deverá trocar no próximo login.');
        else showToast(res.data?.error || 'Erro', 'error');
      }
    } else if (action === 'editar') {
      navigate(`/master/barbearias/${company.id}/editar`);
    }
  }

  const filtered = companies.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroPlano && c.plano !== filtroPlano) return false;
    return true;
  });

  const stats = {
    total: companies.length,
    ativas: companies.filter(c => c.status === 'active').length,
    trial: companies.filter(c => c.status_cobranca === 'trial').length,
    suspensos: companies.filter(c => c.status === 'blocked').length,
  };

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter" onClick={(e) => { if (!e.target.closest('[data-dropdown]')) setOpenMenu(null); }}>
      <header className="bg-[#1B3A4B] text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold">BarbeiroPro AI — Master</div>
            <div className="text-xs text-white/60">Gestão de barbearias</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs text-white/60 hover:text-white">← LP</Link>
          <Link to="/app/dashboard" className="text-xs text-white/60 hover:text-white">App →</Link>
        </div>
      </header>

      <div className="p-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Ativas', value: stats.ativas },
            { label: 'Em trial', value: stats.trial },
            { label: 'Suspensas', value: stats.suspensos },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-black/8 p-5">
              <div className="text-3xl font-black text-[#1B1C1E]">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <div className="p-5 border-b border-black/8 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-bold text-[#1B1C1E]">Barbearias</h2>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                className="text-xs px-2 py-1.5 border border-black/10 rounded-lg bg-white focus:outline-none">
                <option value="">Todos status</option>
                <option value="active">Ativas</option>
                <option value="blocked">Bloqueadas</option>
                <option value="inactive">Inativas</option>
              </select>
              <select value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}
                className="text-xs px-2 py-1.5 border border-black/10 rounded-lg bg-white focus:outline-none">
                <option value="">Todos planos</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <Link to="/master/barbearias/nova"
              className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />Nova barbearia
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/8">
                  {['Barbearia', 'Plano', 'Cobrança', 'Próx. vencimento', 'Último acesso', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-black/5 hover:bg-[#F8F7F3] transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-sm text-[#1B1C1E]">{c.nome_fantasia || c.name}</div>
                      <div className="text-xs text-gray-400">{c.owner_email}</div>
                      {c.slug && (
                        <a href={`/agendar/${c.slug}`} target="_blank" className="flex items-center gap-1 text-xs text-[#1B3A4B]/60 hover:text-[#1B3A4B] mt-0.5">
                          <Globe className="w-3 h-3" />{c.slug}
                        </a>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-medium px-2 py-1 bg-[#1B3A4B]/10 text-[#1B3A4B] rounded-lg">
                        {planoLabels[c.plano] || c.plan_name || 'Starter'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusCobrancaBadge[c.status_cobranca] || 'bg-gray-100 text-gray-500'}`}>
                        {c.status_cobranca || 'trial'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {c.proximo_vencimento
                        ? format(new Date(c.proximo_vencimento), 'dd/MM/yyyy', { locale: ptBR })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {c.ultimo_acesso_owner
                        ? format(new Date(c.ultimo_acesso_owner), "dd/MM/yy HH:mm", { locale: ptBR })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusBadge[c.status || 'active']}`}>
                        {c.status === 'active' ? 'Ativa' : c.status === 'blocked' ? 'Suspensa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        {c.slug && (
                          <button onClick={() => navigate(`/app/dashboard?slug=${c.slug}`)}
                            className="text-xs px-2 py-1 rounded-lg font-medium bg-[#1B3A4B]/10 text-[#1B3A4B] hover:bg-[#1B3A4B]/20 transition-colors flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />Painel
                          </button>
                        )}
                        {/* Dropdown de ações */}
                        <div className="relative" data-dropdown="true">
                          <button
                            onClick={(e) => { e.stopPropagation(); console.log('[dropdown] toggle', c.id, 'current:', openMenu); setOpenMenu(prev => prev === c.id ? null : c.id); }}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                            <MoreHorizontal className="w-3 h-3" />
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          {openMenu === c.id && (
                            <div className="absolute right-0 top-8 bg-white border border-black/10 rounded-xl shadow-xl z-50 w-52 py-1 text-sm" data-dropdown="true">
                              <button onClick={(e) => { e.stopPropagation(); handleAction('editar', c); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-left">Editar</button>
                              {c.status === 'active'
                                ? <button onClick={(e) => { e.stopPropagation(); handleAction('suspender', c); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-red-50 text-red-600 text-left">Suspender</button>
                                : <button onClick={(e) => { e.stopPropagation(); handleAction('reativar', c); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-green-50 text-green-700 text-left">Reativar</button>
                              }
                              <button onClick={(e) => { e.stopPropagation(); handleAction('reenviar', c); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-left">
                                <Mail className="w-3 h-3" />Reenviar credenciais
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleAction('forcar_reset', c); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-left">
                                <Lock className="w-3 h-3" />Forçar reset de senha
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-400 text-sm">Nenhuma barbearia encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl z-50 ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-[#1B3A4B] text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}