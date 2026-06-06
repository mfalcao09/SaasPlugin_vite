import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Scissors, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { id: 1, title: 'Dados da barbearia', sub: 'Informações básicas do negócio' },
  { id: 2, title: 'Branding', sub: 'Identidade visual e link público' },
  { id: 3, title: 'Serviços iniciais', sub: 'Configure seus primeiros serviços' },
  { id: 4, title: 'Profissionais', sub: 'Adicione os barbeiros' },
  { id: 5, title: 'Equipe', sub: 'Quem vai acessar o sistema' },
  { id: 6, title: 'Conclusão', sub: 'Sua barbearia está pronta!' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [company, setCompany] = useState({ name: '', phone: '', whatsapp: '', address: '', slug: '', primary_color: '#1B3A4B' });
  const [services, setServices] = useState([{ name: 'Corte Clássico', duration_minutes: 30, price: 45 }]);
  const [professionals, setProfessionals] = useState([{ name: '', specialty: '' }]);
  const [companyId, setCompanyId] = useState(null);

  const createCompanyMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.create(data),
    onSuccess: (result) => {
      setCompanyId(result.id);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: (data) => base44.entities.Service.create(data),
  });

  const createProMutation = useMutation({
    mutationFn: (data) => base44.entities.Professional.create(data),
  });

  const handleNext = async () => {
    if (step === 2 && !companyId) {
      const result = await createCompanyMutation.mutateAsync({
        ...company,
        status: 'active',
        onboarding_step: 2,
        onboarding_completed: false,
      });
      setCompanyId(result.id);
    }
    if (step === 3 && companyId) {
      for (const s of services.filter(s => s.name)) {
        await createServiceMutation.mutateAsync({ ...s, company_id: companyId, active: true });
      }
    }
    if (step === 4 && companyId) {
      for (const p of professionals.filter(p => p.name)) {
        await createProMutation.mutateAsync({ ...p, company_id: companyId, active: true });
      }
      await base44.entities.Company.update(companyId, { onboarding_completed: true, onboarding_step: 6 });
    }
    if (step === 6) {
      navigate('/app/dashboard');
      return;
    }
    setStep(s => s + 1);
  };

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex font-inter">
      {/* Sidebar */}
      <div className="w-72 bg-[#1B3A4B] min-h-screen p-8 flex flex-col">
        <div className="flex items-center gap-2.5 mb-12">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">BarbeiroPro AI</span>
        </div>
        <div className="space-y-2">
          {STEPS.map(s => (
            <div key={s.id} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${s.id === step ? 'bg-white/15' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-all ${s.id < step ? 'bg-white/90 text-[#1B3A4B]' : s.id === step ? 'bg-white text-[#1B3A4B]' : 'bg-white/20 text-white/50'}`}>
                {s.id < step ? <Check className="w-3.5 h-3.5" /> : s.id}
              </div>
              <div>
                <div className={`text-sm font-semibold ${s.id <= step ? 'text-white' : 'text-white/40'}`}>{s.title}</div>
                <div className={`text-xs mt-0.5 ${s.id === step ? 'text-white/70' : 'text-white/30'}`}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 p-12 flex flex-col">
        <div className="max-w-lg flex-1">
          <div className="mb-8">
            <div className="text-xs font-semibold text-[#1B3A4B] uppercase tracking-widest mb-2">Etapa {step} de {STEPS.length}</div>
            <h1 className="text-3xl font-black text-[#1B1C1E]">{STEPS[step - 1].title}</h1>
            <p className="text-gray-500 mt-1">{STEPS[step - 1].sub}</p>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              {[
                { label: 'Nome da barbearia *', key: 'name', placeholder: 'Ex: Barbearia Studio 47' },
                { label: 'Telefone', key: 'phone', placeholder: '(11) 99999-9999' },
                { label: 'WhatsApp', key: 'whatsapp', placeholder: '11999999999' },
                { label: 'Endereço', key: 'address', placeholder: 'Rua, número, bairro, cidade' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                  <input type="text" value={company[f.key]} onChange={e => setCompany(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 bg-white" />
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Slug (URL pública) *</label>
                <div className="flex items-center bg-white border border-black/10 rounded-xl overflow-hidden">
                  <span className="px-4 py-3 text-gray-400 text-sm border-r border-black/10 bg-gray-50">/agendar/</span>
                  <input type="text" value={company.slug} onChange={e => setCompany(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                    placeholder="studio47"
                    className="flex-1 px-4 py-3 text-sm focus:outline-none" />
                </div>
                {company.slug && <p className="text-xs text-[#1B3A4B] mt-1">Link: {window.location.origin}/agendar/{company.slug}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Cor principal</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={company.primary_color} onChange={e => setCompany(p => ({ ...p, primary_color: e.target.value }))}
                    className="w-12 h-12 rounded-xl border border-black/10 cursor-pointer" />
                  <div>
                    <div className="text-sm font-semibold text-[#1B1C1E]">{company.primary_color}</div>
                    <div className="text-xs text-gray-400">Cor dos botões e destaques no link público</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {services.map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-black/10 p-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Nome</label>
                      <input type="text" value={s.name} onChange={e => setServices(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Preço (R$)</label>
                      <input type="number" value={s.price} onChange={e => setServices(arr => arr.map((x, j) => j === i ? { ...x, price: +e.target.value } : x))}
                        className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Duração (min)</label>
                    <input type="number" value={s.duration_minutes} onChange={e => setServices(arr => arr.map((x, j) => j === i ? { ...x, duration_minutes: +e.target.value } : x))}
                      className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none" />
                  </div>
                </div>
              ))}
              <button onClick={() => setServices(p => [...p, { name: '', duration_minutes: 30, price: 0 }])}
                className="w-full py-2.5 border-2 border-dashed border-black/15 rounded-xl text-sm text-gray-400 hover:border-[#1B3A4B] hover:text-[#1B3A4B] transition-colors">
                + Adicionar serviço
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {professionals.map((p, i) => (
                <div key={i} className="bg-white rounded-xl border border-black/10 p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Nome</label>
                    <input type="text" value={p.name} onChange={e => setProfessionals(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Especialidade</label>
                    <input type="text" value={p.specialty} onChange={e => setProfessionals(arr => arr.map((x, j) => j === i ? { ...x, specialty: e.target.value } : x))}
                      className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none" />
                  </div>
                </div>
              ))}
              <button onClick={() => setProfessionals(p => [...p, { name: '', specialty: '' }])}
                className="w-full py-2.5 border-2 border-dashed border-black/15 rounded-xl text-sm text-gray-400 hover:border-[#1B3A4B] hover:text-[#1B3A4B] transition-colors">
                + Adicionar profissional
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="bg-white rounded-2xl border border-black/8 p-6 text-center">
              <p className="text-gray-500 text-sm">Você pode convidar membros da equipe mais tarde em <strong>Equipe</strong> no painel.</p>
            </div>
          )}

          {step === 6 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-black text-[#1B1C1E] mb-3">Tudo pronto!</h2>
              <p className="text-gray-500 mb-6">Sua barbearia está configurada e o link público de agendamento está ativo.</p>
              {company.slug && (
                <div className="bg-[#1B3A4B]/5 border border-[#1B3A4B]/20 rounded-xl p-4 text-sm text-[#1B3A4B] font-medium mb-6">
                  {window.location.origin}/agendar/{company.slug}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-8 max-w-lg">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1B1C1E]">
              <ArrowLeft className="w-4 h-4" />Voltar
            </button>
          ) : <div />}
          <button onClick={handleNext} disabled={step === 1 && !company.name}
            className="flex items-center gap-2 bg-[#1B3A4B] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1B3A4B]/90 disabled:opacity-50 transition-colors">
            {step === 6 ? 'Acessar o painel' : 'Continuar'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}