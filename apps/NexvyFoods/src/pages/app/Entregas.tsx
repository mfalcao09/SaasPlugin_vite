import React, { useState, useEffect, useCallback } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Truck, Plus, Pencil, Trash2, X, Phone, MapPin, RefreshCw, User } from 'lucide-react';

interface Rider {
  id: string;
  name: string;
  phone?: string;
  vehicle_type?: string;
  active: boolean;
  company_id: string;
}

interface Order {
  id: string;
  order_number?: string;
  status: string;
  total: number;
  created_at: string;
  endereco?: string;
  bairro?: string;
  rider_id?: string | null;
  customers?: { name: string; phone?: string } | null;
}

const VEHICLE_OPTIONS = [
  { value: 'moto', label: '🏍️ Moto' },
  { value: 'bicicleta', label: '🚲 Bicicleta' },
  { value: 'carro', label: '🚗 Carro' },
];

const STATUS_NEXT: Record<string, string> = {
  em_preparo: 'pronto',
  pronto: 'saiu_entrega',
  saiu_entrega: 'entregue',
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  em_preparo: '✓ Marcar Pronto',
  pronto: '🚚 Saiu para Entrega',
  saiu_entrega: '✓ Confirmar Entrega',
};

const STATUS_COLORS: Record<string, string> = {
  em_preparo: 'bg-blue-100 text-blue-700',
  pronto: 'bg-purple-100 text-purple-700',
  saiu_entrega: 'bg-indigo-100 text-indigo-700',
};

function RiderModal({ rider, companyId, onSave, onClose }: {
  rider?: Rider;
  companyId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: rider?.name ?? '',
    phone: rider?.phone ?? '',
    vehicle_type: rider?.vehicle_type ?? 'moto',
    active: rider?.active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.phone) return;
    setSaving(true);
    const data = { ...form, company_id: companyId };
    if (rider?.id) {
      await db.riders.update(rider.id, data);
    } else {
      await db.riders.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">{rider ? 'Editar Motoboy' : 'Novo Motoboy'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome *</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Nome completo"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telefone *</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="(11) 9 9999-9999"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Veículo</label>
            <select
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
              value={form.vehicle_type}
              onChange={e => setForm({ ...form, vehicle_type: e.target.value })}
            >
              {VEHICLE_OPTIONS.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setForm({ ...form, active: !form.active })}
              className={`w-10 h-6 rounded-full transition-colors relative ${form.active ? 'bg-green-500' : 'bg-secondary'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-foreground">Ativo</span>
          </label>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.phone}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Entregas() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [editingRider, setEditingRider] = useState<Rider | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!company?.id) return;
    const [{ data: ords }, { data: rids }] = await Promise.all([
      db.orders.listActive(company.id),
      db.riders.list(company.id),
    ]);
    setOrders((ords ?? []).filter((o: Order) =>
      ['em_preparo', 'pronto', 'saiu_entrega'].includes(o.status)
    ));
    setRiders(rids ?? []);
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load, company?.id]);

  const handleAssignRider = async (orderId: string, riderId: string | null) => {
    await db.orders.update(orderId, { rider_id: riderId });
    await load();
  };

  const handleAdvanceStatus = async (order: Order) => {
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    await db.orders.update(order.id, { status: next });
    await load();
  };

  const activeRiders = riders.filter(r => r.active);

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} pedidos ativos · {activeRiders.length} motoboys disponíveis
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditingRider(undefined); setShowRiderModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Motoboy
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Pedidos ativos */}
        <div className="md:col-span-2 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Pedidos em andamento
          </p>
          {orders.length === 0 ? (
            <div className="py-12 text-center bg-white border border-dashed border-border rounded-xl">
              <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-semibold text-foreground">Sem pedidos em andamento</p>
              <p className="text-sm text-muted-foreground mt-1">Pedidos aceitos aparecerão aqui.</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="bg-white border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-foreground">#{order.order_number ?? order.id.slice(0, 6)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-secondary text-muted-foreground'}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{order.customers?.name ?? 'Cliente'}</p>
                    {order.customers?.phone && (
                      <a href={`tel:${order.customers.phone}`} className="text-xs text-accent flex items-center gap-1 mt-0.5 hover:underline">
                        <Phone className="w-3 h-3" />{order.customers.phone}
                      </a>
                    )}
                    {order.endereco && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{order.endereco}
                      </p>
                    )}
                  </div>
                  <p className="font-bold text-foreground flex-shrink-0">R$ {(order.total ?? 0).toFixed(2)}</p>
                </div>

                {/* Vincular motoboy */}
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <select
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
                    value={order.rider_id ?? ''}
                    onChange={e => handleAssignRider(order.id, e.target.value || null)}
                  >
                    <option value="">— Sem motoboy —</option>
                    {activeRiders.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                {/* Avançar status */}
                {STATUS_NEXT[order.status] && (
                  <button
                    onClick={() => handleAdvanceStatus(order)}
                    className="w-full py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 transition-colors"
                  >
                    {STATUS_NEXT_LABEL[order.status]}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Painel de motoboys */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motoboys</p>
          {riders.length === 0 ? (
            <div className="py-8 text-center bg-white border border-dashed border-border rounded-xl">
              <p className="text-sm text-muted-foreground">Nenhum motoboy cadastrado</p>
            </div>
          ) : (
            riders.map(rider => (
              <div
                key={rider.id}
                className={`bg-white border border-border rounded-xl p-4 ${!rider.active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{rider.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rider.active ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}>
                        {rider.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {rider.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />{rider.phone}
                      </p>
                    )}
                    {rider.vehicle_type && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {VEHICLE_OPTIONS.find(v => v.value === rider.vehicle_type)?.label ?? rider.vehicle_type}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {orders.filter(o => o.rider_id === rider.id).length} entrega(s) ativas
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingRider(rider); setShowRiderModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Excluir motoboy?')) return;
                        await db.riders.delete(rider.id);
                        await load();
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showRiderModal && company?.id && (
        <RiderModal
          rider={editingRider}
          companyId={company.id}
          onSave={() => { setShowRiderModal(false); load(); }}
          onClose={() => setShowRiderModal(false)}
        />
      )}
    </div>
  );
}
