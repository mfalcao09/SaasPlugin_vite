import React, { useState, useEffect, useCallback } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Clock, MapPin, ChevronDown, ChevronUp, RefreshCw, Phone } from 'lucide-react';

interface OrderItem {
  nome: string;
  qty: number;
  preco: number;
  obs?: string;
}

interface Order {
  id: string;
  order_number?: string;
  status: string;
  type: 'delivery' | 'retirada';
  total: number;
  subtotal?: number;
  taxa_entrega?: number;
  payment_method?: string;
  created_at: string;
  endereco?: string;
  bairro?: string;
  itens?: OrderItem[];
  customers?: { nome: string; telefone?: string } | null;
}

const TABS = [
  { key: 'novo', label: 'Novos' },
  { key: 'em_preparo', label: 'Em Preparo' },
  { key: 'pronto', label: 'Pronto' },
  { key: 'saiu_entrega', label: 'Em Rota' },
  { key: 'entregue', label: 'Entregues' },
  { key: 'cancelado', label: 'Cancelados' },
];

const STATUS_FLOW: Record<string, { next: string; nextLabel: string; nextClass: string; reject?: boolean }> = {
  novo: { next: 'aceito', nextLabel: '✓ Aceitar Pedido', nextClass: 'bg-accent text-white', reject: true },
  aceito: { next: 'em_preparo', nextLabel: '🍳 Iniciar Preparo', nextClass: 'bg-blue-600 text-white' },
  em_preparo: { next: 'pronto', nextLabel: '✓ Marcar Pronto', nextClass: 'bg-green-600 text-white' },
  pronto: { next: 'saiu_entrega', nextLabel: '🚚 Saiu para Entrega', nextClass: 'bg-purple-600 text-white' },
  saiu_entrega: { next: 'entregue', nextLabel: '✓ Confirmar Entrega', nextClass: 'bg-emerald-600 text-white' },
};

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-orange-100 text-orange-700',
  aceito: 'bg-blue-100 text-blue-700',
  em_preparo: 'bg-blue-100 text-blue-700',
  pronto: 'bg-purple-100 text-purple-700',
  saiu_entrega: 'bg-indigo-100 text-indigo-700',
  entregue: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
  recusado: 'bg-red-100 text-red-700',
};

function timeSince(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? ` ${diff % 60}min` : ''}`;
}

function OrderCard({
  order,
  onStatusChange,
}: {
  order: Order;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(order.status === 'novo');
  const [updating, setUpdating] = useState(false);
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
        <div className="bg-accent px-4 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <p className="text-xs font-bold text-white uppercase tracking-wide">Novo Pedido</p>
        </div>
      )}

      <div
        className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-foreground">
                #{order.order_number ?? order.id.slice(0, 6)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-secondary text-muted-foreground'}`}>
                {order.status.replace(/_/g, ' ')}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                {order.type === 'delivery' ? '🚚 Entrega' : '📦 Retirada'}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {order.customers?.nome ?? 'Cliente'}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{timeSince(order.created_at)}
              </span>
              {order.bairro && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{order.bairro}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="font-bold text-foreground">R$ {(order.total ?? 0).toFixed(2)}</p>
              {order.payment_method && (
                <p className="text-xs text-muted-foreground capitalize">{order.payment_method}</p>
              )}
            </div>
            {expanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-secondary/10 space-y-4">
          {/* Itens */}
          {order.itens && order.itens.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Itens do Pedido
              </p>
              <div className="space-y-2">
                {order.itens.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium text-foreground">
                        {item.qty}x {item.nome}
                      </span>
                      {item.obs && (
                        <p className="text-xs text-muted-foreground mt-0.5">Obs: {item.obs}</p>
                      )}
                    </div>
                    <span className="text-foreground font-medium">
                      R$ {(item.preco * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-3 pt-3 space-y-1">
                {order.subtotal != null && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>R$ {order.subtotal.toFixed(2)}</span>
                  </div>
                )}
                {(order.taxa_entrega ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Taxa de entrega</span>
                    <span>R$ {order.taxa_entrega!.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-foreground">
                  <span>Total</span>
                  <span>R$ {(order.total ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Contato */}
          {order.customers?.telefone && (
            <a
              href={`tel:${order.customers.telefone}`}
              className="flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <Phone className="w-3.5 h-3.5" />
              {order.customers.telefone}
            </a>
          )}
          {order.endereco && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {order.endereco}
            </p>
          )}

          {/* Ações */}
          {flow && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleNext}
                disabled={updating}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${flow.nextClass}`}
              >
                {updating ? 'Atualizando...' : flow.nextLabel}
              </button>
              {flow.reject && (
                <button
                  onClick={handleReject}
                  disabled={updating}
                  className="px-4 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
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

export default function Pedidos() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('novo');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await db.orders.list(company.id);
    setOrders(data ?? []);
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load, company?.id]);

  const handleStatusChange = async (id: string, status: string) => {
    await db.orders.update(id, { status });
    await load();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const tabOrders = orders.filter(o => {
    if (activeTab === 'cancelado') return o.status === 'cancelado' || o.status === 'recusado';
    return o.status === activeTab;
  });

  const countFor = (key: string) => {
    if (key === 'cancelado') {
      return orders.filter(o => o.status === 'cancelado' || o.status === 'recusado').length;
    }
    return orders.filter(o => o.status === key).length;
  };

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{orders.length} pedidos carregados</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(tab => {
          const count = countFor(tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-white border border-border text-foreground hover:bg-secondary/50'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {tabOrders.length === 0 ? (
          <div className="py-16 text-center bg-white border border-border rounded-xl">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-foreground">Nenhum pedido aqui</p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === 'novo'
                ? 'Novos pedidos aparecerão aqui em tempo real.'
                : 'Sem pedidos neste status.'}
            </p>
          </div>
        ) : (
          tabOrders.map(o => (
            <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}
