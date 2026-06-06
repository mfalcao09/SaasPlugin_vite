import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { Plus, X, Star, Clock, Pencil, Trash2, Briefcase } from 'lucide-react';

const emptyForm = { name: '', description: '', duration_minutes: 30, price: 0, active: true, featured: false, category_id: '' };

export default function AppServicos() {
  const { companyId, isLoading: loadingCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services', companyId],
    queryFn: () => base44.entities.Service.filter({ company_id: companyId }, 'name', 200),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Service.create({ ...data, company_id: companyId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['services', companyId] }); closeForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Service.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['services', companyId] }); closeForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Service.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', companyId] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Service.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', companyId] }),
  });

  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ name: s.name, description: s.description || '', duration_minutes: s.duration_minutes, price: s.price, active: s.active, featured: s.featured || false, category_id: s.category_id || '' });
    setShowForm(true);
  };

  const handleSave = () => {
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const activeServices = services.filter(s => s.active);
  const inactiveServices = services.filter(s => !s.active);

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
            <h1 className="text-2xl font-black text-[#1B1C1E]">Serviços</h1>
            <p className="text-gray-500 text-sm mt-1">{activeServices.length} ativos · {inactiveServices.length} inativos</p>
          </div>
          <button onClick={() => setShowForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />Novo serviço
          </button>
        </div>

        {services.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/8 p-12 text-center text-gray-400">
            <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-3">Nenhum serviço cadastrado</p>
            <button onClick={() => setShowForm(true)} className="text-sm font-semibold text-[#1B3A4B] hover:underline">Adicionar primeiro serviço</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(s => (
              <div key={s.id} className={`bg-white rounded-2xl border p-5 ${s.active ? 'border-black/8' : 'border-black/5 opacity-60'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[#1B1C1E]">{s.name}</h3>
                    {s.featured && <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => { if (confirm('Excluir serviço?')) deleteMutation.mutate(s.id); }} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                {s.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{s.description}</p>}
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3.5 h-3.5" />{s.duration_minutes} min</span>
                  <span className="text-xl font-black text-[#1B3A4B]">R${s.price}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-black/5">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.active ? 'Ativo' : 'Inativo'}
                  </span>
                  <button onClick={() => toggleActiveMutation.mutate({ id: s.id, active: !s.active })}
                    className="text-xs text-gray-400 hover:text-[#1B3A4B] font-medium">
                    {s.active ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeForm}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-[#1B1C1E]">{editing ? 'Editar Serviço' : 'Novo Serviço'}</h3>
                <button onClick={closeForm}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Nome *</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Corte Clássico"
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Descrição</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Duração (min) *</label>
                    <input type="number" min="5" step="5" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: +e.target.value }))}
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Preço (R$) *</label>
                    <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: +e.target.value }))}
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                </div>
                <div className="flex gap-5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.featured} onChange={e => setForm(p => ({ ...p, featured: e.target.checked }))} />
                    <Star className="w-3.5 h-3.5 text-yellow-500" /> Destaque
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={closeForm} className="flex-1 px-4 py-2.5 border border-black/10 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSave} disabled={!form.name || createMutation.isPending || updateMutation.isPending}
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