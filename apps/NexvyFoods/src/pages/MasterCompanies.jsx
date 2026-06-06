import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useCompanyContext } from '@/context/CompanyContext';
import { ChevronLeft } from 'lucide-react';

export default function MasterCompanies() {
  const navigate = useNavigate();
  const { appConfig, isSuperAdmin, loading: ctxLoading } = useCompanyContext();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', phone: '', whatsapp: '', address: '' });

  useDocumentTitle('Master | FoodControl AI');

  useEffect(() => {
    if (ctxLoading || appConfig === undefined) return;
    if (!isSuperAdmin) {
      navigate('/app/dashboard');
    }
  }, [ctxLoading, appConfig, isSuperAdmin, navigate]);

  const generateSlug = (name) =>
    name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.slug) return;
    setLoading(true);
    await base44.entities.Company.create({ ...form, status: 'ativo', onboarding_step: 0, onboarding_completed: false });
    navigate('/master/dashboard');
  };

  return (
    <div className="p-6 max-w-2xl">
      <Link to="/master/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ChevronLeft className="w-4 h-4" /> Voltar ao Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Nova Empresa</h1>
        <p className="text-sm text-muted-foreground mt-1">Cadastre um novo cliente na plataforma</p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome do Estabelecimento *</label>
            <input
              required
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Ex: Hamburgueria do Zé"
              value={form.name}
              onChange={e => {
                const name = e.target.value;
                setForm({ ...form, name, slug: form.slug || generateSlug(name) });
              }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Slug (URL) *</label>
            <div className="flex items-center border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent/30">
              <span className="px-3 py-2.5 bg-secondary text-xs text-muted-foreground border-r border-border whitespace-nowrap">/pedido/</span>
              <input
                required
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                placeholder="hamburgueria-ze"
                value={form.slug}
                onChange={e => setForm({ ...form, slug: generateSlug(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telefone</label>
              <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">WhatsApp</label>
              <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Endereço</label>
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Rua, número, bairro, cidade" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/master/dashboard')} className="flex-1 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="submit" disabled={loading || !form.name || !form.slug} className="flex-1 py-3 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50">
              {loading ? 'Criando...' : 'Criar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}