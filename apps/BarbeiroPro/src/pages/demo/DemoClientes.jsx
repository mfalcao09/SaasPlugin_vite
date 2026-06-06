import DemoLayout from '@/components/layout/DemoLayout';
import { demoCustomers } from '@/lib/demoData';
import { Search, Star, Clock, User, Filter } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusBadge = {
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inativo', color: 'bg-red-100 text-red-600' },
  vip: { label: 'VIP', color: 'bg-yellow-100 text-yellow-700' },
};

export default function DemoClientes() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = demoCustomers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchFilter = filter === 'all' || c.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <DemoLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Clientes</h1>
            <p className="text-gray-500 text-sm mt-1">{demoCustomers.length} clientes cadastrados</p>
          </div>
          <button className="bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
            + Novo cliente
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
            />
          </div>
          <div className="flex items-center gap-2">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'active', label: 'Ativos' },
              { value: 'vip', label: 'VIP' },
              { value: 'inactive', label: 'Inativos' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filter === f.value
                    ? 'bg-[#1B3A4B] text-white'
                    : 'bg-white border border-black/10 text-gray-600 hover:border-[#1B3A4B]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/8">
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Visitas</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Serviço Favorito</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Última Visita</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-black/5 hover:bg-[#F8F7F3] transition-colors cursor-pointer">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#1B3A4B]/10 rounded-full flex items-center justify-center text-xs font-bold text-[#1B3A4B]">
                        {c.name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-[#1B1C1E]">{c.name}</div>
                        {c.tags?.includes('vip') && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600">
                            <Star className="w-3 h-3" />VIP
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{c.phone}</td>
                  <td className="p-4 text-sm font-semibold text-[#1B1C1E]">{c.total_appointments}x</td>
                  <td className="p-4 text-sm text-gray-600">{c.favorite_service || '–'}</td>
                  <td className="p-4 text-sm text-gray-500">
                    {c.last_appointment_at ? format(new Date(c.last_appointment_at), "d MMM yyyy", { locale: ptBR }) : '–'}
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusBadge[c.status].color}`}>
                      {statusBadge[c.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DemoLayout>
  );
}