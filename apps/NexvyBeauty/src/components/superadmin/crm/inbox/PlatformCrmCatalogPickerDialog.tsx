import { useMemo, useState } from 'react';
import { Search, Package, Loader2, ImageOff, ExternalLink, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';
import type { PlatformCrmMediaPayload as MediaPayload } from './PlatformCrmMediaAttachment';

/**
 * Seletor de catálogo para enviar produto/plano no chat — porte fiel A1.2 de
 * `seller/inbox/CatalogPickerDialog.tsx` (Vendus v5 original).
 *
 * Adaptação de dados: `product_catalog_items` (tenant, org-scoped) →
 * `platform_crm_products` (catálogo do GRUPO — planos SaaS). Cada item
 * exibido é um PLANO ativo de um produto (`pricing` Json = ProductPlan[]);
 * o link do card vem de `external_links.checkout || external_links.site`.
 */
interface CatalogItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  thumbnail_url: string | null;
  images: string[] | null;
  tags: string[] | null;
}

interface PlatformCrmCatalogPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string | null;
  onSend: (text: string, media?: MediaPayload) => void;
}

function formatMoney(value: number | null, currency = 'BRL') {
  if (value == null) return '';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

/**
 * Plano dentro do Json `pricing` de platform_crm_products.
 * Shape REAL em prod (conferido 2026-07-09):
 *   { "planos": [{ "nome": "Essencial", "preco_mensal": 217, "publico"?, "nota"? }],
 *     "fonte_precos": "platform_plans via LP — NUNCA inventar preco" }
 * Campos EN (name/price/billing_cycle) mantidos como fallback defensivo.
 */
interface ProductPlanJson {
  id?: string;
  name?: string;
  nome?: string;
  price?: number;
  preco_mensal?: number;
  publico?: string;
  billing_cycle?: string;
  features?: string[];
  active?: boolean;
}

/** Normaliza o Json `pricing` (objeto {planos:[...]} real OU array legado). */
function extractPlans(pricing: unknown): ProductPlanJson[] {
  if (Array.isArray(pricing)) return pricing as ProductPlanJson[];
  if (pricing && typeof pricing === 'object' && Array.isArray((pricing as any).planos)) {
    return (pricing as any).planos as ProductPlanJson[];
  }
  return [];
}

const billingCycleLabels: Record<string, string> = {
  mensal: 'mês',
  trimestral: 'trimestre',
  semestral: 'semestre',
  anual: 'ano',
  unico: 'único',
};

export function PlatformCrmCatalogPickerDialog({ open, onOpenChange, productId, onSend }: PlatformCrmCatalogPickerDialogProps) {
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: products = [], isLoading } = usePlatformCrmProducts();

  // Achata produto × plano ativo no shape de item de catálogo do v5.
  const items: CatalogItem[] = useMemo(() => {
    const source = productId ? products.filter((p) => p.id === productId) : products;
    const out: CatalogItem[] = [];
    for (const p of source) {
      const thumbnail =
        (p as any).product_image_url || (p as any).logo_url || (p as any).banner_url || null;
      const links = ((p as any).external_links || {}) as Record<string, string>;
      const url = links.checkout || links.site || null;
      const description = (p as any).short_description || p.description || null;
      const plans = extractPlans(p.pricing);
      const activePlans = plans.filter((pl) => pl && pl.active !== false);

      if (activePlans.length === 0) {
        // Produto sem planos cadastrados — ainda aparece no catálogo (sem preço).
        out.push({
          id: p.id,
          title: p.name,
          description,
          price: null,
          currency: 'BRL',
          url,
          thumbnail_url: thumbnail,
          images: null,
          tags: p.category ? [p.category] : null,
        });
        continue;
      }

      for (const plan of activePlans) {
        const planName = plan.nome ?? plan.name ?? null;
        const planPrice =
          typeof plan.preco_mensal === 'number' ? plan.preco_mensal
          : typeof plan.price === 'number' ? plan.price
          : null;
        // preco_mensal → ciclo mensal implícito no shape real
        const cycle = plan.billing_cycle
          ? billingCycleLabels[plan.billing_cycle] || plan.billing_cycle
          : typeof plan.preco_mensal === 'number' ? 'mês' : null;
        out.push({
          id: `${p.id}:${plan.id ?? planName ?? 'plano'}`,
          title: planName ? `${p.name} — ${planName}` : p.name,
          description:
            description ||
            plan.publico ||
            (plan.features && plan.features.length ? plan.features.slice(0, 3).join(' · ') : null),
          price: planPrice,
          currency: 'BRL',
          url,
          thumbnail_url: thumbnail,
          images: null,
          tags: [p.category, cycle ? `por ${cycle}` : null].filter(Boolean) as string[],
        });
      }
    }
    return out;
  }, [products, productId]);

  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.description?.toLowerCase().includes(search.toLowerCase()) ||
    i.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSend = async (item: CatalogItem) => {
    setSendingId(item.id);
    const lines: string[] = [`*${item.title}*`];
    if (item.price != null) lines.push(formatMoney(item.price, item.currency || 'BRL'));
    if (item.description) lines.push('', item.description.slice(0, 280));
    if (item.url) lines.push('', `🔗 ${item.url}`);
    const text = lines.join('\n');

    const imageUrl = item.thumbnail_url || item.images?.[0];
    let media: MediaPayload | undefined;
    if (imageUrl) {
      media = {
        kind: 'image',
        url: imageUrl,
        filename: item.title,
      };
    }

    onSend(text, media);
    setSendingId(null);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de produtos
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, descrição ou etiqueta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">{items.length === 0 ? 'Nenhum item no catálogo' : 'Nada encontrado'}</p>
              <p className="text-xs mt-1">
                {items.length === 0
                  ? 'Cadastre produtos no catálogo para enviá-los rapidamente no chat.'
                  : 'Tente outros termos de busca.'}
              </p>
            </div>
          ) : (
            <div className="p-3 grid gap-2 sm:grid-cols-2">
              {filtered.map(item => (
                <Card key={item.id} className="overflow-hidden hover:border-primary/50 transition-all group">
                  <div className="flex gap-3 p-3">
                    <div className="w-16 h-16 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {item.thumbnail_url || item.images?.[0] ? (
                        <img
                          src={item.thumbnail_url || item.images![0]}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                      {item.price != null && (
                        <p className="text-sm font-semibold text-primary">{formatMoney(item.price, item.currency || 'BRL')}</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleSend(item)}
                          disabled={sendingId === item.id}
                        >
                          {sendingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Enviar</>}
                        </Button>
                        {item.url && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
