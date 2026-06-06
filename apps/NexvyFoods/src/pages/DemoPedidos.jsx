import React, { useState } from 'react';
import DemoMode from './DemoMode';
import { DEMO_ORDERS, getStatusConfig, timeSince } from '@/lib/demo-data';
import { Clock, MapPin, Phone, ChevronDown, ChevronUp, Truck, ShoppingBag } from 'lucide-react';

const TABS = [
  { key: 'novo', label: 'Novos' },
  { key: 'em_preparo', label: 'Em Preparo' },
  { key: 'pronto', label: 'Prontos' },
  { key: 'saiu_entrega', label: 'Saiu p/ Entrega' },
  { key: 'entregue', label: 'Entregues' },
];

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(false);
  const sc = getStatusConfig(order.status);

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-foreground">{order.order_number}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                {sc.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                {order.type === 'delivery' ? '🚚 Entrega' : '📦 Retirada'}
              </span>
            </div>
            <p className="font-medium text-foreground text-sm">{order.customer_name}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeSince(order.created_at)}</span>
              {order.neighborhood && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{order.neighborhood}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-foreground">R$ {order.total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground capitalize mt-1">{order.payment_method}</p>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto mt-2" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto mt-2" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-secondary/10 space-y-4">
          {/* Itens */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens do Pedido</p>
            <div className="space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium text-foreground">{item.qty}x {item.name}</span>
                    {item.notes && <p className="text-xs text-muted-foreground mt-0.5">Obs: {item.notes}</p>}
                  </div>
                  <span className="text-foreground font-medium">R$ {item.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span>R$ {order.subtotal.toFixed(2)}</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Taxa de entrega</span><span>R$ {order.delivery_fee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total</span><span>R$ {order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Entrega */}
          {order.address && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Endereço</p>
              <p className="text-sm text-foreground">{order.address} — {order.neighborhood}</p>
            </div>
          )}

          {/* Contato */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{order.customer_phone}</span>
          </div>

          {order.rider_name && (
            <div className="flex items-center gap-2 text-sm">
              <Truck className="w-3 h-3 text-accent" />
              <span className="text-foreground font-medium">Motoboy: {order.rider_name}</span>
            </div>
          )}

          {/* Ações demo */}
          <div className="flex gap-2 pt-2">
            {order.status === 'novo' && (
              <>
                <button className="flex-1 py-2 bg-accent text-white rounded-lg text-sm font-medium">✓ Aceitar</button>
                <button className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground">Recusar</button>
              </>
            )}
            {order.status === 'em_preparo' && (
              <button className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">✓ Marcar como Pronto</button>
            )}
            {order.status === 'pronto' && (
              <button className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">🚚 Saiu para Entrega</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DemoPedidos() {
  const [activeTab, setActiveTab] = useState('novo');

  const filtered = DEMO_ORDERS.filter(o => o.status === activeTab);

  const countByStatus = (s) => DEMO_ORDERS.filter(o => o.status === s).length;

  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie todos os pedidos da operação</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1 overflow-x-auto">
          {TABS.map(tab => {
            const count = countByStatus(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-accent text-white' : 'bg-border text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pedidos */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum pedido neste status</p>
            </div>
          ) : (
            filtered.map(order => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      </div>
    </DemoMode>
  );
}