import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, ChefHat } from 'lucide-react';

const steps = [
  { id: 1, title: 'Dados do Negócio', desc: 'Informações básicas do estabelecimento' },
  { id: 2, title: 'Cardápio Inicial', desc: 'Crie suas primeiras categorias' },
  { id: 3, title: 'Zonas de Entrega', desc: 'Defina bairros e taxas de entrega' },
  { id: 4, title: 'Conclusão', desc: 'Ative sua conta e comece a vender' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [company, setCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form1, setForm1] = useState({ name: '', slug: '', phone: '', whatsapp: '', address: '' });
  const [categories, setCategories] = useState([{ name: '' }]);
  const [zones, setZones] = useState([{ name: '', fee: '' }]);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.company_id) {
        base44.entities.Company.filter({ id: u.company_id }).then(res => {
          if (res.length > 0) {
            const c = res[0];
            setCompany(c);
            setForm1({ name: c.name || '', slug: c.slug || '', phone: c.phone || '', whatsapp: c.whatsapp || '', address: c.address || '' });
            if (c.onboarding_completed) navigate('/app/dashboard');
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const generateSlug = (name) =>
    name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleStep1 = async () => {
    if (!form1.name || !form1.slug) return;
    setSaving(true);
    try {
      if (company?.id) {
        await base44.entities.Company.update(company.id, { ...form1, onboarding_step: 2, status: 'ativo' });
      } else {
        const c = await base44.entities.Company.create({ ...form1, status: 'ativo', onboarding_step: 2, onboarding_completed: false });
        setCompany(c);
        await base44.auth.updateMe({ company_id: c.id });
      }
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  const handleStep2 = async () => {
    setSaving(true);
    try {
      const validCats = categories.filter(c => c.name.trim());
      if (company?.id && validCats.length > 0) {
        await Promise.all(validCats.map((c, i) =>
          base44.entities.MenuCategory.create({ company_id: company.id, name: c.name, sort_order: i, active: true })
        ));
        await base44.entities.Company.update(company.id, { onboarding_step: 3 });
      }
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  const handleStep3 = async () => {
    setSaving(true);
    try {
      const validZones = zones.filter(z => z.name.trim() && z.fee !== '');
      if (company?.id && validZones.length > 0) {
        await Promise.all(validZones.map(z =>
          base44.entities.DeliveryZone.create({ company_id: company.id, name: z.name, fee: parseFloat(z.fee), active: true })
        ));
        await base44.entities.Company.update(company.id, { onboarding_step: 4 });
      }
      setStep(4);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      if (company?.id) {
        await base44.entities.Company.update(company.id, { onboarding_completed: true, onboarding_step: 6 });
      }
      navigate('/app/dashboard');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-foreground text-xl">FoodControl AI</span>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                  s.id < step ? 'bg-accent border-accent' : s.id === step ? 'border-accent bg-white' : 'border-border bg-white'
                }`}>
                  {s.id < step
                    ? <Check className="w-4 h-4 text-white" />
                    : <span className={`text-sm font-bold ${s.id === step ? 'text-accent' : 'text-muted-foreground'}`}>{s.id}</span>
                  }
                </div>
                <p className={`text-xs mt-1.5 font-medium hidden sm:block ${s.id === step ? 'text-foreground' : 'text-muted-foreground'}`}>{s.title}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px mx-2 mt-[-10px] ${s.id < step ? 'bg-accent' : 'bg-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-border rounded-2xl p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">{steps[step - 1].title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{steps[step - 1].desc}</p>
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome do Estabelecimento *</label>
                <input
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="Ex: Hamburgueria do Zé"
                  value={form1.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm1({ ...form1, name, slug: form1.slug || generateSlug(name) });
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Slug (URL do cardápio) *</label>
                <div className="flex items-center border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent/30">
                  <span className="px-3 py-2.5 bg-secondary text-xs text-muted-foreground border-r border-border whitespace-nowrap">foodcontrol.app/pedido/</span>
                  <input
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    placeholder="hamburgueria-ze"
                    value={form1.slug}
                    onChange={e => setForm1({ ...form1, slug: generateSlug(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telefone</label>
                  <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form1.phone} onChange={e => setForm1({ ...form1, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">WhatsApp</label>
                  <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form1.whatsapp} onChange={e => setForm1({ ...form1, whatsapp: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Endereço</label>
                <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Rua das Flores, 123 — Bairro, Cidade" value={form1.address} onChange={e => setForm1({ ...form1, address: e.target.value })} />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Crie as categorias do seu cardápio. Você pode adicionar produtos depois.</p>
              {categories.map((cat, i) => (
                <input
                  key={i}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder={`Ex: ${['Hambúrgueres', 'Pizzas', 'Bebidas', 'Sobremesas'][i] || 'Categoria'}`}
                  value={cat.name}
                  onChange={e => {
                    const updated = [...categories];
                    updated[i] = { name: e.target.value };
                    setCategories(updated);
                  }}
                />
              ))}
              <button
                onClick={() => setCategories([...categories, { name: '' }])}
                className="w-full py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-accent/30 hover:text-foreground transition-colors"
              >
                + Adicionar Categoria
              </button>
              <p className="text-xs text-muted-foreground">Você pode pular esta etapa e criar categorias depois em Cardápio.</p>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Defina os bairros ou regiões que você atende e as taxas de entrega.</p>
              {zones.map((zone, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <input
                    className="border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    placeholder={`Bairro (ex: Centro)`}
                    value={zone.name}
                    onChange={e => { const z = [...zones]; z[i] = { ...z[i], name: e.target.value }; setZones(z); }}
                  />
                  <input
                    type="number" step="0.01"
                    className="border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    placeholder="Taxa R$"
                    value={zone.fee}
                    onChange={e => { const z = [...zones]; z[i] = { ...z[i], fee: e.target.value }; setZones(z); }}
                  />
                </div>
              ))}
              <button
                onClick={() => setZones([...zones, { name: '', fee: '' }])}
                className="w-full py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-accent/30 transition-colors"
              >
                + Adicionar Zona
              </button>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-bold text-foreground">Tudo pronto!</h2>
              <p className="text-muted-foreground text-sm">
                Sua conta está configurada. Agora você pode montar o cardápio completo, cadastrar produtos e começar a receber pedidos.
              </p>
              {company?.slug && (
                <div className="bg-secondary rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Seu link de pedidos:</p>
                  <p className="font-mono text-sm font-semibold text-accent break-all">
                    foodcontrol.app/pedido/{company.slug}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            {step > 1 && step < 4 && (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            <button
              disabled={saving || (step === 1 && (!form1.name || !form1.slug))}
              onClick={step === 1 ? handleStep1 : step === 2 ? handleStep2 : step === 3 ? handleStep3 : handleFinish}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-accent/90 transition-colors"
            >
              {saving ? 'Salvando...' : step === 4 ? 'Ir para o Painel →' : (<>Continuar <ChevronRight className="w-4 h-4" /></>)}
            </button>
          </div>

          {step < 4 && (
            <button onClick={() => setStep(step + 1)} className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
              Pular esta etapa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}