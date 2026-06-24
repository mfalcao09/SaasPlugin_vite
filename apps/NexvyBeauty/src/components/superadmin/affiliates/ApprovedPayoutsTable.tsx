import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useApprovedPayouts, useCreatePayoutBatch } from '@/hooks/useAffiliatePayout';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ApprovedPayoutsTable() {
  const { data, isLoading } = useApprovedPayouts();
  const createBatch = useCreatePayoutBatch();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = data?.groups ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.affiliate_id))));
  };

  const handleCreateBatch = async () => {
    const ids = Array.from(selected);
    try {
      await createBatch.mutateAsync({
        provider: 'manual',
        affiliate_ids: ids.length ? ids : undefined,
      });
      setSelected(new Set());
      toast.success('Lote de pagamento criado');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao criar lote');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {data ? (
            <>
              {data.affiliates_count} afiliado(s) com comissões aprovadas — total{' '}
              <span className="font-medium text-foreground">{brl(data.total_cents)}</span>
            </>
          ) : null}
        </div>
        <Button onClick={handleCreateBatch} disabled={createBatch.isPending || groups.length === 0}>
          {createBatch.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4 mr-2" />
          )}
          Gerar lote {selected.size > 0 ? `(${selected.size})` : '(todos)'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Nenhuma comissão aprovada aguardando pagamento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === groups.length && groups.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Chave PIX</TableHead>
                  <TableHead className="text-right">Comissões</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.affiliate_id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(g.affiliate_id)}
                        onCheckedChange={() => toggle(g.affiliate_id)}
                        aria-label={`Selecionar ${g.affiliate_name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{g.affiliate_name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {g.pix_key ?? <span className="text-destructive">sem PIX</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{g.commissions_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{brl(g.amount_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
