import React, { useState, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Trash2 } from 'lucide-react';

interface FinancialEntry {
  id: string;
  type: 'entrada' | 'saida';
  description: string;
  amount: number;
  date: string;
  status?: string;
  company_id: string;
}

interface Order {
  id: string;
  status: string;
  total: number;
  taxa_entrega?: number;
  delivery_fee?: number;
  created_at: string;
}

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function EntryModal({ companyId, onSave, onClose }: {
  companyId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    type: 'saida' as 'entrada' | 'saida',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    status: 'pago',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    await db.financialEntries.create({
      ...form,
      amount: parseFloat(form.amount),
      company_id: companyId,
    });
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
            {(['entrada', 'saida'] as const).map(t => (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  form.type === t
                    ? t === 'entrada' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {t === 'entrada' ? '↑ Entrada' : '↓ Saída'}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Descrição *</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Ex: Insumos de cozinha"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="0,00"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Data</label>
              <input
                type="date"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Status</label>
            <select
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="agendado">Agendado</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.description || !form.amount}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Financeiro() {
  const { company, loading: companyLoading } = useCompanyContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    if (!company?.id) return;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const [{ data: ents }, { data: allOrders }] = await Promise.all([
      db.financialEntries.listByMonth(company.id, year, month),
      db.orders.list(company.id),
    ]);
    setEntries(ents ?? []);
    setOrders((allOrders ?? []).filter((o: Order) => o.created_at?.startsWith(monthStr)));
  };

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
  }, [company?.id, year, month]);

  const paidOrders = orders.filter(o => !['cancelado', 'recusado'].includes(o.status));
  const orderRevenue = paidOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const deliveryFees = paidOrders.reduce((s, o) => s + (o.delivery_fee ?? o.taxa_entrega ?? 0), 0);
  const manualEntradas = entries.filter(e => e.type === 'entrada').reduce((s, e) => s + (e.amount ?? 0), 0);
  const saidas = entries.filter(e => e.type === 'saida').reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalReceita = orderRevenue + manualEntradas;
  const saldo = totalReceita - saidas;

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Lançamento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Receita de pedidos', value: orderRevenue, icon: TrendingUp, color: 'bg-green-100', iconColor: 'text-green-600' },
          { label: 'Taxas de entrega', value: deliveryFees, icon: DollarSign, color: 'bg-blue-100', iconColor: 'text-blue-600' },
          { label: 'Despesas', value: saidas, icon: TrendingDown, color: 'bg-red-100', iconColor: 'text-red-500' },
          { label: 'Saldo do mês', value: saldo, icon: DollarSign, color: saldo >= 0 ? 'bg-green-100' : 'bg-red-100', iconColor: saldo >= 0 ? 'text-green-600' : 'text-red-500' },
        ].map(({ label, value, icon: Icon, color, iconColor }) => (
          <div key={label} className={`border rounded-xl p-4 ${saldo < 0 && label === 'Saldo do mês' ? 'bg-red-50 border-red-200' : saldo >= 0 && label === 'Saldo do mês' ? 'bg-green-50 border-green-200' : 'bg-white border-border'}`}>
            <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <p className={`text-xl font-bold ${label === 'Saldo do mês' ? (saldo >= 0 ? 'text-green-700' : 'text-red-600') : 'text-foreground'}`}>
              R$ {value.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Resumo de pedidos do mês */}
      <div className="bg-white border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-3">Pedidos do mês</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-foreground">{orders.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{paidOrders.length}</p>
            <p className="text-xs text-muted-foreground">Concluídos</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-500">
              {orders.filter(o => ['cancelado', 'recusado'].includes(o.status)).length}
            </p>
            <p className="text-xs text-muted-foreground">Cancelados</p>
          </div>
        </div>
      </div>

      {/* Lançamentos manuais */}
      <div className="bg-white border border-border rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Lançamentos manuais</h2>
          <span className="text-xs text-muted-foreground">{entries.length} registros</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nenhum lançamento neste mês.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${e.type === 'entrada' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {e.type === 'entrada'
                      ? <TrendingUp className="w-4 h-4 text-green-600" />
                      : <TrendingDown className="w-4 h-4 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      {e.status && e.status !== 'pago' && ` · ${e.status}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-bold text-sm ${e.type === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                    {e.type === 'entrada' ? '+' : '−'}R$ {e.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={async () => {
                      if (!confirm('Excluir lançamento?')) return;
                      await db.financialEntries.delete(e.id);
                      await load();
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && company?.id && (
        <EntryModal
          companyId={company.id}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
