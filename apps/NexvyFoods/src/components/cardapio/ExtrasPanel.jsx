import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

function ExtraRow({ extra, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: extra.name, extra_price: extra.extra_price, active: extra.active !== false, sort_order: extra.sort_order || 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.MenuItemExtra.update(extra.id, { ...form, extra_price: parseFloat(form.extra_price) });
    setSaving(false);
    setEditing(false);
    onSave();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 bg-accent/5 border border-accent/20 rounded-lg">
        <input
          className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30"
          placeholder="Nome do extra"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number" step="0.01" min="0"
          className="w-24 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30"
          placeholder="R$ 0,00"
          value={form.extra_price}
          onChange={e => setForm({ ...form, extra_price: e.target.value })}
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded w-3.5 h-3.5 accent-accent" />
          Ativo
        </label>
        <button onClick={handleSave} disabled={saving || !form.name} className="p-1.5 bg-accent text-white rounded-lg disabled:opacity-50">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="p-1.5 border border-border rounded-lg text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border group ${extra.active !== false ? 'border-border bg-white' : 'border-border bg-secondary/30 opacity-60'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <p className="text-sm font-medium text-foreground">{extra.name}</p>
          {extra.active === false && <span className="text-xs text-muted-foreground">Inativo</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-accent">+R$ {Number(extra.extra_price).toFixed(2)}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1 text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(extra.id)} className="p-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NewExtraRow({ menuItemId, companyId, onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', extra_price: '', active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || form.extra_price === '') return;
    setSaving(true);
    await base44.entities.MenuItemExtra.create({
      menu_item_id: menuItemId,
      company_id: companyId,
      name: form.name,
      extra_price: parseFloat(form.extra_price),
      active: form.active,
      sort_order: form.sort_order,
    });
    setSaving(false);
    onSave();
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-accent/5 border border-accent/20 rounded-lg">
      <input
        autoFocus
        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30"
        placeholder="Ex: Bacon extra, Queijo duplo..."
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
      />
      <input
        type="number" step="0.01" min="0"
        className="w-24 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30"
        placeholder="R$ 0,00"
        value={form.extra_price}
        onChange={e => setForm({ ...form, extra_price: e.target.value })}
      />
      <button onClick={handleSave} disabled={saving || !form.name || form.extra_price === ''} className="p-1.5 bg-accent text-white rounded-lg disabled:opacity-50 flex-shrink-0">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-1.5 border border-border rounded-lg text-muted-foreground flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ExtrasPanel({ product, companyId }) {
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewRow, setShowNewRow] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchExtras = async () => {
    setLoading(true);
    const result = await base44.entities.MenuItemExtra.filter({ menu_item_id: product.id, company_id: companyId }, 'sort_order');
    setExtras(result);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchExtras();
  }, [open, product.id]);

  const handleDelete = async (id) => {
    await base44.entities.MenuItemExtra.delete(id);
    fetchExtras();
  };

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent transition-colors"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? 'Ocultar extras' : `Extras / Adicionais${extras.length > 0 ? ` (${extras.length})` : ''}`}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="h-6 flex items-center">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : extras.length === 0 && !showNewRow ? (
            <p className="text-xs text-muted-foreground">Nenhum extra cadastrado.</p>
          ) : (
            extras.map(extra => (
              <ExtraRow key={extra.id} extra={extra} onSave={fetchExtras} onDelete={handleDelete} />
            ))
          )}

          {showNewRow ? (
            <NewExtraRow
              menuItemId={product.id}
              companyId={companyId}
              onSave={() => { setShowNewRow(false); fetchExtras(); }}
              onCancel={() => setShowNewRow(false)}
            />
          ) : (
            <button
              onClick={() => setShowNewRow(true)}
              className="flex items-center gap-1.5 text-xs text-accent font-medium hover:underline mt-1"
            >
              <Plus className="w-3 h-3" /> Adicionar extra
            </button>
          )}
        </div>
      )}
    </div>
  );
}