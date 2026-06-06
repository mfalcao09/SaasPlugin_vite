import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyContext } from '@/context/CompanyContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Search, Users, TrendingUp, AlertCircle, Phone, MapPin } from 'lucide-react';
import { timeSince } from '@/lib/demo-data';

export default function AppClientes() {
  const { user, loading: companyLoading } = useCompany();
  const { company } = useCompanyContext();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useDocumentTitle(company ? `${company.name} | FoodControl AI` : 'FoodControl AI');

  useEffect(() => {
    if (!user?.company_id) return;
    base44.entities.Customer.filter({ company_id: user.company_id }, '-updated_date', 200)
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.company_id]);

  const filtered = customers.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  const active = customers.filter(c => c.status === 'ativo').length;
  const inactive = customers.filter(c => c.status !== 'ativo').length;
  const avg = customers.length > 0 ? Math.round(customers.reduce((s, c) => s + (c.total_orders || 0), 0) / customers.length) : 0;

  if (companyLoading || loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{customers.length} clientes cadastrados</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ativos', value: active, icon: Users, color: 'text-green-600' },
          { label: 'Inativos', value: inactive, icon: AlertCircle, color: 'text-yellow-600' },
          { label: 'Média de Pedidos', value: avg, icon: TrendingUp, color: 'text-accent' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-4">
            <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {inactive > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">{inactive} clientes inativos. Use o <a href="/app/ai-growth" className="font-semibold underline">IA Growth</a> para recuperá-los.</p>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {customers.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Nenhum cliente ainda</h2>
          <p className="text-sm text-muted-foreground">Os clientes aparecerão aqui quando fizerem pedidos pelo seu link público.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {filtered.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors ${i < filtered.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="w-9 h-9 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-accent">{c.name?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{c.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                  {c.neighborhood && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.neighborhood}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-foreground">{c.total_orders || 0} pedidos</p>
                {c.last_order_at && <p className="text-xs text-muted-foreground mt-0.5">{timeSince(c.last_order_at)}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${c.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {c.status || 'ativo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}