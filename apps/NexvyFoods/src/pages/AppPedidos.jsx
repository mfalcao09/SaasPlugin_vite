import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyContext } from '@/context/CompanyContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getStatusConfig, timeSince } from '@/lib/demo-data';
import { ShoppingBag, Phone, MapPin, Clock, ChevronDown, ChevronUp, Truck, RefreshCw } from 'lucide-react';

const STATUS_FLOW = {
  novo: { next: 'aceito', nextLabel: '✓ Aceitar Pedido', nextClass: 'bg-accent text-white', reject: true },
  aceito: { next: 'em_preparo', nextLabel: '🍳 Iniciar Preparo', nextClass: 'bg-blue-600 text-white' },
  em_preparo: { next: 'pronto', nextLabel: '✓ Marcar Pronto', nextClass: 'bg-green-600 text-white' },
  pronto: { next: 'saiu_entrega', nextLabel: '🚚 Saiu para Entrega', nextClass: 'bg-purple-600 text-white' },
  saiu_entrega: { next: 'entregue', nextLabel: '✓ Confirmar Entrega', nextClass: 'bg-emerald-600 text-white' },
};

const TABS = [
  { key: 'novo', label: 'Novos' },
  { key: 'em_preparo', label: 'Em Preparo' },
  { key: 'pronto', label: 'Pronto' },
  { key: 'saiu_entrega', label: 'Em Rota' },
  { key: 'entregue', label: 'Entregues' },
  { key: 'cancelado', label: 'Cancelados' },
];

function OrderCard({ order, onStatusChange, riders }) {
  const [expanded, setExpanded] = useState(order.status === 'novo');
  const [updating, setUpdating] = useState(false);
  const sc = getStatusConfig(order.status);
  const flow = STATUS_FLOW[order.status];

  const handleNext = async () => {
    if (!flow) return;
    setUpdating(true);
    await onStatusChange(order.id, flow.next);
    setUpdating(false);
  };

  const handleReject = async () => {
    setUpdating(true);
    await onStatusChange(order.id, 'recusado');
    setUpdating(false);
  };

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${order.status === 'novo' ? 'border-accent/50 shadow-md' : 'border-border'}`}>
      {order.status === 'novo' && (
        <div className="bg-accent px-4 py-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <p className="text-xs font-bold text-white uppercase tracking-wide">Novo Pedido</p>
          </div>
        </div>
      )}
      <div
        className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-foreground">#{order.order_number}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                {order.type === 'delivery' ? '🚚 Entrega' : '📦 Retirada'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeSince(order.created_date)}</span>
              {order.neighborhood && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{order.neighborhood}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="font-bold text-foreground">R$ {order.total?.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground capitalize">{order.payment_method}</p>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-secondary/10">
          {/* Itens */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens</p>
            <div className="space-y-2">
              {(order.items_summary ? JSON.parse(order.items_summary) : []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium text-foreground">{item.qty}x {item.name}</span>
                    {item.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">Obs: {item.notes}</p>}
                  </div>
                  <span className="text-foreground">R$ {item.total?.toFixed(2)}</span>
                </div>
              ))}
              {!order.items_summary && (
                <p className="text-xs text-muted-foreground italic">Detalhes dos itens não disponíveis</p>
              )}
            </div>
            <div className="border-t border-border mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span>R$ {order.subtotal?.toFixed(2)}</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Taxa de entrega</span><span>R$ {order.delivery_fee?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total</span><span>R$ {order.total?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Endereço */}
          {order.address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-foreground">{order.address}{order.neighborhood ? `, ${order.neighborhood}` : ''}</span>
            </div>
          )}

          {/* Contato */}
          {order.customer_phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{order.customer_phone}</span>
            </div>
          )}

          {/* Observações */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-yellow-800 mb-1">Observações do pedido:</p>
              <p className="text-sm text-yellow-900">{order.notes}</p>
            </div>
          )}

          {/* Ações */}
          {flow && (
            <div className="flex gap-2 pt-2">
              <button
                disabled={updating}
                onClick={handleNext}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity ${flow.nextClass} ${updating ? 'opacity-50' : ''}`}
              >
                {updating ? 'Atualizando...' : flow.nextLabel}
              </button>
              {flow.reject && (
                <button
                  disabled={updating}
                  onClick={handleReject}
                  className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Recusar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppPedidos() {
  const { user, loading: companyLoading } = useCompany();
  const { company } = useCompanyContext();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('novo');
  const [refreshing, setRefreshing] = useState(false);

  useDocumentTitle(company ? `${company.name} | FoodControl AI` : 'FoodControl AI');

  const fetchOrders = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const [ords, rids] = await Promise.all([
        base44.entities.Order.filter({ company_id: user.company_id }, '-created_date', 100),
        base44.entities.Rider.filter({ company_id: user.company_id, active: true }),
      ]);
      setOrders(ords);
      setRiders(rids);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    if (user?.company_id) fetchOrders();
  }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    const updateData = { status: newStatus };
    if (newStatus === 'aceito') updateData.accepted_at = new Date().toISOString();
    if (newStatus === 'entregue') updateData.delivered_at = new Date().toISOString();
    await base44.entities.Order.update(orderId, updateData);
    fetchOrders();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const filtered = orders.filter(o => o.status === activeTab);
  const countByStatus = (s) => orders.filter(o => o.status === s).length;

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{orders.length} total · {orders.filter(o => !['entregue','cancelado','recusado'].includes(o.status)).length} em andamento</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-border rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => {
          const count = countByStatus(tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'bg-accent text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 rounded-full font-bold min-w-[1.25rem] text-center ${
                  isActive ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Carregando pedidos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhum pedido {TABS.find(t => t.key === activeTab)?.label.toLowerCase()}</p>
          </div>
        ) : (
          filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              riders={riders}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
}