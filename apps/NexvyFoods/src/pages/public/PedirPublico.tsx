import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/lib/db';
import {
  ShoppingCart, Plus, Minus, X, ChefHat, Clock, CheckCircle, AlertCircle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  primary_color?: string;
  logo_url?: string;
  average_prep_time?: number;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
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
}

interface CartItem extends MenuItem {
  qty: number;
  notes?: string;
}

type Step = 'menu' | 'cart' | 'checkout' | 'success';

// ─── CartRow ────────────────────────────────────────────────────────────────

function CartRow({ item, onIncrease, onDecrease }: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        {item.notes && (
          <p className="text-xs text-muted-foreground italic mt-0.5">Obs: {item.notes}</p>
        )}
        <p className="text-sm font-bold text-accent mt-1">
          R$ {(item.price * item.qty).toFixed(2)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
        <button
          onClick={onDecrease}
          className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold text-foreground w-5 text-center">{item.qty}</span>
        <button
          onClick={onIncrease}
          className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── ProductCard ─────────────────────────────────────────────────────────────

function ProductCard({ product, onAdd }: {
  product: MenuItem;
  onAdd: (item: MenuItem, notes: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    onAdd(product, notes);
    setNotes('');
    setShowNotes(false);
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-4 flex gap-4">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-secondary flex-shrink-0 flex items-center justify-center text-3xl">
          🍽️
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground">{product.name}</p>
        {product.featured && (
          <span className="text-xs text-accent font-medium">⭐ Destaque</span>
        )}
        {product.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
        )}
        {showNotes && (
          <input
            className="w-full mt-2 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
            placeholder="Sem cebola, ponto da carne..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex items-center justify-between mt-3">
          <p className="font-bold text-accent text-lg">R$ {product.price.toFixed(2)}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary"
            >
              Obs.
            </button>
            <button
              onClick={handleAdd}
              className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function PedirPublico() {
  const { slug } = useParams<{ slug: string }>();

  const [company, setCompany] = useState<Company | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('menu');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    type: 'delivery' as 'delivery' | 'retirada',
    payment_method: 'dinheiro',
    notes: '',
  });

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }

    const load = async () => {
      const { data: comp, error } = await db.companies.getBySlug(slug);
      if (error || !comp) { setNotFound(true); setLoading(false); return; }
      setCompany(comp);

      const [{ data: cats }, { data: its }] = await Promise.all([
        db.menuCategories.listActive(comp.id),
        db.menuItems.list(comp.id),
      ]);
      const catList = cats ?? [];
      setCategories(catList);
      setItems(its ?? []);
      if (catList.length > 0) setActiveCategory(catList[0].id);
      setLoading(false);
    };

    load();
  }, [slug]);

  // ── Cart helpers ──────────────────────────────────────────────────────────

  const addItem = (product: MenuItem, notes: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id && i.notes === (notes || undefined));
      if (existing) {
        return prev.map(i =>
          i.id === product.id && i.notes === (notes || undefined)
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }
      return [...prev, { ...product, qty: 1, notes: notes || undefined }];
    });
  };

  const changeQty = (id: string, notes: string | undefined, delta: number) => {
    setCart(prev => {
      const updated = prev.map(i =>
        i.id === id && i.notes === notes ? { ...i, qty: i.qty + delta } : i
      );
      return updated.filter(i => i.qty > 0);
    });
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!company || !form.name || !form.phone) return;
    if (form.type === 'delivery' && !form.address) return;

    setSubmitting(true);
    try {
      const { data: customer } = await db.customers.upsertByPhone(company.id, form.phone, {
        name: form.name,
        address: form.address || null,
      });

      const { data: order } = await db.orders.create({
        company_id: company.id,
        customer_id: customer?.id ?? null,
        status: 'novo',
        type: form.type,
        total: cartTotal,
        payment_method: form.payment_method,
        address: form.address || null,
        notes: form.notes || null,
        items_snapshot: cart.map(i => ({
          id: i.id,
          name: i.name,
          price: i.price,
          qty: i.qty,
          notes: i.notes,
        })),
      });

      if (order?.id) {
        await db.orderItems.createBatch(
          cart.map(i => ({
            order_id: order.id,
            menu_item_id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.qty,
            notes: i.notes ?? null,
            subtotal: i.price * i.qty,
          }))
        );
      }

      setStep('success');
    } catch (err) {
      console.error('Erro ao finalizar pedido:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryItems = items.filter(i => i.category_id === activeCategory);

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground">Restaurante não encontrado</h1>
          <p className="text-sm text-muted-foreground mt-2">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Pedido enviado!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Seu pedido foi recebido por <strong>{company.name}</strong> e está sendo preparado.
          </p>
          {company.average_prep_time && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Clock className="w-4 h-4" /> ~{company.average_prep_time} min
            </p>
          )}
          <button
            onClick={() => { setCart([]); setStep('menu'); }}
            className="mt-6 w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm"
          >
            Fazer novo pedido
          </button>
        </div>
      </div>
    );
  }

  if (step === 'checkout') {
    const checkoutFields = [
      { key: 'name',    label: 'Nome *',              placeholder: 'Seu nome completo',       type: 'text' },
      { key: 'phone',   label: 'Telefone *',           placeholder: '(11) 9 9999-9999',        type: 'tel'  },
      ...(form.type === 'delivery'
        ? [{ key: 'address', label: 'Endereço *', placeholder: 'Rua, número, bairro', type: 'text' }]
        : []
      ),
      { key: 'notes',   label: 'Observações',          placeholder: 'Alguma preferência?',     type: 'text' },
    ];

    return (
      <div className="min-h-screen bg-secondary">
        <div className="bg-white border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setStep('cart')} className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="font-bold text-foreground">Finalizar Pedido</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4 pb-32">
          {/* Resumo */}
          <div className="bg-white rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo do pedido</p>
            {cart.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-1">
                <span>{item.qty}x {item.name}</span>
                <span className="font-medium">R$ {(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-bold text-foreground">
              <span>Total</span><span>R$ {cartTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Tipo */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de pedido</p>
            <div className="flex gap-2">
              {[{ key: 'delivery', label: '🚚 Entrega' }, { key: 'retirada', label: '📦 Retirada' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setForm({ ...form, type: t.key as 'delivery' | 'retirada' })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    form.type === t.key ? 'bg-accent text-white' : 'bg-secondary text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dados pessoais */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seus dados</p>
            {checkoutFields.map(field => (
              <div key={field.key}>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{field.label}</label>
                <input
                  type={field.type}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder={field.placeholder}
                  value={form[field.key as keyof typeof form] as string}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          {/* Pagamento */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagamento</p>
            <select
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
              value={form.payment_method}
              onChange={e => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="dinheiro">💵 Dinheiro</option>
              <option value="cartao_credito">💳 Cartão de Crédito</option>
              <option value="cartao_debito">💳 Cartão de Débito</option>
              <option value="pix">⚡ Pix</option>
            </select>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4">
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !form.name ||
              !form.phone ||
              (form.type === 'delivery' && !form.address)
            }
            className="w-full max-w-lg mx-auto block py-4 bg-accent text-white rounded-2xl font-bold text-base disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            {submitting ? 'Enviando...' : `Confirmar Pedido · R$ ${cartTotal.toFixed(2)}`}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'cart') {
    return (
      <div className="min-h-screen bg-secondary">
        <div className="bg-white border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setStep('menu')} className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="font-bold text-foreground">Carrinho ({cartCount})</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 pb-32">
          {cart.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed border-border mt-4">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-semibold text-foreground">Carrinho vazio</p>
              <button onClick={() => setStep('menu')} className="mt-3 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">
                Ver cardápio
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border mt-4 px-4">
              {cart.map((item, i) => (
                <CartRow
                  key={i}
                  item={item}
                  onIncrease={() => changeQty(item.id, item.notes, 1)}
                  onDecrease={() => changeQty(item.id, item.notes, -1)}
                />
              ))}
              <div className="py-4 border-t border-border flex justify-between font-bold text-foreground">
                <span>Total</span><span>R$ {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4">
            <button
              onClick={() => setStep('checkout')}
              className="w-full max-w-lg mx-auto block py-4 bg-accent text-white rounded-2xl font-bold text-base hover:bg-accent/90 transition-colors"
            >
              Continuar · R$ {cartTotal.toFixed(2)}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Menu view (default) ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-secondary">
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <ChefHat className="w-6 h-6 text-accent" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground">{company.name}</h1>
            {company.address && <p className="text-xs text-muted-foreground">{company.address}</p>}
            {company.average_prep_time && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> ~{company.average_prep_time} min
              </p>
            )}
          </div>
        </div>
        {/* Tabs de categorias */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? 'bg-accent text-white'
                  : 'bg-secondary text-foreground hover:bg-accent/10'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-32 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {categories.find(c => c.id === activeCategory)?.name}
        </p>
        {categoryItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nenhum item disponível nesta categoria.
          </p>
        ) : (
          categoryItems.map(item => (
            <ProductCard key={item.id} product={item} onAdd={addItem} />
          ))
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4">
          <button
            onClick={() => setStep('cart')}
            className="w-full max-w-2xl mx-auto flex items-center justify-between py-4 px-5 bg-accent text-white rounded-2xl font-bold text-base shadow-lg hover:bg-accent/90 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span className="bg-white/20 text-white text-sm px-2 py-0.5 rounded-full">{cartCount}</span>
              Ver carrinho
            </span>
            <span>R$ {cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
