import React from 'react';
import DemoMode from './DemoMode';
import { DEMO_RIDERS, DEMO_ORDERS, DEMO_ZONES } from '@/lib/demo-data';
import { Truck, Bike, Car, Phone, MapPin } from 'lucide-react';

const vehicleIcon = { moto: Truck, bicicleta: Bike, carro: Car };
const vehicleLabel = { moto: 'Moto', bicicleta: 'Bicicleta', carro: 'Carro' };

const enRoute = DEMO_ORDERS.filter(o => o.status === 'saiu_entrega');

export default function DemoEntregas() {
  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas</h1>
          <p className="text-sm text-muted-foreground mt-1">Motoboys e pedidos em rota</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Motoboys */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-foreground">Equipe de Entrega</p>
              <button className="text-xs text-accent font-medium hover:underline">+ Adicionar</button>
            </div>
            <div className="space-y-3">
              {DEMO_RIDERS.map(rider => {
                const Icon = vehicleIcon[rider.vehicle_type] || Truck;
                return (
                  <div key={rider.id} className="bg-white border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          rider.active ? 'bg-accent/10' : 'bg-secondary'
                        }`}>
                          <Icon className={`w-5 h-5 ${rider.active ? 'text-accent' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{rider.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{vehicleLabel[rider.vehicle_type]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              rider.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {rider.active ? 'Disponível' : 'Inativo'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{rider.deliveries_today}</p>
                        <p className="text-xs text-muted-foreground">entregas hoje</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{rider.phone}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Em Rota + Zonas */}
          <div className="space-y-6">
            {/* Pedidos em Rota */}
            <div>
              <p className="font-semibold text-foreground mb-3">Pedidos em Rota</p>
              {enRoute.length === 0 ? (
                <div className="bg-white border border-border rounded-xl p-6 text-center text-muted-foreground">
                  <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum pedido em rota agora</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {enRoute.map(order => (
                    <div key={order.id} className="bg-white border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground text-sm">{order.order_number} — {order.customer_name}</p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span>{order.address}</span>
                          </div>
                        </div>
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">Em Rota</span>
                      </div>
                      {order.rider_name && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                          <Truck className="w-3 h-3 text-accent" />
                          <span className="text-xs text-foreground font-medium">{order.rider_name}</span>
                        </div>
                      )}
                      <button className="w-full mt-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium">✓ Marcar como Entregue</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Zonas */}
            <div>
              <p className="font-semibold text-foreground mb-3">Zonas de Entrega</p>
              <div className="bg-white border border-border rounded-xl overflow-hidden">
                {DEMO_ZONES.map((zone, i) => (
                  <div key={zone.id} className={`flex items-center justify-between px-4 py-3 ${i < DEMO_ZONES.length - 1 ? 'border-b border-border' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-accent rounded-full"></div>
                      <p className="text-sm font-medium text-foreground">{zone.name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{zone.estimated_minutes} min</span>
                      <span className="font-semibold text-foreground">R$ {zone.fee.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoMode>
  );
}