import React, { useState } from 'react';
import DemoMode from './DemoMode';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from '@/lib/demo-data';
import { Star, Eye, EyeOff, Plus } from 'lucide-react';

export default function DemoCardapio() {
  const [activeCategory, setActiveCategory] = useState('c1');

  const categoryProducts = DEMO_PRODUCTS.filter(p => p.category_id === activeCategory);

  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cardápio</h1>
            <p className="text-sm text-muted-foreground mt-1">{DEMO_CATEGORIES.length} categorias · {DEMO_PRODUCTS.length} produtos</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Categorias sidebar */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Categorias</p>
            {DEMO_CATEGORIES.map(cat => {
              const count = DEMO_PRODUCTS.filter(p => p.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-accent/10 border-accent/30 text-accent font-semibold'
                      : 'bg-white border-border text-foreground hover:border-accent/20'
                  }`}
                >
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} produtos</p>
                </button>
              );
            })}
            <button className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-border text-muted-foreground hover:border-accent/30 transition-colors">
              <p className="text-sm">+ Nova Categoria</p>
            </button>
          </div>

          {/* Produtos */}
          <div className="md:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">
                {DEMO_CATEGORIES.find(c => c.id === activeCategory)?.name}
              </p>
              <span className="text-xs text-muted-foreground">{categoryProducts.length} produtos</span>
            </div>
            {categoryProducts.map(product => (
              <div key={product.id} className="bg-white border border-border rounded-xl p-4 flex items-center gap-4">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center text-2xl">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{product.name}</p>
                    {product.featured && (
                      <span className="flex items-center gap-1 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                        <Star className="w-3 h-3" /> Destaque
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                  )}
                  <p className="font-bold text-accent mt-2">R$ {product.price.toFixed(2)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="px-3 py-2 border border-border rounded-lg hover:bg-secondary transition-colors text-sm text-muted-foreground">
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DemoMode>
  );
}