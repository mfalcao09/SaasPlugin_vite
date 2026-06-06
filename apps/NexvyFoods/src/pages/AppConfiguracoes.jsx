import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { Save, Copy, Check, ExternalLink, Plus, Trash2 } from 'lucide-react';

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default function AppConfiguracoes() {
  const { company, user, loading: companyLoading, refetch } = useCompany();
  const [form, setForm] = useState({});
  const [zones, setZones] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        phone: company.phone || '',
        whatsapp: company.whatsapp || '',
        address: company.address || '',
        primary_color: company.primary_color || '#a1522c',
        average_prep_time: company.average_prep_time || 30,
      });
    }
  }, [company]);

  useEffect(() => {
    if (user?.company_id) {
      base44.entities.DeliveryZone.filter({ company_id: user.company_id }, 'name')
        .then(setZones)
        .catch(console.error);
    }
  }, [user?.company_id]);

  const handleSave = async () => {
    if (!company?.id) return;
    setSaving(true);
    await base44.entities.Company.update(company.id, form);
    await refetch();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pedido/${company?.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddZone = async () => {
    if (!user?.company_id) return;
    const z = await base44.entities.DeliveryZone.create({ company_id: user.company_id, name: 'Nova Zona', fee: 0, active: true });
    setZones([...zones, z]);
  };

  const handleUpdateZone = async (id, data) => {
    await base44.entities.DeliveryZone.update(id, data);
    setZones(zones.map(z => z.id === id ? { ...z, ...data } : z));
  };

  const handleDeleteZone = async (id) => {
    await base44.entities.DeliveryZone.delete(id);
    setZones(zones.filter(z => z.id !== id));
  };

  if (companyLoading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  if (!company) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">Configurações</h1>
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-5">
          <p className="text-sm text-foreground mb-3">Você ainda não tem uma empresa configurada.</p>
          <a href="/onboarding" className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">
            Iniciar Onboarding →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{company.name}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      {/* Link Público */}
      <div className="bg-white border border-border rounded-xl p-5">
        <h2 className="font-bold text-foreground mb-3">Link Público de Pedidos</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-secondary rounded-xl px-4 py-3">
            <p className="font-mono text-sm text-accent break-all">{window.location.origin}/pedido/{company.slug}</p>
          </div>
          <button onClick={handleCopyLink} className="flex items-center gap-2 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-medium flex-shrink-0 hover:bg-foreground/90 transition-colors">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <a href={`/pedido/${company.slug}`} target="_blank" rel="noopener noreferrer" className="p-3 border border-border rounded-xl hover:bg-secondary transition-colors">
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Dados da Empresa */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-foreground">Dados da Empresa</h2>
          <Field label="Nome do Estabelecimento">
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp">
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form.whatsapp || ''} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
          </Field>
          <Field label="Endereço">
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Rua..." value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Tempo Médio de Preparo (min)">
            <input type="number" min="5" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" value={form.average_prep_time || 30} onChange={e => setForm({ ...form, average_prep_time: parseInt(e.target.value) })} />
          </Field>
        </div>

        {/* Zonas de Entrega */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">Zonas de Entrega</h2>
            <button onClick={handleAddZone} className="flex items-center gap-1 text-xs text-accent font-medium hover:underline">
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          {zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma zona configurada.</p>
          ) : (
            <div className="space-y-2">
              {zones.map(zone => (
                <div key={zone.id} className="flex items-center gap-2">
                  <input
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    placeholder="Bairro/Região"
                    value={zone.name}
                    onChange={e => handleUpdateZone(zone.id, { name: e.target.value })}
                  />
                  <input
                    type="number" step="0.01"
                    className="w-24 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    placeholder="Taxa R$"
                    value={zone.fee || ''}
                    onChange={e => handleUpdateZone(zone.id, { fee: parseFloat(e.target.value) })}
                  />
                  <button onClick={() => handleDeleteZone(zone.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}