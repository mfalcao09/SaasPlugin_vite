import React, { useState, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Plus, Star, Eye, EyeOff, Pencil, Trash2, X, GripVertical } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  sort_order: number;
  active?: boolean;
  company_id: string;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  featured: boolean;
  active: boolean;
  category_id?: string;
  menu_categories?: { name: string } | null;
  company_id: string;
}

// ─── CategoryForm ─────────────────────────────────────────────────────────────
function CategoryForm({ onSave, onCancel, initial }: {
  onSave: (name: string) => void;
  onCancel: () => void;
  initial?: Category;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  return (
    <div className="bg-white border-2 border-accent/30 rounded-xl p-4">
      <p className="text-sm font-semibold text-foreground mb-3">
        {initial ? 'Editar Categoria' : 'Nova Categoria'}
      </p>
      <input
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 mb-3"
        placeholder="Nome da categoria (ex: Hambúrgueres)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave(name)}
          disabled={!name.trim()}
          className="flex-1 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── ItemModal ─────────────────────────────────────────────────────────────────
function ItemModal({ item, categories, companyId, onSave, onClose }: {
  item?: MenuItem;
  categories: Category[];
  companyId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item?.price?.toString() ?? '',
    category_id: item?.category_id ?? categories[0]?.id ?? '',
    image_url: item?.image_url ?? '',
    featured: item?.featured ?? false,
    active: item?.active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    const data = { ...form, price: parseFloat(form.price), company_id: companyId };
    if (item?.id) {
      await db.menuItems.update(item.id, data);
    } else {
      await db.menuItems.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">{item ? 'Editar Item' : 'Novo Item'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome *</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Ex: Smash Burger Duplo"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Descrição</label>
            <textarea
              rows={2}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              placeholder="Ingredientes, tamanho, detalhes..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Preço (R$) *</label>
              <input
                type="number"
                step="0.01"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="0,00"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Categoria</label>
              <select
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">URL da Foto</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="https://..."
              value={form.image_url}
              onChange={e => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm({ ...form, featured: !form.featured })}
                className={`w-10 h-6 rounded-full transition-colors ${form.featured ? 'bg-accent' : 'bg-secondary'} relative`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.featured ? 'left-4' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-foreground flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-yellow-500" /> Destaque
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm({ ...form, active: !form.active })}
                className={`w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-secondary'} relative`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-foreground">Ativo</span>
            </label>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.price}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Cardapio() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | undefined>();

  const load = async () => {
    if (!company?.id) return;
    const [{ data: cats }, { data: its }] = await Promise.all([
      db.menuCategories.list(company.id),
      db.menuItems.listAll(company.id),
    ]);
    const catList = cats ?? [];
    setCategories(catList);
    setItems(its ?? []);
    if (!activeCategory && catList.length > 0) setActiveCategory(catList[0].id);
  };

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
  }, [company?.id]);

  const handleSaveCategory = async (name: string) => {
    if (!company?.id) return;
    if (editingCategory) {
      await db.menuCategories.update(editingCategory.id, { name });
    } else {
      await db.menuCategories.create({
        name,
        company_id: company.id,
        sort_order: categories.length + 1,
        active: true,
      });
    }
    setShowCategoryForm(false);
    setEditingCategory(undefined);
    await load();
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Excluir categoria? Os itens vinculados não serão excluídos.')) return;
    await db.menuCategories.delete(id);
    if (activeCategory === id) setActiveCategory(null);
    await load();
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Excluir este item do cardápio?')) return;
    await db.menuItems.delete(id);
    await load();
  };

  const handleToggleActive = async (item: MenuItem) => {
    await db.menuItems.update(item.id, { active: !item.active });
    await load();
  };

  const handleToggleFeatured = async (item: MenuItem) => {
    await db.menuItems.update(item.id, { featured: !item.featured });
    await load();
  };

  const categoryItems = items.filter(i => i.category_id === activeCategory);

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cardápio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {categories.length} categorias · {items.length} itens
          </p>
        </div>
        <button
          onClick={() => { setEditingItem(undefined); setShowItemModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Item
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {/* Sidebar de categorias */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Categorias</p>
          {categories.map(cat => {
            const count = items.filter(i => i.category_id === cat.id).length;
            return (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-accent/10 border-accent/30 text-accent font-semibold'
                      : 'bg-white border-border text-foreground hover:border-accent/20'
                  }`}
                >
                  <p className="text-sm font-medium pr-10">{cat.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} itens</p>
                </button>
                <div className="absolute right-2 top-2.5 hidden group-hover:flex gap-1">
                  <button
                    onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }}
                    className="p-1 hover:bg-secondary rounded"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}

          {showCategoryForm ? (
            <CategoryForm
              initial={editingCategory}
              onSave={handleSaveCategory}
              onCancel={() => { setShowCategoryForm(false); setEditingCategory(undefined); }}
            />
          ) : (
            <button
              onClick={() => { setEditingCategory(undefined); setShowCategoryForm(true); }}
              className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-border text-muted-foreground hover:border-accent/30 transition-colors text-sm"
            >
              + Nova Categoria
            </button>
          )}
        </div>

        {/* Itens */}
        <div className="md:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground">
              {categories.find(c => c.id === activeCategory)?.name ?? 'Selecione uma categoria'}
            </p>
            <span className="text-xs text-muted-foreground">{categoryItems.length} itens</span>
          </div>

          {activeCategory === null ? (
            <div className="py-12 text-center bg-white border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground text-sm">Selecione uma categoria à esquerda</p>
            </div>
          ) : categoryItems.length === 0 ? (
            <div className="py-12 text-center bg-white border border-dashed border-border rounded-xl">
              <p className="text-3xl mb-2">🍽️</p>
              <p className="font-semibold text-foreground">Nenhum item nesta categoria</p>
              <button
                onClick={() => { setEditingItem(undefined); setShowItemModal(true); }}
                className="mt-3 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
              >
                Adicionar Item
              </button>
            </div>
          ) : (
            categoryItems.map(item => (
              <div
                key={item.id}
                className={`bg-white border rounded-xl p-4 flex items-center gap-4 ${
                  !item.active ? 'opacity-60 border-border' : 'border-border'
                }`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 cursor-grab" />
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center text-2xl">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    {item.featured && (
                      <span className="flex items-center gap-1 text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full font-medium">
                        <Star className="w-3 h-3" /> Destaque
                      </span>
                    )}
                    {!item.active && (
                      <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                  )}
                  <p className="font-bold text-accent mt-1">R$ {item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleFeatured(item)}
                    title="Toggle destaque"
                    className={`p-2 rounded-lg transition-colors ${item.featured ? 'bg-yellow-50 text-yellow-500' : 'hover:bg-secondary text-muted-foreground'}`}
                  >
                    <Star className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(item)}
                    title={item.active ? 'Desativar' : 'Ativar'}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                  >
                    {item.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => { setEditingItem(item); setShowItemModal(true); }}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showItemModal && company?.id && (
        <ItemModal
          item={editingItem}
          categories={categories}
          companyId={company.id}
          onSave={() => { setShowItemModal(false); load(); }}
          onClose={() => setShowItemModal(false)}
        />
      )}
    </div>
  );
}
