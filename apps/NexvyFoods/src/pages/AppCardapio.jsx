import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyContext } from '@/context/CompanyContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Plus, Star, Eye, EyeOff, Pencil, Trash2, X, BookOpen } from 'lucide-react';
import ExtrasPanel from '@/components/cardapio/ExtrasPanel';

function CategoryForm({ onSave, onCancel, initial }) {
  const [name, setName] = useState(initial?.name || '');
  return (
    <div className="bg-white border-2 border-accent/30 rounded-xl p-4">
      <p className="text-sm font-semibold text-foreground mb-3">{initial ? 'Editar Categoria' : 'Nova Categoria'}</p>
      <input
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 mb-3"
        placeholder="Nome da categoria (ex: Hambúrgueres)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={() => onSave(name)} disabled={!name.trim()} className="flex-1 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">
          Salvar
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ProductModal({ product, categories, companyId, onSave, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || '',
    category_id: product?.category_id || categories[0]?.id || '',
    featured: product?.featured || false,
    active: product?.active !== false,
    allow_notes: product?.allow_notes !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    const data = { ...form, price: parseFloat(form.price), company_id: companyId };
    if (product?.id) {
      await base44.entities.MenuItem.update(product.id, data);
    } else {
      await base44.entities.MenuItem.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">{product ? 'Editar Produto' : 'Novo Produto'}</h2>
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
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              rows={2}
              placeholder="Ingredientes e descrição do produto"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Preço (R$) *</label>
              <input
                type="number" step="0.01" min="0"
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
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { key: 'active', label: 'Produto Ativo' },
              { key: 'featured', label: 'Destaque' },
              { key: 'allow_notes', label: 'Permite Obs.' },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[opt.key]}
                  onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
                  className="rounded border-border w-4 h-4 accent-accent"
                />
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.price}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Produto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppCardapio() {
  const { user, loading: companyLoading } = useCompany();
  const { company } = useCompanyContext();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [productModal, setProductModal] = useState(null);

  useDocumentTitle(company ? `${company.name} | FoodControl AI` : 'FoodControl AI');

  const fetchData = async () => {
    if (!user?.company_id) return;
    const [cats, prods] = await Promise.all([
      base44.entities.MenuCategory.filter({ company_id: user.company_id }, 'sort_order'),
      base44.entities.MenuItem.filter({ company_id: user.company_id }),
    ]);
    setCategories(cats);
    setProducts(prods);
    if (cats.length > 0 && !activeCategory) setActiveCategory(cats[0].id);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.company_id) fetchData();
  }, [user?.company_id]);

  const handleSaveCategory = async (name) => {
    if (editingCategory) {
      await base44.entities.MenuCategory.update(editingCategory.id, { name });
    } else {
      await base44.entities.MenuCategory.create({
        company_id: user.company_id, name, sort_order: categories.length, active: true,
      });
    }
    setShowCategoryForm(false);
    setEditingCategory(null);
    fetchData();
  };

  const handleDeleteCategory = async (id) => {
    await base44.entities.MenuCategory.delete(id);
    fetchData();
  };

  const handleToggleProduct = async (product) => {
    await base44.entities.MenuItem.update(product.id, { active: !product.active });
    fetchData();
  };

  const handleDeleteProduct = async (id) => {
    await base44.entities.MenuItem.delete(id);
    fetchData();
  };

  const categoryProducts = products.filter(p => p.category_id === activeCategory);
  const selectedCategory = categories.find(c => c.id === activeCategory);

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
          <h1 className="text-2xl font-bold text-foreground">Cardápio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{categories.length} categorias · {products.length} produtos</p>
        </div>
        {categories.length > 0 && (
          <button
            onClick={() => setProductModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <div className="py-20 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Cardápio vazio</h2>
          <p className="text-sm text-muted-foreground mb-6">Crie sua primeira categoria para começar a adicionar produtos</p>
          <button
            onClick={() => setShowCategoryForm(true)}
            className="px-6 py-3 bg-accent text-white rounded-xl font-medium"
          >
            Criar Primeira Categoria
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-4 gap-6">
          {/* Categorias */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categorias</p>
              <button onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }} className="text-xs text-accent font-medium hover:underline">+ Nova</button>
            </div>

            {showCategoryForm && !editingCategory && (
              <CategoryForm onSave={handleSaveCategory} onCancel={() => setShowCategoryForm(false)} />
            )}

            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length;
              const isActive = activeCategory === cat.id;
              return (
                <div key={cat.id}>
                  {editingCategory?.id === cat.id ? (
                    <CategoryForm
                      initial={cat}
                      onSave={handleSaveCategory}
                      onCancel={() => setEditingCategory(null)}
                    />
                  ) : (
                    <div
                      onClick={() => setActiveCategory(cat.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer group ${
                        isActive ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white border-border text-foreground hover:border-accent/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{cat.name}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditingCategory(cat)} className="p-1 text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} produtos</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Produtos */}
          <div className="md:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{selectedCategory?.name}</p>
              <button
                onClick={() => setProductModal({ category_id: activeCategory })}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Produto
              </button>
            </div>

            {categoryProducts.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p className="text-sm">Nenhum produto nesta categoria</p>
                <button
                  onClick={() => setProductModal({ category_id: activeCategory })}
                  className="mt-3 text-sm text-accent hover:underline"
                >
                  Adicionar primeiro produto
                </button>
              </div>
            ) : (
              categoryProducts.map(product => (
                <div key={product.id} className={`bg-white border rounded-xl p-4 ${!product.active ? 'opacity-60 border-border' : 'border-border'}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-secondary flex-shrink-0 flex items-center justify-center text-xl overflow-hidden">
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-xl" />
                        : '🍽️'
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm">{product.name}</p>
                        {product.featured && <Star className="w-3.5 h-3.5 text-accent fill-accent" />}
                        {!product.active && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Inativo</span>}
                      </div>
                      {product.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>}
                      <p className="font-bold text-accent mt-1 text-sm">R$ {product.price?.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggleProduct(product)}
                        className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                        title={product.active ? 'Desativar' : 'Ativar'}
                      >
                        {product.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setProductModal(product)}
                        className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-2 border border-border rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <ExtrasPanel product={product} companyId={user?.company_id} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Product Modal */}
      {productModal !== null && (
        <ProductModal
          product={Object.keys(productModal).length > 0 && productModal.id ? productModal : null}
          categories={categories}
          companyId={user?.company_id}
          onSave={() => { setProductModal(null); fetchData(); }}
          onClose={() => setProductModal(null)}
        />
      )}
    </div>
  );
}