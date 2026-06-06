import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useState, useEffect } from 'react';
import { Save, Globe, Copy, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const DAYS = [
  { key: 'seg', label: 'Segunda' }, { key: 'ter', label: 'Terça' }, { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' }, { key: 'sex', label: 'Sexta' }, { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

const defaultHours = Object.fromEntries(DAYS.map(d => [d.key, { open: '09:00', close: '19:00', active: d.key !== 'dom' }]));

export default function AppConfiguracoes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const company = companies.find(c => c.owner_email === user?.email) || companies[0];

  const [form, setForm] = useState({
    name: '', slug: '', phone: '', whatsapp: '', address: '', primary_color: '#1B3A4B', business_hours: defaultHours,
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        slug: company.slug || '',
        phone: company.phone || '',
        whatsapp: company.whatsapp || '',
        address: company.address || '',
        primary_color: company.primary_color || '#1B3A4B',
        business_hours: company.business_hours || defaultHours,
      });
    }
  }, [company]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['companies'] }); toast({ title: 'Configurações salvas!' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Company.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['companies'] }); toast({ title: 'Configurações salvas!' }); },
  });

  const handleSave = () => {
    if (company) updateMutation.mutate({ id: company.id, data: form });
    else createMutation.mutate(form);
  };

  const publicLink = `${window.location.origin}/agendar/${form.slug || 'sua-barbearia'}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setHour = (day, field, val) => {
    setForm(p => ({ ...p, business_hours: { ...p.business_hours, [day]: { ...p.business_hours[day], [field]: val } } }));
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-[#1B1C1E]">Configurações</h1>
          <p className="text-gray-500 text-sm mt-1">Configure sua barbearia e link público de agendamento</p>
        </div>

        {/* Public link */}
        {form.slug && (
          <div className="bg-[#1B3A4B]/5 border border-[#1B3A4B]/20 rounded-2xl p-5 mb-6 flex items-center gap-4">
            <Globe className="w-5 h-5 text-[#1B3A4B] flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-[#1B3A4B] mb-1">Seu link público de agendamento</div>
              <div className="text-sm font-medium text-gray-700 break-all">{publicLink}</div>
            </div>
            <button onClick={copyLink} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0 ${copied ? 'bg-green-100 text-green-700' : 'bg-[#1B3A4B] text-white hover:bg-[#1B3A4B]/90'}`}>
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        )}

        <div className="space-y-6">
          {/* Basic info */}
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-5">Informações básicas</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { label: 'Nome da barbearia', key: 'name', placeholder: 'Ex: Barbearia Studio 47' },
                { label: 'Slug (URL pública)', key: 'slug', placeholder: 'ex: studio47' },
                { label: 'Telefone', key: 'phone', placeholder: '(11) 99999-9999' },
                { label: 'WhatsApp', key: 'whatsapp', placeholder: '11999999999' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                  <input type="text" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-500 block mb-1">Endereço</label>
                <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="Rua, número, bairro, cidade"
                  className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Cor principal</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-black/10 cursor-pointer" />
                  <input type="text" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                    className="flex-1 px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
              </div>
            </div>
          </div>

          {/* Business hours */}
          <div className="bg-white rounded-2xl border border-black/8 p-6">
            <h2 className="font-bold text-[#1B1C1E] mb-5">Horários de funcionamento</h2>
            <div className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const h = form.business_hours[key] || { open: '09:00', close: '19:00', active: false };
                return (
                  <div key={key} className="flex items-center gap-4">
                    <label className="flex items-center gap-2 w-32">
                      <input type="checkbox" checked={h.active} onChange={e => setHour(key, 'active', e.target.checked)} />
                      <span className={`text-sm font-medium ${h.active ? 'text-[#1B1C1E]' : 'text-gray-400'}`}>{label}</span>
                    </label>
                    {h.active ? (
                      <div className="flex items-center gap-2">
                        <input type="time" value={h.open} onChange={e => setHour(key, 'open', e.target.value)}
                          className="px-3 py-1.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                        <span className="text-gray-400 text-sm">até</span>
                        <input type="time" value={h.close} onChange={e => setHour(key, 'close', e.target.value)}
                          className="px-3 py-1.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={handleSave}
            className="flex items-center gap-2 bg-[#1B3A4B] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1B3A4B]/90 transition-colors">
            <Save className="w-4 h-4" />
            Salvar configurações
          </button>
        </div>
      </div>
    </AppLayout>
  );
}