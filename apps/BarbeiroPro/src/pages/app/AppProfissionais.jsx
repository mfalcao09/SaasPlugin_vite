import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useState } from 'react';
import { Plus, X, Pencil, Scissors, Trash2 } from 'lucide-react';

const DAYS = [
  { key: 'seg', label: 'Seg' }, { key: 'ter', label: 'Ter' }, { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' }, { key: 'sex', label: 'Sex' }, { key: 'sab', label: 'Sáb' }, { key: 'dom', label: 'Dom' },
];

const defaultSchedule = Object.fromEntries(DAYS.map(d => [d.key, { open: '09:00', close: '18:00', active: d.key !== 'dom' }]));

const emptyForm = { name: '', specialty: '', photo_url: '', active: true, work_schedule: defaultSchedule, service_ids: [], commission_type: 'percent', commission_value: 0 };

export default function AppProfissionais() {
  const { companyId, isLoading: loadingCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState('info'); // 'info' | 'schedule' | 'services'
  const queryClient = useQueryClient();

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ['professionals', companyId],
    queryFn: () => base44.entities.Professional.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', companyId],
    queryFn: () => base44.entities.Service.filter({ company_id: companyId, active: true }),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Professional.create({ ...data, company_id: companyId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['professionals', companyId] }); closeForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Professional.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['professionals', companyId] }); closeForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Professional.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['professionals', companyId] }),
  });

  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); setTab('info'); };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name,
      specialty: p.specialty || '',
      photo_url: p.photo_url || '',
      active: p.active,
      work_schedule: p.work_schedule || defaultSchedule,
      service_ids: p.service_ids || [],
      commission_type: p.commission_type || 'percent',
      commission_value: p.commission_value || 0,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const setSchedule = (day, field, val) => {
    setForm(p => ({ ...p, work_schedule: { ...p.work_schedule, [day]: { ...p.work_schedule[day], [field]: val } } }));
  };

  const toggleService = (sid) => {
    setForm(p => ({
      ...p,
      service_ids: p.service_ids.includes(sid) ? p.service_ids.filter(id => id !== sid) : [...p.service_ids, sid]
    }));
  };

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
            <h1 className="text-2xl font-black text-[#1B1C1E]">Profissionais</h1>
            <p className="text-gray-500 text-sm mt-1">{professionals.length} profissionais cadastrados</p>
          </div>
          <button onClick={() => setShowForm(true)} className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />Novo profissional
          </button>
        </div>

        {professionals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/8 p-12 text-center text-gray-400">
            <Scissors className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-3">Nenhum profissional cadastrado</p>
            <button onClick={() => setShowForm(true)} className="text-sm font-semibold text-[#1B3A4B] hover:underline">Adicionar primeiro profissional</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {professionals.map(pro => (
              <div key={pro.id} className={`bg-white rounded-2xl border p-5 ${pro.active ? 'border-black/8' : 'border-black/5 opacity-60'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {pro.photo_url ? (
                      <img src={pro.photo_url} alt={pro.name} className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <div className="w-12 h-12 bg-[#1B3A4B]/10 rounded-xl flex items-center justify-center">
                        <Scissors className="w-5 h-5 text-[#1B3A4B]" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-[#1B1C1E]">{pro.name}</h3>
                      <p className="text-xs text-gray-500">{pro.specialty || 'Barbeiro'}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className={`w-2 h-2 rounded-full ${pro.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                        <span className="text-xs text-gray-400">{pro.active ? 'Ativo' : 'Inativo'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(pro)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => { if (confirm('Excluir profissional?')) deleteMutation.mutate(pro.id); }} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                {pro.service_ids && pro.service_ids.length > 0 && (
                  <div className="text-xs text-gray-400">{pro.service_ids.length} serviços vinculados</div>
                )}
                {pro.commission_value > 0 && (
                  <div className="text-xs text-gray-400 mt-1">Comissão: {pro.commission_value}{pro.commission_type === 'percent' ? '%' : ' R$'}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeForm}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-black/8 flex items-center justify-between">
                <h3 className="font-bold text-[#1B1C1E]">{editing ? 'Editar Profissional' : 'Novo Profissional'}</h3>
                <button onClick={closeForm}><X className="w-5 h-5" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-black/8">
                {[{ id: 'info', label: 'Dados' }, { id: 'schedule', label: 'Horários' }, { id: 'services', label: 'Serviços' }].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex-1 py-2.5 text-sm font-medium transition-all ${tab === t.id ? 'text-[#1B3A4B] border-b-2 border-[#1B3A4B]' : 'text-gray-400 hover:text-gray-600'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {tab === 'info' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Nome *</label>
                      <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Especialidade</label>
                      <input type="text" value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                        placeholder="Ex: Barba & Navalha"
                        className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">URL da Foto</label>
                      <input type="url" value={form.photo_url} onChange={e => setForm(p => ({ ...p, photo_url: e.target.value }))}
                        placeholder="https://..."
                        className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Tipo comissão</label>
                        <select value={form.commission_type} onChange={e => setForm(p => ({ ...p, commission_type: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none">
                          <option value="percent">Porcentagem (%)</option>
                          <option value="fixed">Valor fixo (R$)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Valor</label>
                        <input type="number" min="0" value={form.commission_value} onChange={e => setForm(p => ({ ...p, commission_value: +e.target.value }))}
                          className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                      Profissional ativo
                    </label>
                  </div>
                )}

                {tab === 'schedule' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 mb-3">Configure os dias e horários de atendimento</p>
                    {DAYS.map(({ key, label }) => {
                      const h = form.work_schedule[key] || { open: '09:00', close: '18:00', active: false };
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <label className="flex items-center gap-2 w-16">
                            <input type="checkbox" checked={h.active} onChange={e => setSchedule(key, 'active', e.target.checked)} />
                            <span className={`text-sm font-medium ${h.active ? 'text-[#1B1C1E]' : 'text-gray-400'}`}>{label}</span>
                          </label>
                          {h.active ? (
                            <div className="flex items-center gap-2">
                              <input type="time" value={h.open} onChange={e => setSchedule(key, 'open', e.target.value)}
                                className="px-2 py-1.5 border border-black/10 rounded-lg text-xs focus:outline-none" />
                              <span className="text-gray-400 text-xs">até</span>
                              <input type="time" value={h.close} onChange={e => setSchedule(key, 'close', e.target.value)}
                                className="px-2 py-1.5 border border-black/10 rounded-lg text-xs focus:outline-none" />
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Folga</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {tab === 'services' && (
                  <div>
                    <p className="text-xs text-gray-500 mb-3">Selecione os serviços que este profissional realiza</p>
                    {services.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum serviço cadastrado ainda</p>
                    ) : (
                      <div className="space-y-2">
                        {services.map(s => (
                          <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-black/8 cursor-pointer hover:bg-[#F8F7F3]">
                            <input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={() => toggleService(s.id)} />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-[#1B1C1E]">{s.name}</span>
                              <span className="text-xs text-gray-400 ml-2">{s.duration_minutes}min · R${s.price}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-black/8 flex gap-3">
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