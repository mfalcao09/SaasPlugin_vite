import React, { useState, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Search, Plus, Pencil, Trash2, X, Users, Phone, Mail, MapPin } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  total_orders?: number;
  total_spent?: number;
  company_id: string;
}

function CustomerModal({ customer, companyId, onSave, onClose }: {
  customer?: Customer;
  companyId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const data = { ...form, company_id: companyId };
    if (customer?.id) {
      await db.customers.update(customer.id, data);
    } else {
      await db.customers.create(data);
    }
    setSaving(false);
    onSave();
  };

  const fields = [
    { key: 'name', label: 'Nome *', placeholder: 'Nome completo', icon: Users },
    { key: 'phone', label: 'Telefone', placeholder: '(11) 9 9999-9999', icon: Phone },
    { key: 'email', label: 'E-mail', placeholder: 'email@exemplo.com', icon: Mail },
    { key: 'address', label: 'Endereço', placeholder: 'Rua, número, bairro', icon: MapPin },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">{customer ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          {fields.map(({ key, label, placeholder, icon: Icon }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{label}</label>
              <div className="relative">
                <Icon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Clientes() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | undefined>();

  const load = async () => {
    if (!company?.id) return;
    const { data } = await db.customers.list(company.id);
    setCustomers(data ?? []);
  };

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
  }, [company?.id]);

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{customers.length} clientes cadastrados</p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{customers.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total de clientes</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">
            {customers.filter(c => (c.total_orders ?? 0) > 0).length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Já pediram</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">
            {customers.length > 0
              ? (customers.reduce((s, c) => s + (c.total_orders ?? 0), 0) / customers.length).toFixed(1)
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Média de pedidos</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center bg-white border border-border rounded-xl">
          <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
          </p>
          {!search && (
            <p className="text-sm text-muted-foreground mt-1">
              Clientes aparecem automaticamente quando fazem pedidos pelo link público.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{c.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {c.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />{c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />{c.email}
                      </span>
                    )}
                  </div>
                  {c.address && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{c.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {(c.total_orders ?? 0) > 0 && (
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-foreground">{c.total_orders} pedidos</p>
                    {c.total_spent != null && (
                      <p className="text-xs text-muted-foreground">R$ {c.total_spent.toFixed(2)}</p>
                    )}
                  </div>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditing(c); setShowModal(true); }}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Excluir este cliente?')) return;
                      await db.customers.update(c.id, { deleted: true });
                      await load();
                    }}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && company?.id && (
        <CustomerModal
          customer={editing}
          companyId={company.id}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
