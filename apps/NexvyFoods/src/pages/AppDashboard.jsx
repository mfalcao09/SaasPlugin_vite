import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompanyContext } from '@/context/CompanyContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Link } from 'react-router-dom';
import { Package, DollarSign, TrendingUp, Users, Clock, ShoppingBag, ChevronRight } from 'lucide-react';
import { getStatusConfig, timeSince } from '@/lib/demo-data';

export default function AppDashboard() {
  const { company, user, loading: companyLoading } = useCompanyContext();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useDocumentTitle(company ? `${company.name} | FoodControl AI` : 'FoodControl AI');

  useEffect(() => {
    if (!company?.id) return;
    const load = async () => {
      try {
        const [ords, custs] = await Promise.all([
          base44.entities.Order.filter({ company_id: company.id }, '-created_date', 50),
          base44.entities.Customer.filter({ company_id: company.id }),
        ]);
        setOrders(ords);
        setCustomers(custs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [company?.id]);

  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.created_date?.startsWith(today));
  const todayRevenue = todayOrders.filter(o => o.payment_status === 'pago').reduce((s, o) => s + (o.total || 0), 0);
  const paidCount = todayOrders.filter(o => o.payment_status === 'pago').length;
  const avgTicket = paidCount > 0 ? todayRevenue / paidCount : 0;
  const activeOrders = orders.filter(o => !['entregue', 'cancelado', 'recusado'].includes(o.status));

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Bom dia{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {company?.name || 'Seu painel de controle'}
        </p>
      </div>

      {/* Setup prompt se não tem empresa */}
      {!company && !companyLoading && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-5">
          <h2 className="font-bold text-foreground mb-2">Configure sua empresa</h2>
          <p className="text-sm text-muted-foreground mb-4">Complete o onboarding para começar a receber pedidos.</p>
          <Link to="/onboarding">
            <button className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium">
              Iniciar Configuração →
            </button>
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pedidos Hoje', value: loading ? '...' : todayOrders.length, sub: 'Total do dia', icon: Package, color: 'text-accent' },
          { label: 'Faturamento', value: loading ? '...' : `R$ ${todayRevenue.toFixed(0)}`, sub: 'Pagos hoje', icon: DollarSign, color: 'text-green-600' },
          { label: 'Ticket Médio', value: loading ? '...' : `R$ ${avgTicket.toFixed(0)}`, sub: 'Hoje', icon: TrendingUp, color: 'text-blue-600' },
          { label: 'Clientes', value: loading ? '...' : customers.length, sub: 'Cadastrados', icon: Users, color: 'text-purple-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Pedidos Ativos */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-foreground">Pedidos em Andamento</h2>
          <Link to="/app/pedidos" className="text-xs text-accent font-medium hover:underline flex items-center gap-1">
            Ver todos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : activeOrders.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhum pedido em andamento</p>
            <p className="text-xs text-muted-foreground mt-1">Novos pedidos aparecerão aqui automaticamente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.slice(0, 5).map((order) => {
              const sc = getStatusConfig(order.status);
              return (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${sc.dot}`}></div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">#{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">{sc.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm font-bold text-foreground">R$ {order.total?.toFixed(2)}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{timeSince(order.created_date)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Ver Pedidos', to: '/app/pedidos', icon: ShoppingBag },
          { label: 'Editar Cardápio', to: '/app/cardapio', icon: Package },
          { label: 'Ver Clientes', to: '/app/clientes', icon: Users },
          { label: 'Configurações', to: '/app/configuracoes', icon: TrendingUp },
        ].map((action, i) => (
          <Link key={i} to={action.to}>
            <div className="bg-white border border-border rounded-xl p-4 hover:border-accent/30 hover:bg-accent/5 transition-all cursor-pointer flex items-center gap-3">
              <action.icon className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">{action.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}