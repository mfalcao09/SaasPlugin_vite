import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { TrendingUp, TrendingDown, DollarSign, Plus, X, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function EntryModal({ companyId, onSave, onClose }) {
  const [form, setForm] = useState({ type: 'saida', description: '', amount: '', date: new Date().toISOString().split('T')[0], status: 'pago' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    await base44.entities.FinancialEntry.create({ ...form, amount: parseFloat(form.amount), company_id: companyId });
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">Nova Movimentação</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            {[{ key: 'entrada', label: 'Entrada' }, { key: 'saida', label: 'Saída' }].map(t => (
              <button
                key={t.key}
                onClick={() => setForm({ ...form, type: t.key })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${form.type === t.key ? (t.key === 'entrada' ? 'bg-green-600 text-white' : 'bg-red-500 text-white') : 'bg-secondary text-muted-foreground'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Descrição *</label>
            <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Ex: Insumos de cozinha" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Valor (R$) *</label>
              <input type="number" step="0.01" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="0,00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Data</label>
              <input type="date" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.description || !form.amount} className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppFinanceiro() {
  const { user, loading: companyLoading } = useCompany();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [showModal, setShowModal] = useState(false);

  const fetchData = async () => {
    if (!user?.company_id) return;
    const res = await base44.entities.FinancialEntry.filter({ company_id: user.company_id }, '-date', 100);
    setEntries(res);
    setLoading(false);
  };

  useEffect(() => { if (user?.company_id) fetchData(); }, [user?.company_id]);

  const entradas = entries.filter(e => e.type === 'entrada').reduce((s, e) => s + (e.amount || 0), 0);
  const saidas = entries.filter(e => e.type === 'saida').reduce((s, e) => s + (e.amount || 0), 0);
  const saldo = entradas - saidas;

  const filtered = filter === 'todos' ? entries : entries.filter(e => e.type === filter);

  if (companyLoading || loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{entries.length} movimentações registradas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Entrada
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><TrendingUp className="w-4 h-4 text-green-600" /><ArrowUpRight className="w-4 h-4 text-green-600" /></div>
          <p className="text-2xl font-bold text-foreground">R$ {entradas.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Entradas</p>
        </div>
        <div className="bg-white border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><TrendingDown className="w-4 h-4 text-red-500" /><ArrowDownRight className="w-4 h-4 text-red-500" /></div>
          <p className="text-2xl font-bold text-foreground">R$ {saidas.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Saídas</p>
        </div>
        <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <DollarSign className={`w-4 h-4 mb-2 ${saldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
          <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>R$ {saldo.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Saldo</p>
        </div>
      </div>

      <div className="flex gap-2">
        {[{ key: 'todos', label: 'Todos' }, { key: 'entrada', label: 'Entradas' }, { key: 'saida', label: 'Saídas' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-foreground text-background' : 'bg-white border border-border text-muted-foreground hover:text-foreground'}`}>{f.label}</button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="py-20 text-center">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Nenhuma movimentação</h2>
          <p className="text-sm text-muted-foreground">As entradas de pedidos pagos aparecerão aqui automaticamente.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {filtered.map((entry, i) => (
            <div key={entry.id} className={`flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors ${i < filtered.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${entry.type === 'entrada' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {entry.type === 'entrada' ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.date}</p>
                </div>
              </div>
              <p className={`font-bold ${entry.type === 'entrada' ? 'text-green-700' : 'text-red-600'}`}>
                {entry.type === 'entrada' ? '+' : '-'} R$ {entry.amount?.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal && <EntryModal companyId={user?.company_id} onSave={() => { setShowModal(false); fetchData(); }} onClose={() => setShowModal(false)} />}
    </div>
  );
}