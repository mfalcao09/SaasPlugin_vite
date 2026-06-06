import React from 'react';
import DemoMode from './DemoMode';
import { DEMO_CUSTOMERS, timeSince } from '@/lib/demo-data';
import { Search, Users, TrendingUp, AlertCircle } from 'lucide-react';


const active = DEMO_CUSTOMERS.filter(c => c.status === 'ativo');
const inactive = DEMO_CUSTOMERS.filter(c => c.status === 'inativo');
const avgOrders = Math.round(DEMO_CUSTOMERS.reduce((s, c) => s + c.total_orders, 0) / DEMO_CUSTOMERS.length);

export default function DemoClientes() {
  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">{DEMO_CUSTOMERS.length} clientes cadastrados</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-xl p-4">
            <Users className="w-4 h-4 text-accent mb-2" />
            <p className="text-2xl font-bold text-foreground">{active.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Ativos</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-yellow-500 mb-2" />
            <p className="text-2xl font-bold text-foreground">{inactive.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Inativos</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <TrendingUp className="w-4 h-4 text-green-600 mb-2" />
            <p className="text-2xl font-bold text-foreground">{avgOrders}</p>
            <p className="text-xs text-muted-foreground mt-1">Pedidos Médios</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Buscar cliente por nome ou telefone..."
            readOnly
          />
        </div>

        {/* Inativos Alert */}
        {inactive.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-800 text-sm">{inactive.length} clientes inativos há mais de 15 dias</p>
              <p className="text-xs text-yellow-700 mt-1">Use o módulo IA Growth para recuperar esses clientes automaticamente.</p>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-border bg-secondary/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bairro</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Pedidos</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último Pedido</p>
          </div>
          {DEMO_CUSTOMERS.map((customer) => (
            <div key={customer.id} className="grid grid-cols-4 gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
              <div>
                <p className="font-medium text-foreground text-sm">{customer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{customer.phone}</p>
              </div>
              <div className="flex items-center">
                <p className="text-sm text-foreground">{customer.neighborhood}</p>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-sm font-bold text-foreground">{customer.total_orders}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{timeSince(customer.last_order_at)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  customer.status === 'ativo'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {customer.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DemoMode>
  );
}