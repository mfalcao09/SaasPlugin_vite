import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RadioTower, RefreshCw, ListChecks, ShieldCheck, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

type HermesOp = {
  id: string;
  kind: string;
  status: string;
  correlation_id: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
};

async function invokeBridge(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('platform-hermes-bridge', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

/**
 * Torre Hermes — hub gestao ↔ operador Hermes (Telegram espelho).
 * Aprovação de leads e ARM de campanha continuam nas telas Buscas/Campanhas.
 */
export function ProspeccaoTorreHermes() {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const qc = useQueryClient();
  const [limit, setLimit] = useState(10);

  const opsQuery = useQuery({
    queryKey: ['hermes-ops', productId],
    enabled: !!productId,
    refetchInterval: 8_000,
    queryFn: async (): Promise<HermesOp[]> => {
      const data = await invokeBridge({ action: 'list', product_id: productId, limit: 40 });
      return (data?.ops ?? []) as HermesOp[];
    },
  });

  const createOp = useMutation({
    mutationFn: async (kind: string) => {
      if (!productId) throw new Error('product_id ausente');
      const created = await invokeBridge({
        action: 'create',
        product_id: productId,
        kind,
        payload: { limit },
      });
      // Processamento sync no bridge para UX imediata (Hermes ainda pode poll/ack).
      if (kind === 'propose_list') {
        await invokeBridge({
          action: 'process_propose_list',
          product_id: productId,
          limit,
          op_id: created?.op?.id,
        });
      } else if (kind === 'request_preflight') {
        await invokeBridge({
          action: 'preflight_snapshot',
          product_id: productId,
          op_id: created?.op?.id,
        });
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hermes-ops', productId] }),
  });

  const latestPropose = useMemo(
    () => (opsQuery.data ?? []).find((o) => o.kind === 'propose_list' && o.status === 'done'),
    [opsQuery.data],
  );
  const latestPreflight = useMemo(
    () => (opsQuery.data ?? []).find((o) => o.kind === 'request_preflight' && o.status === 'done'),
    [opsQuery.data],
  );

  const selected = (latestPropose?.result as { selected?: unknown[] } | null)?.selected ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <RadioTower className="h-5 w-5" />
            Torre Hermes
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Hub gestao ↔ Hermes (Telegram espelho). Hermes propõe e vigia; você aprova leads em{' '}
            <b>Buscas/Base</b> e arma campanha em <b>Campanhas de disparo</b>. Hermes não envia WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => opsQuery.refetch()}
          disabled={opsQuery.isFetching}
        >
          {opsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      {!productId && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Selecione o produto NexvyBeauty no seletor da plataforma.
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm text-muted-foreground">
          Cap piloto
          <input
            type="number"
            min={1}
            max={10}
            value={limit}
            onChange={(e) => setLimit(Math.min(10, Math.max(1, Number(e.target.value) || 10)))}
            className="ml-2 w-16 rounded border bg-background px-2 py-1"
          />
        </label>
        <Button
          size="sm"
          disabled={!productId || createOp.isPending}
          onClick={() => createOp.mutate('propose_list')}
        >
          <ListChecks className="h-4 w-4 mr-2" />
          Pedir proposta de lista
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!productId || createOp.isPending}
          onClick={() => createOp.mutate('request_preflight')}
        >
          <ShieldCheck className="h-4 w-4 mr-2" />
          Pedir preflight
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!productId || createOp.isPending}
          onClick={() => createOp.mutate('request_dry_run_report')}
        >
          <Activity className="h-4 w-4 mr-2" />
          Pedir relatório dry-run
        </Button>
      </div>

      {createOp.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {(createOp.error as Error).message}
          {(createOp.error as Error).message.includes('hermes_bridge_disabled') && (
            <div className="mt-1 text-muted-foreground">
              Ative o secret <code>HERMES_BRIDGE_ENABLED=true</code> na edge e aplique a migration
              <code> 20260809_hermes_torre_ops.sql</code>.
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="font-medium text-sm">Última proposta (≤{limit})</h2>
          {!latestPropose && <p className="text-sm text-muted-foreground">Nenhuma proposta done ainda.</p>}
          {latestPropose && (
            <>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">{latestPropose.correlation_id}</Badge>
                <Badge>{latestPropose.status}</Badge>
              </div>
              <ul className="text-sm space-y-1 max-h-64 overflow-auto">
                {(selected as { lead_id: string; handle?: string; score?: number; telefone?: string }[]).map((row) => (
                  <li key={row.lead_id} className="font-mono text-xs border-b border-border/40 py-1">
                    {row.handle ?? '—'} · score {row.score ?? '—'} · {row.telefone ?? 'sem tel'}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Próximo passo humano: aprovar esses handles em Buscas/Base (<code>approved_at</code>).
              </p>
            </>
          )}
        </section>

        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="font-medium text-sm">Último preflight</h2>
          {!latestPreflight && <p className="text-sm text-muted-foreground">Nenhum preflight done ainda.</p>}
          {latestPreflight && (
            <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap">
              {JSON.stringify(latestPreflight.result, null, 2)}
            </pre>
          )}
        </section>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium text-sm mb-3">Timeline de ops</h2>
        {opsQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {opsQuery.isError && (
          <p className="text-sm text-destructive">{(opsQuery.error as Error).message}</p>
        )}
        <div className="space-y-2">
          {(opsQuery.data ?? []).map((op) => (
            <div key={op.id} className="flex flex-wrap items-center gap-2 text-xs border-b border-border/30 py-2">
              <Badge variant="outline">{op.kind}</Badge>
              <Badge variant={op.status === 'done' ? 'default' : 'secondary'}>{op.status}</Badge>
              <span className="font-mono text-muted-foreground">{op.correlation_id}</span>
              <span className="text-muted-foreground">{new Date(op.created_at).toLocaleString('pt-BR')}</span>
              {op.error_text && <span className="text-destructive">{op.error_text}</span>}
            </div>
          ))}
          {!opsQuery.isLoading && (opsQuery.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sem ops ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}
