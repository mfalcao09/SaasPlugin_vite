import { Fragment, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Loader2, Play, Check } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  usePayoutBatches,
  useProcessPayoutBatch,
  useConfirmPayoutItem,
  type PayoutBatchStatus,
  type PayoutItemStatus,
} from '@/hooks/useAffiliatePayout';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const BATCH_META: Record<PayoutBatchStatus, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground border-border' },
  processing: { label: 'Processando', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  completed: { label: 'Concluído', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  failed: { label: 'Falhou', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const ITEM_META: Record<PayoutItemStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  paid: { label: 'Pago', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  failed: { label: 'Falhou', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export function PayoutBatchesTable() {
  const { data, isLoading } = usePayoutBatches();
  const process = useProcessPayoutBatch();
  const confirmItem = useConfirmPayoutItem();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const batches = data?.batches ?? [];

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleProcess = async (batchId: string) => {
    if (!confirm('Processar o lote? As comissões aprovadas serão marcadas como pagas.')) return;
    try {
      const r = await process.mutateAsync(batchId);
      toast.success(`Lote processado: ${r.paid_count} pago(s), ${r.failed_count} com falha`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao processar');
    }
  };

  const handleConfirmItem = async (itemId: string) => {
    if (!confirm('Confirmar pagamento manual deste item? As comissões serão marcadas como pagas.')) return;
    try {
      await confirmItem.mutateAsync({ item_id: itemId });
      toast.success('Item confirmado como pago');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao confirmar');
    }
  };

  const busy = process.isPending || confirmItem.isPending;

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">Nenhum lote de pagamento ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Lote</TableHead>
                <TableHead>Provedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const meta = BATCH_META[b.status];
                const isOpen = expanded.has(b.id);
                const items = b.items ?? [];
                return (
                  <Fragment key={b.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(b.id)}>
                      <TableCell>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{b.provider}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{b.items_count}</TableCell>
                      <TableCell className="text-right font-medium">{brl(b.total_cents)}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {b.created_at ? format(new Date(b.created_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {b.status !== 'completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProcess(b.id);
                            }}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" /> Processar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-3">
                            {items.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem itens.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Afiliado</TableHead>
                                    <TableHead>Chave PIX</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Comprovante</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map((it) => {
                                    const im = ITEM_META[it.status];
                                    return (
                                      <TableRow key={it.id}>
                                        <TableCell className="font-medium">
                                          {it.affiliate_name ?? it.affiliate_id}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                          {it.pix_key ?? <span className="text-destructive">sem PIX</span>}
                                        </TableCell>
                                        <TableCell className="text-right">{brl(it.amount_cents)}</TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className={im.className}>
                                            {im.label}
                                          </Badge>
                                          {it.error && (
                                            <span className="block text-xs text-destructive mt-1">{it.error}</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                          {it.provider_ref ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {it.status !== 'paid' && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              disabled={busy}
                                              onClick={() => handleConfirmItem(it.id)}
                                            >
                                              <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Confirmar pago
                                            </Button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
