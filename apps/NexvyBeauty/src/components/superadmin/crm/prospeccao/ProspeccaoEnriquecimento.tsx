import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Loader2, PackageSearch, Phone, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { useImportHandles } from '@/components/superadmin/crm/data/usePlatformProspeccao';
import { fmtNum } from '@/components/superadmin/crm/prospeccao/_shared';

/**
 * ENRIQUECIMENTO (UI) — roda o Apify SÓ na fila "Sem WhatsApp" (telefone e whatsapp_link
 * nulos) para descobrir telefone. Ao encontrar, o lead migra de aba sozinho (Sem → Número),
 * porque a aba é derivada das colunas (ver classifyWhatsapp).
 *
 * HONESTO SOBRE O MOTOR: o botão é REAL (invoca `leads-import-handles` = Apify, custo/perfil).
 * Se a conta Apify estiver sem saldo, o disparo falha com "Monthly usage hard limit exceeded"
 * e o erro é mostrado aqui — não fingimos enriquecer.
 */

const BATCH = 200; // teto da edge leads-import-handles por chamada

function useSemWhatsappQueue(productId: string | null) {
  return useQuery({
    queryKey: ['prospeccao-sem-wpp-count', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId as string)
        .is('telefone', null)
        .is('whatsapp_link', null)
        .is('excluded_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function ProspeccaoEnriquecimento() {
  const { effectiveProductId, activeProductId, products } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const isAllProducts = activeProductId == null && products.length > 1;
  const { data: queueCount, isLoading, refetch } = useSemWhatsappQueue(isAllProducts ? null : productId);
  const importHandles = useImportHandles();
  const [lastError, setLastError] = useState<string | null>(null);

  const enrichNext = async () => {
    if (!productId) return;
    setLastError(null);
    const { data, error } = await supabase
      .from('platform_crm_extracted_leads' as never)
      .select('handle')
      .eq('product_id', productId)
      .is('telefone', null)
      .is('whatsapp_link', null)
      .is('excluded_at', null)
      .not('handle', 'is', null)
      .limit(BATCH);
    if (error) { setLastError(error.message); return; }
    const handles = ((data ?? []) as unknown as { handle: string | null }[])
      .map((r) => r.handle)
      .filter((h): h is string => !!h);
    if (handles.length === 0) { setLastError('Fila vazia — nenhum lead sem WhatsApp para enriquecer.'); return; }
    try {
      await importHandles.mutateAsync({ product_id: productId, handles });
      refetch();
    } catch (e: any) {
      setLastError(e?.message ?? 'Falha ao enriquecer.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Enriquecimento (UI)
        </h1>
        <p className="text-muted-foreground mt-1">
          Roda o Apify só nos leads da fila <b>"Sem WhatsApp"</b> para descobrir telefone. Ao encontrar, o lead
          migra de aba sozinho (Sem → Número) na tela de Buscas.
        </p>
      </div>

      {isAllProducts ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <PackageSearch className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">Selecione um produto no topo (ex.: <b>NexvyBeauty</b>) para ver a fila.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Motor: Apify (consome saldo).</p>
              <p className="text-muted-foreground">
                Cada perfil custa ~US$0,0026. Se a conta Apify estiver <b>sem saldo</b>, o disparo falha com
                "Monthly usage hard limit exceeded" — recarregue a conta para habilitar. O botão abaixo é real:
                dispara de verdade e mostra o erro do motor se ele estiver desligado.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium"><Phone className="h-4 w-4" /> Fila "Sem WhatsApp"</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : fmtNum(queueCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">leads sem telefone nem link</div>
            </div>
            <div className="ml-auto">
              <Button onClick={enrichNext} disabled={importHandles.isPending || !queueCount} className="gap-2">
                {importHandles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Enriquecer próximos {Math.min(BATCH, queueCount ?? 0)}
              </Button>
            </div>
          </div>

          {lastError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {lastError}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Processa em lotes de {BATCH} (teto da edge). O resultado vira uma busca nova; os que ganharem telefone
            saltam para a aba "Número" na tela de Buscas.
          </p>
        </>
      )}
    </div>
  );
}

export default ProspeccaoEnriquecimento;
