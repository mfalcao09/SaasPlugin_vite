import { useState } from 'react';
import { Search, Package, Loader2, Send, Sparkles, Boxes, ShoppingBag } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSalaoCatalogo, type SalaoCatalogItem, type SalaoCatalogKind } from '@/hooks/useSalaoCatalogo';
import type { MediaPayload } from './MediaAttachment';

interface CatalogPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** legado do CRM (produto/funil da conversa) — IGNORADO no salão. */
  productId?: string | null;
  onSend: (text: string, media?: MediaPayload) => void;
}

function formatMoney(value: number | null) {
  if (value == null) return '';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

const TABS: { kind: SalaoCatalogKind; label: string; icon: typeof Sparkles }[] = [
  { kind: 'servico', label: 'Serviços', icon: Sparkles },
  { kind: 'pacote', label: 'Pacotes', icon: Boxes },
  { kind: 'produto', label: 'Produtos', icon: ShoppingBag },
];

export function CatalogPickerDialog({ open, onOpenChange, onSend }: CatalogPickerDialogProps) {
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { data: items = [], isLoading } = useSalaoCatalogo(open);

  const q = search.toLowerCase();
  const filtered = items.filter((i) =>
    i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q),
  );
  const byKind = (k: SalaoCatalogKind) => filtered.filter((i) => i.kind === k);

  const handleSend = (item: SalaoCatalogItem) => {
    setSendingId(item.id);
    const lines: string[] = [`*${item.title}*`];
    if (item.price != null) lines.push(formatMoney(item.price));
    if (item.meta) lines.push(item.meta);
    if (item.description) lines.push('', item.description.slice(0, 280));
    onSend(lines.join('\n'));
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
            Catálogo do negócio
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="servico" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-3 grid grid-cols-3">
              {TABS.map(({ kind, label, icon: Icon }) => (
                <TabsTrigger key={kind} value={kind} className="gap-1.5 text-xs">
                  <Icon className="h-3.5 w-3.5" />
                  {label} ({byKind(kind).length})
                </TabsTrigger>
              ))}
            </TabsList>

            {TABS.map(({ kind, label }) => {
              const list = byKind(kind);
              return (
                <TabsContent key={kind} value={kind} className="flex-1 min-h-0 mt-0">
                  <ScrollArea className="h-full">
                    {list.length === 0 ? (
                      <div className="p-12 text-center text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-medium">
                          {items.filter((i) => i.kind === kind).length === 0
                            ? `Nenhum item em ${label.toLowerCase()}`
                            : 'Nada encontrado'}
                        </p>
                        <p className="text-xs mt-1">
                          {items.filter((i) => i.kind === kind).length === 0
                            ? `Cadastre em "${label}" pra enviar rapidamente no chat.`
                            : 'Tente outros termos de busca.'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 grid gap-2 sm:grid-cols-2">
                        {list.map((item) => (
                          <Card key={item.id} className={cn('overflow-hidden hover:border-primary/50 transition-all')}>
                            <div className="p-3 space-y-1">
                              <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                              {item.price != null && (
                                <p className="text-sm font-semibold text-primary">{formatMoney(item.price)}</p>
                              )}
                              {item.meta && <p className="text-xs text-muted-foreground">{item.meta}</p>}
                              {item.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                              )}
                              <Button
                                size="sm"
                                className="h-7 text-xs w-full mt-2"
                                onClick={() => handleSend(item)}
                                disabled={sendingId === item.id}
                              >
                                {sendingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Enviar no chat</>}
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
