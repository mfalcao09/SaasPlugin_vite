// Barra fixa da comanda (mobile-first) + drawer com o detalhe dos itens.
// Ancorada no rodapé assim que há 1 item na cesta: é o carrinho do e-commerce —
// o cliente precisa ver tempo e valor acumulados antes de avançar.
import { Button } from '@/components/ui/button';
import {
  Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger,
} from '@/components/ui/drawer';
import { ChevronRight, Clock, ShoppingBag, Trash2 } from 'lucide-react';
import { formatarDuracao, formatarMoeda, type ServicoPublico } from '@/hooks/useComandaBooking';

type Props = {
  itens: ServicoPublico[];
  duracaoTotal: number;
  valorTotal: number;
  onRemover: (id: string) => void;
  onAvancar: () => void;
  rotuloAvancar?: string;
};

export function ComandaBar({
  itens, duracaoTotal, valorTotal, onRemover, onAvancar, rotuloAvancar = 'Avançar',
}: Props) {
  if (itens.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Drawer>
          <DrawerTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-accent"
              aria-label="Ver detalhes da comanda"
            >
              <div className="relative shrink-0">
                <ShoppingBag className="h-6 w-6 text-primary" />
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {itens.length}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {itens.length} {itens.length === 1 ? 'serviço' : 'serviços'} · {formatarMoeda(valorTotal)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatarDuracao(duracaoTotal)} no total
                </div>
              </div>
            </button>
          </DrawerTrigger>

          <DrawerContent>
            <div className="mx-auto w-full max-w-2xl">
              <DrawerHeader>
                <DrawerTitle>Minha comanda</DrawerTitle>
              </DrawerHeader>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 pb-2">
                {itens.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatarDuracao(s.duracao_minutos ?? 60)} · {formatarMoeda(s.valor)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${s.nome}`}
                      onClick={() => onRemover(s.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t px-4 py-4">
                <div>
                  <div className="text-xs text-muted-foreground">{formatarDuracao(duracaoTotal)} no total</div>
                  <div className="text-lg font-semibold">{formatarMoeda(valorTotal)}</div>
                </div>
                <DrawerClose asChild>
                  <Button variant="outline">Continuar escolhendo</Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerContent>
        </Drawer>

        <Button className="h-11 shrink-0 px-5" onClick={onAvancar}>
          {rotuloAvancar}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
