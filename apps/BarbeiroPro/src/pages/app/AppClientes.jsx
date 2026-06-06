import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { Search, Plus, X, Users, Pencil, Trash2, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusBadge = {
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inativo', color: 'bg-red-100 text-red-600' },
  vip: { label: 'VIP ⭐', color: 'bg-yellow-100 text-yellow-700' },
};

const emptyForm = { name: '', phone: '', email: '', notes: '', status: 'active', tags: [] };

export default function AppClientes() {
  const { companyId, isLoading: loadingCompany } = useCompany();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => base44.entities.Customer.filter({ company_id: companyId }, '-created_date', 500),
    enabled: !!companyId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: () => base44.entities.Appointment.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create({ ...data, company_id: companyId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers', companyId] }); closeForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers', companyId] }); closeForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers', companyId] }),
  });

  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', notes: c.notes || '', status: c.status || 'active', tags: c.tags || [] });
    setShowForm(true);
  };

  const handleSave = () => {
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const getCustomerStats = (customerId) => {
    const customerAppts = appointments.filter(a => a.customer_id === customerId && a.status === 'concluido');
    return customerAppts.length;
  };

  const filtered = customers.filter(c => {
    const matchSearch = (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search);
    const matchFilter = filter === 'all' || c.status === filter;
    return matchSearch && matchFilter;
  });

  if (loadingCompany || isLoading) {
    return (
      <AppLayout>
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-[#1B3A4B]/20 border-t-[#1B3A4B] rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Clientes</h1>
            <p className="text-gray-500 text-sm mt-1">{customers.length} clientes cadastrados</p>
          </div>
          <button onClick={() => setShowForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />Novo cliente
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[{ v: 'all', l: 'Todos' }, { v: 'active', l: 'Ativos' }, { v: 'vip', l: 'VIP' }, { v: 'inactive', l: 'Inativos' }].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === f.v ? 'bg-[#1B3A4B] text-white' : 'bg-white border border-black/10 text-gray-600 hover:border-[#1B3A4B]'}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          {filtered.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/8 bg-[#F8F7F3]">
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Telefone</th>
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Atendimentos</th>
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Última Visita</th>
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-black/5 hover:bg-[#F8F7F3] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#1B3A4B]/10 rounded-full flex items-center justify-center text-xs font-bold text-[#1B3A4B] flex-shrink-0">
                          {(c.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-[#1B1C1E]">{c.name}</div>
                          {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="w-3 h-3" />{c.phone || '–'}
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell text-sm font-semibold text-[#1B1C1E]">
                      {getCustomerStats(c.id)}x
                    </td>
                    <td className="p-4 hidden lg:table-cell text-sm text-gray-500">
                      {c.last_appointment_at ? format(new Date(c.last_appointment_at), "d MMM yyyy", { locale: ptBR }) : '–'}
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusBadge[c.status || 'active'].color}`}>
                        {statusBadge[c.status || 'active'].label}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                        <button onClick={() => { if (confirm('Excluir cliente?')) deleteMutation.mutate(c.id); }} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">{search ? 'Nenhum cliente encontrado para esta busca' : 'Nenhum cliente cadastrado ainda'}</p>
              {!search && <button onClick={() => setShowForm(true)} className="text-sm font-semibold text-[#1B3A4B] mt-2 hover:underline">Cadastrar primeiro cliente</button>}
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeForm}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-[#1B1C1E]">{editing ? 'Editar Cliente' : 'Novo Cliente'}</h3>
                <button onClick={closeForm}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Nome *</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Telefone *</label>
                    <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">E-mail</label>
                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20">
                    <option value="active">Ativo</option>
                    <option value="vip">VIP</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    placeholder="Preferências, alergias, observações..."
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={closeForm} className="flex-1 px-4 py-2.5 border border-black/10 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSave} disabled={!form.name || !form.phone || createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#1B3A4B] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A4B]/90 disabled:opacity-50">
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}