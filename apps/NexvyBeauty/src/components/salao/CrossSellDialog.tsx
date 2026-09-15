// Configura quais serviços são sugeridos quando o cliente adiciona ESTE serviço
// à comanda, no agendamento público. Sem regra cadastrada, o bloco de sugestão
// simplesmente não aparece — por isso esta tela existe.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// `servico_cross_sell` é posterior à última geração de src/integrations/supabase/types.ts.
// Mesmo escape já usado em pages/salao/Profissionais.tsx enquanto os tipos não são regerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

type ServicoOpcao = {
  id: string;
  nome: string;
  preco_base: number | null;
  duracao_minutos: number | null;
  tipo?: 'principal' | 'extra' | null;
};

type Props = {
  organizationId: string;
  servico: { id: string; nome: string } | null;
  servicos: ServicoOpcao[];
  onClose: () => void;
};

export function CrossSellDialog({ organizationId, servico, servicos, onClose }: Props) {
  const qc = useQueryClient();
  const [marcados, setMarcados] = useState<string[]>([]);

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ['cross-sell', servico?.id],
    enabled: !!servico?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('servico_cross_sell')
        .select('servico_sugerido_id')
        .eq('organization_id', organizationId)
        .eq('servico_origem_id', servico!.id);
      if (error) throw error;
      return (data ?? []).map((r: { servico_sugerido_id: string }) => r.servico_sugerido_id);
    },
  });

  useEffect(() => { setMarcados(regras); }, [regras]);

  const opcoes = useMemo(
    () => servicos.filter((s) => s.id !== servico?.id),
    [servicos, servico?.id],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const remover = regras.filter((id) => !marcados.includes(id));
      const inserir = marcados.filter((id) => !regras.includes(id));

      if (remover.length) {
        const { error } = await db.from('servico_cross_sell').delete()
          .eq('organization_id', organizationId)
          .eq('servico_origem_id', servico!.id)
          .in('servico_sugerido_id', remover);
        if (error) throw error;
      }
      if (inserir.length) {
        const { error } = await db.from('servico_cross_sell').insert(
          inserir.map((id, i) => ({
            organization_id: organizationId,
            servico_origem_id: servico!.id,
            servico_sugerido_id: id,
            // ordem de exibição: o primeiro marcado aparece primeiro
            prioridade: inserir.length - i,
            ativo: true,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cross-sell', servico?.id] });
      toast.success('Sugestões atualizadas!');
      onClose();
    },
    onError: () => toast.error('Erro ao salvar sugestões.'),
  });

  const alternar = (id: string) =>
    setMarcados((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <Dialog open={!!servico} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sugestões para “{servico?.nome}”</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Quem adicionar este serviço verá os marcados abaixo como sugestão no agendamento online.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : opcoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cadastre outros serviços para poder sugeri-los.
          </p>
        ) : (
          <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
            {opcoes.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <Checkbox checked={marcados.includes(s.id)} onCheckedChange={() => alternar(s.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.duracao_minutos ?? 30} min
                    {s.preco_base != null && ` · R$ ${Number(s.preco_base).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    {s.tipo === 'extra' && ' · extra'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || isLoading}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
