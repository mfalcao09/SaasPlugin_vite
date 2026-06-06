import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { Plus, X, UserCheck, Mail } from 'lucide-react';

const roleLabels = { admin: 'Admin', recepcao: 'Recepção', barbeiro: 'Barbeiro', financeiro: 'Financeiro' };
const roleColors = { admin: 'bg-purple-100 text-purple-700', recepcao: 'bg-blue-100 text-blue-700', barbeiro: 'bg-green-100 text-green-700', financeiro: 'bg-yellow-100 text-yellow-700' };

export default function AppEquipe() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'recepcao', active: true });
  const queryClient = useQueryClient();

  const { company, companyId } = useCompany();

  const { data: team = [] } = useQuery({
    queryKey: ['team', companyId],
    queryFn: () => base44.entities.TeamMember.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TeamMember.create({ ...data, company_id: companyId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team', companyId] }); setShowForm(false); setForm({ name: '', email: '', role: 'recepcao', active: true }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TeamMember.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', companyId] }),
  });

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Equipe</h1>
            <p className="text-gray-500 text-sm mt-1">{team.length} membros cadastrados</p>
          </div>
          <button onClick={() => setShowForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />Convidar membro
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/8">
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Membro</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">E-mail</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Papel</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {team.map(m => (
                <tr key={m.id} className="border-b border-black/5 hover:bg-[#F8F7F3] transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#1B3A4B]/10 rounded-full flex items-center justify-center text-xs font-bold text-[#1B3A4B]">
                        {(m.name || '?')[0]}
                      </div>
                      <span className="font-semibold text-sm text-[#1B1C1E]">{m.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-500">{m.email}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg ${roleColors[m.role] || 'bg-gray-100 text-gray-600'}`}>
                      {roleLabels[m.role] || m.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <button onClick={() => updateMutation.mutate({ id: m.id, data: { active: !m.active } })}
                      className={`text-xs font-medium px-2 py-1 rounded-lg cursor-pointer ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400 text-sm">Nenhum membro na equipe</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-[#1B1C1E]">Convidar Membro</h3>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Nome *', key: 'name', type: 'text' },
                  { label: 'E-mail *', key: 'email', type: 'email' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                    <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Papel</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                    <option value="admin">Admin</option>
                    <option value="recepcao">Recepção</option>
                    <option value="barbeiro">Barbeiro</option>
                    <option value="financeiro">Financeiro</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-black/10 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={() => createMutation.mutate(form)} disabled={!form.name || !form.email}
                  className="flex-1 px-4 py-2.5 bg-[#1B3A4B] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A4B]/90 disabled:opacity-50">Salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}