import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ShoppingCart, Plus, Minus, X, ChefHat, Clock, MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import { checkBusinessHours } from '@/lib/business-hours';

// ─── CartItem ───────────────────────────────────────────────────────────────
function CartItem({ item, onIncrease, onDecrease }) {
  const itemTotal = (item.price + (item.extrasTotal || 0)) * item.qty;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        {item.selectedExtras?.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            + {item.selectedExtras.map(e => e.name).join(', ')}
          </p>
        )}
        {item.notes && <p className="text-xs text-muted-foreground italic mt-0.5">Obs: {item.notes}</p>}
        <p className="text-sm font-bold text-accent mt-1">R$ {itemTotal.toFixed(2)}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
        <button onClick={() => onDecrease(item.cartKey)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold text-foreground w-5 text-center">{item.qty}</span>
        <button onClick={() => onIncrease(item.cartKey)} className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── ProductCard ─────────────────────────────────────────────────────────────
function ProductCard({ product, productExtras, onAdd, isOpen }) {
  const [showPanel, setShowPanel] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedExtras, setSelectedExtras] = useState([]);

  const activeExtras = (productExtras[product.id] || []).filter(e => e.active !== false);
  const extrasTotal = selectedExtras.reduce((s, e) => s + e.extra_price, 0);
  const hasExtrasOrNotes = activeExtras.length > 0 || product.allow_notes;

  const toggleExtra = (extra) => {
    setSelectedExtras(prev =>
      prev.find(e => e.id === extra.id)
        ? prev.filter(e => e.id !== extra.id)
        : [...prev, extra]
    );
  };

  const handleAdd = () => {
    onAdd({ ...product, notes, selectedExtras, extrasTotal });
    setNotes('');
    setSelectedExtras([]);
    setShowPanel(false);
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-4 flex gap-4">
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-secondary flex-shrink-0 flex items-center justify-center text-3xl">🍽️</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground">{product.name}</p>
        {product.featured && <span className="text-xs text-accent font-medium">⭐ Destaque</span>}
        {product.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}
        {activeExtras.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            + {activeExtras.length} opção{activeExtras.length > 1 ? 'ões' : ''} de adicional
          </p>
        )}
        <div className="flex items-center justify-between mt-3">
          <p className="font-bold text-accent text-lg">
            R$ {product.price?.toFixed(2)}
            {extrasTotal > 0 && <span className="text-sm font-normal"> +R$ {extrasTotal.toFixed(2)}</span>}
          </p>
          {isOpen ? (
            <button
              onClick={() => hasExtrasOrNotes ? setShowPanel(!showPanel) : handleAdd()}
              className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-xl text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          ) : (
            <span className="text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-xl">Fechado</span>
          )}
        </div>

        {showPanel && (
          <div className="mt-3 space-y-3">
            {/* Extras */}
            {activeExtras.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Adicionais</p>
                <div className="space-y-1.5">
                  {activeExtras.map(extra => {
                    const checked = selectedExtras.find(e => e.id === extra.id);
                    return (
                      <label key={extra.id} className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                            {checked && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm text-foreground">{extra.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-accent">+R$ {extra.extra_price.toFixed(2)}</span>
                        <input type="checkbox" className="sr-only" checked={!!checked} onChange={() => toggleExtra(extra)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {product.allow_notes && (
              <input
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Observações (ex: sem cebola)..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            )}

            <button onClick={handleAdd} className="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-semibold">
              Adicionar ao Pedido{extrasTotal > 0 ? ` · R$ ${(product.price + extrasTotal).toFixed(2)}` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ClosedBanner ─────────────────────────────────────────────────────────────
function ClosedBanner({ todayHours }) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-orange-800 text-sm">Estabelecimento fechado no momento</p>
          <p className="text-xs text-orange-600 mt-0.5">
            {todayHours && todayHours !== 'Fechado hoje'
              ? `Hoje o horário de atendimento é ${todayHours}.`
              : 'Não há atendimento hoje. Volte outro dia!'}
          </p>
          <p className="text-xs text-orange-500 mt-1">Você pode ver o cardápio, mas não é possível fazer pedidos agora.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PublicOrder() {
  const { slug } = useParams();
  const [company, setCompany] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [productExtras, setProductExtras] = useState({}); // { menuItemId: [extras] }
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [placing, setPlacing] = useState(false);
  const [businessStatus, setBusinessStatus] = useState({ isOpen: true, todayHours: null });
  const [neighborhoodError, setNeighborhoodError] = useState('');

  const [checkout, setCheckout] = useState({
    name: '', phone: '', type: 'delivery', address: '', neighborhood: '',
    payment_method: 'pix', notes: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const companies = await base44.entities.Company.filter({ slug });
        if (companies.length === 0) { setNotFound(true); setLoading(false); return; }
        const c = companies[0];
        setCompany(c);
        setBusinessStatus(checkBusinessHours(c.business_hours));

        const [cats, prods, zns] = await Promise.all([
          base44.entities.MenuCategory.filter({ company_id: c.id, active: true }, 'sort_order'),
          base44.entities.MenuItem.filter({ company_id: c.id, active: true }),
          base44.entities.DeliveryZone.filter({ company_id: c.id, active: true }, 'name'),
        ]);
        setCategories(cats);
        setProducts(prods);
        setZones(zns);
        if (cats.length > 0) setActiveCategory(cats[0].id);

        // Carrega extras de todos os produtos ativos
        if (prods.length > 0) {
          const extrasResults = await Promise.all(
            prods.map(p => base44.entities.MenuItemExtra.filter({ menu_item_id: p.id, company_id: c.id }, 'sort_order'))
          );
          const extrasMap = {};
          prods.forEach((p, i) => { extrasMap[p.id] = extrasResults[i]; });
          setProductExtras(extrasMap);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = (product) => {
    const cartKey = `${product.id}-${product.notes || ''}-${(product.selectedExtras || []).map(e => e.id).join(',')}`;
    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey);
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, cartKey, qty: 1 }];
    });
  };

  const increaseQty = (cartKey) => setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i));
  const decreaseQty = (cartKey) => setCart(prev => {
    const item = prev.find(i => i.cartKey === cartKey);
    if (item?.qty <= 1) return prev.filter(i => i.cartKey !== cartKey);
    return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i);
  });

  // ── Pricing ───────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + (i.price + (i.extrasTotal || 0)) * i.qty, 0);

  const selectedZone = zones.length > 0
    ? zones.find(z => z.name === checkout.neighborhood)
    : null;

  // Bloqueio de região: se há zonas cadastradas e a selecionada não existe → bloqueado
  const regionBlocked = checkout.type === 'delivery' && checkout.neighborhood !== '' && zones.length > 0 && !selectedZone;
  const deliveryFee = checkout.type === 'delivery' && selectedZone ? selectedZone.fee : 0;
  const total = subtotal + deliveryFee;

  // ── Neighborhood change handler ────────────────────────────────────────────
  const handleNeighborhoodChange = (value) => {
    setCheckout({ ...checkout, neighborhood: value });
    if (value && zones.length > 0 && !zones.find(z => z.name === value)) {
      setNeighborhoodError('Esta região não é atendida. Escolha um bairro da lista.');
    } else {
      setNeighborhoodError('');
    }
  };

  // ── Place order ───────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!checkout.name || !checkout.phone) return;
    if (checkout.type === 'delivery' && (!checkout.address || !checkout.neighborhood)) return;
    if (regionBlocked) return;
    if (!businessStatus.isOpen) return;

    setPlacing(true);
    try {
      const num = `${Date.now()}`.slice(-6);

      let customer = null;
      try {
        const existing = await base44.entities.Customer.filter({ company_id: company.id, phone: checkout.phone });
        if (existing.length > 0) {
          customer = existing[0];
          await base44.entities.Customer.update(customer.id, {
            total_orders: (customer.total_orders || 0) + 1,
            last_order_at: new Date().toISOString(),
            status: 'ativo',
          });
        } else {
          customer = await base44.entities.Customer.create({
            company_id: company.id,
            name: checkout.name,
            phone: checkout.phone,
            address: checkout.address,
            neighborhood: checkout.neighborhood,
            total_orders: 1,
            last_order_at: new Date().toISOString(),
            status: 'ativo',
          });
        }
      } catch (e) { console.error('Customer error:', e); }

      const itemsSummary = cart.map(i => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        extras: (i.selectedExtras || []).map(e => ({ name: e.name, price: e.extra_price })),
        extras_total: i.extrasTotal || 0,
        notes: i.notes || '',
        total: (i.price + (i.extrasTotal || 0)) * i.qty,
      }));

      await base44.entities.Order.create({
        company_id: company.id,
        customer_id: customer?.id || '',
        order_number: num,
        type: checkout.type,
        status: 'novo',
        subtotal,
        delivery_fee: deliveryFee,
        total,
        payment_method: checkout.payment_method,
        payment_status: 'pendente',
        address: checkout.address,
        neighborhood: checkout.neighborhood,
        notes: checkout.notes,
        customer_name: checkout.name,
        customer_phone: checkout.phone,
        items_summary: JSON.stringify(itemsSummary),
        created_at: new Date().toISOString(),
      });

      setOrderNumber(num);
      setOrderPlaced(true);
      setCart([]);
    } catch (e) {
      console.error(e);
    } finally {
      setPlacing(false);
    }
  };

  // ── Loading / Not Found ───────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-6">
      <div className="text-center">
        <ChefHat className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Estabelecimento não encontrado</h1>
        <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  if (orderPlaced) return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Pedido Confirmado!</h1>
        <p className="text-muted-foreground mb-4">Seu pedido #{orderNumber} foi enviado para {company.name}.</p>
        <div className="bg-white border border-border rounded-2xl p-5 text-left">
          <p className="text-sm font-semibold text-foreground mb-3">Resumo:</p>
          <p className="text-sm text-muted-foreground">💳 Pagamento: {checkout.payment_method}</p>
          <p className="text-sm text-muted-foreground mt-1">📦 Tipo: {checkout.type === 'delivery' ? 'Entrega' : 'Retirada'}</p>
          <p className="text-xl font-bold text-accent mt-3">Total: R$ {total.toFixed(2)}</p>
        </div>
        {company.whatsapp && (
          <a
            href={`https://wa.me/${company.whatsapp.replace(/\D/g, '')}?text=Olá! Fiz o pedido #${orderNumber} pelo link. 😊`}
            target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium text-sm"
          >
            💬 Falar no WhatsApp
          </a>
        )}
      </div>
    </div>
  );

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const canFinishOrder = businessStatus.isOpen && !regionBlocked;

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${businessStatus.isOpen ? 'bg-accent' : 'bg-muted'}`}>
              <ChefHat className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-foreground text-lg leading-tight">{company.name}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {company.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{company.address.split('—')[0].trim()}</span>}
              {company.average_prep_time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{company.average_prep_time} min</span>}
              <span className={`flex items-center gap-1 font-medium ${businessStatus.isOpen ? 'text-green-600' : 'text-orange-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${businessStatus.isOpen ? 'bg-green-500' : 'bg-orange-400'}`} />
                {businessStatus.isOpen ? 'Aberto' : 'Fechado'}
              </span>
            </div>
          </div>
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)} className="relative flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium">
              <ShoppingCart className="w-4 h-4" />
              <span>{cartCount}</span>
            </button>
          )}
        </div>
      </div>

      {/* Closed banner */}
      {!businessStatus.isOpen && <ClosedBanner todayHours={businessStatus.todayHours} />}

      {/* Category nav */}
      {categories.length > 0 && (
        <div className="sticky top-[73px] z-30 bg-[#F8F7F3] border-b border-border">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    activeCategory === cat.id ? 'bg-accent text-white' : 'bg-white border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {categories.length === 0 ? (
          <div className="py-16 text-center">
            <ChefHat className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg font-bold text-foreground">Cardápio em construção</p>
            <p className="text-muted-foreground text-sm mt-2">Este estabelecimento está preparando seu cardápio. Volte em breve!</p>
          </div>
        ) : (
          categories
            .filter(cat => !activeCategory || cat.id === activeCategory)
            .map(cat => {
              const catProducts = products.filter(p => p.category_id === cat.id);
              if (catProducts.length === 0) return null;
              return (
                <div key={cat.id}>
                  <h2 className="font-bold text-foreground text-lg mb-4">{cat.name}</h2>
                  <div className="space-y-3">
                    {catProducts.map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        productExtras={productExtras}
                        onAdd={addToCart}
                        isOpen={businessStatus.isOpen}
                      />
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && !showCart && !showCheckout && businessStatus.isOpen && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-40">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-3 px-8 py-4 bg-accent text-white rounded-2xl font-semibold shadow-xl"
          >
            <ShoppingCart className="w-5 h-5" />
            Ver carrinho ({cartCount}) · R$ {subtotal.toFixed(2)}
          </button>
        </div>
      )}

      {/* Cart Sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="relative w-full bg-white rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground text-lg">Seu Pedido</h2>
              <button onClick={() => setShowCart(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div>
              {cart.map(item => (
                <CartItem key={item.cartKey} item={item} onIncrease={increaseQty} onDecrease={decreaseQty} />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <span>Entrega ({checkout.neighborhood})</span><span>R$ {deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground text-lg mt-2">
                <span>Total</span><span>R$ {total.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={() => { setShowCart(false); setShowCheckout(true); }}
              className="w-full mt-5 py-4 bg-accent text-white rounded-2xl font-bold text-lg"
            >
              Fechar Pedido →
            </button>
          </div>
        </div>
      )}

      {/* Checkout Sheet */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCheckout(false)} />
          <div className="relative w-full bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-foreground text-lg">Finalizar Pedido</h2>
                <button onClick={() => setShowCheckout(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              {/* Closed alert inside checkout */}
              {!businessStatus.isOpen && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700">O estabelecimento está fechado no momento. Não é possível finalizar o pedido.</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome *</label>
                    <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Seu nome" value={checkout.name} onChange={e => setCheckout({ ...checkout, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telefone *</label>
                    <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="(11) 9 9999-9999" value={checkout.phone} onChange={e => setCheckout({ ...checkout, phone: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Tipo</label>
                  <div className="flex gap-3">
                    {[{ key: 'delivery', label: '🚚 Entrega' }, { key: 'pickup', label: '📦 Retirada' }].map(t => (
                      <button
                        key={t.key}
                        onClick={() => { setCheckout({ ...checkout, type: t.key, neighborhood: '' }); setNeighborhoodError(''); }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${checkout.type === t.key ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {checkout.type === 'delivery' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Bairro / Região *</label>
                      {zones.length > 0 ? (
                        <>
                          <select
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white ${regionBlocked ? 'border-red-400' : 'border-border'}`}
                            value={checkout.neighborhood}
                            onChange={e => handleNeighborhoodChange(e.target.value)}
                          >
                            <option value="">Selecione o bairro...</option>
                            {zones.map(z => <option key={z.id} value={z.name}>{z.name} — R$ {z.fee?.toFixed(2)}</option>)}
                          </select>
                          {neighborhoodError && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                              <p className="text-xs text-red-600">{neighborhoodError}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <input
                          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                          placeholder="Bairro"
                          value={checkout.neighborhood}
                          onChange={e => setCheckout({ ...checkout, neighborhood: e.target.value })}
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Endereço completo *</label>
                      <input className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Rua, número, complemento" value={checkout.address} onChange={e => setCheckout({ ...checkout, address: e.target.value })} />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Pagamento</label>
                  <div className="flex gap-2">
                    {[{ key: 'pix', label: 'Pix' }, { key: 'dinheiro', label: 'Dinheiro' }, { key: 'cartao', label: 'Cartão' }].map(p => (
                      <button
                        key={p.key}
                        onClick={() => setCheckout({ ...checkout, payment_method: p.key })}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${checkout.payment_method === p.key ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground'}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Observações do pedido</label>
                  <textarea
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                    rows={2}
                    placeholder="Ex: Sem cebola em tudo, troco para R$50..."
                    value={checkout.notes}
                    onChange={e => setCheckout({ ...checkout, notes: e.target.value })}
                  />
                </div>

                <div className="bg-secondary rounded-2xl p-4">
                  <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground mb-1">
                      <span>Entrega</span><span>R$ {deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-foreground text-lg mt-2">
                    <span>Total</span><span className="text-accent">R$ {total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Bloqueios explícitos */}
                {!businessStatus.isOpen && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-center">
                    <p className="text-sm font-semibold text-orange-700">Estabelecimento fechado</p>
                    <p className="text-xs text-orange-500 mt-0.5">Não é possível finalizar pedidos agora.</p>
                  </div>
                )}
                {regionBlocked && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                    <p className="text-sm font-semibold text-red-700">Região não atendida</p>
                    <p className="text-xs text-red-500 mt-0.5">Selecione um bairro da lista de regiões atendidas.</p>
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={
                    placing ||
                    !checkout.name ||
                    !checkout.phone ||
                    !businessStatus.isOpen ||
                    regionBlocked ||
                    (checkout.type === 'delivery' && (!checkout.address || !checkout.neighborhood))
                  }
                  className="w-full py-4 bg-accent text-white rounded-2xl font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
                >
                  {placing ? 'Enviando pedido...' : !businessStatus.isOpen ? 'Estabelecimento Fechado' : regionBlocked ? 'Região não atendida' : `Confirmar Pedido · R$ ${total.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}