import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { Truck, Plus, Pencil, Trash2, X, Phone, MapPin } from 'lucide-react';

const vehicleOptions = [
  { value: 'moto', label: '🏍️ Moto' },
  { value: 'bicicleta', label: '🚲 Bicicleta' },
  { value: 'carro', label: '🚗 Carro' },
];

function RiderModal({ rider, companyId, onSave, onClose }) {
  const [form, setForm] = useState({
    name: rider?.name || '',
    phone: rider?.phone || '',
    vehicle_type: rider?.vehicle_type || 'moto',
    active: rider?.active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.phone) return;
    setSaving(true);
    const data = { ...form, company_id: companyId };
    if (rider?.id) {
      await base44.entities.Rider.update(rider.id, data);
    } else {
      await base44.entities.Rider.create(data);
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
              {vehicleOptions.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm({ ...form, active: e.target.checked })}
              className="rounded border-border w-4 h-4 accent-accent"
            />
            <span className="text-sm text-foreground">Ativo (disponível para entregas)</span>
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

export default function AppEntregas() {
  const { user, loading: companyLoading } = useCompany();
  const [riders, setRiders] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riderModal, setRiderModal] = useState(null);

  const fetchData = async () => {
    if (!user?.company_id) return;
    const [rids, ords, zns] = await Promise.all([
      base44.entities.Rider.filter({ company_id: user.company_id }, 'name'),
      base44.entities.Order.filter({ company_id: user.company_id, status: 'saiu_entrega' }),
      base44.entities.DeliveryZone.filter({ company_id: user.company_id, active: true }, 'name'),
    ]);
    setRiders(rids);
    setActiveOrders(ords);
    setZones(zns);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.company_id) fetchData();
  }, [user?.company_id]);

  const handleToggle = async (rider) => {
    await base44.entities.Rider.update(rider.id, { active: !rider.active });
    fetchData();
  };

  const handleDelete = async (id) => {
    await base44.entities.Rider.delete(id);
    fetchData();
  };

  const handleMarkDelivered = async (orderId) => {
    await base44.entities.Order.update(orderId, { status: 'entregue', delivered_at: new Date().toISOString() });
    fetchData();
  };

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
          <p className="text-sm text-muted-foreground mt-0.5">{riders.filter(r => r.active).length} motoboys ativos · {activeOrders.length} pedidos em rota</p>
        </div>
        <button
          onClick={() => setRiderModal({})}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Motoboy
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Motoboys */}
        <div>
          <h2 className="font-semibold text-foreground mb-3">Equipe de Entrega</h2>
          {riders.length === 0 ? (
            <div className="py-12 text-center bg-white border border-border rounded-xl">
              <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground mb-3">Nenhum motoboy cadastrado</p>
              <button onClick={() => setRiderModal({})} className="text-sm text-accent hover:underline">
                Cadastrar primeiro motoboy
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {riders.map(rider => (
                <div key={rider.id} className={`bg-white border border-border rounded-xl p-4 ${!rider.active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${rider.active ? 'bg-accent/10' : 'bg-secondary'}`}>
                        {vehicleOptions.find(v => v.value === rider.vehicle_type)?.label.split(' ')[0] || '🏍️'}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{rider.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{rider.vehicle_type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rider.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {rider.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleToggle(rider)} className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors text-xs text-muted-foreground">
                        {rider.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button onClick={() => setRiderModal(rider)} className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(rider.id)} className="p-2 border border-border rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span>{rider.phone}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Em Rota + Zonas */}
        <div className="space-y-6">
          <div>
            <h2 className="font-semibold text-foreground mb-3">Pedidos em Rota</h2>
            {activeOrders.length === 0 ? (
              <div className="py-10 text-center bg-white border border-border rounded-xl">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">Nenhum pedido em rota agora</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeOrders.map(order => (
                  <div key={order.id} className="bg-white border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground text-sm">#{order.order_number}</p>
                        {order.address && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{order.address}
                          </p>
                        )}
                      </div>
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">Em Rota</span>
                    </div>
                    <button
                      onClick={() => handleMarkDelivered(order.id)}
                      className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                    >
                      ✓ Confirmar Entrega
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zonas */}
          {zones.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-3">Zonas de Entrega</h2>
              <div className="bg-white border border-border rounded-xl overflow-hidden">
                {zones.map((zone, i) => (
                  <div key={zone.id} className={`flex items-center justify-between px-4 py-3 ${i < zones.length - 1 ? 'border-b border-border' : ''}`}>
                    <p className="text-sm font-medium text-foreground">{zone.name}</p>
                    <div className="flex items-center gap-4">
                      {zone.estimated_minutes && <span className="text-xs text-muted-foreground">{zone.estimated_minutes} min</span>}
                      <span className="text-sm font-semibold text-foreground">R$ {zone.fee?.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {riderModal !== null && (
        <RiderModal
          rider={riderModal.id ? riderModal : null}
          companyId={user?.company_id}
          onSave={() => { setRiderModal(null); fetchData(); }}
          onClose={() => setRiderModal(null)}
        />
      )}
    </div>
  );
}