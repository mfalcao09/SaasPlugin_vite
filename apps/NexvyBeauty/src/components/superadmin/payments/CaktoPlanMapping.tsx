import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncAllCaktoPlans, type CaktoPlanSyncResult } from '@/hooks/usePlatformPlans';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Loader2,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number | null;
  price_yearly: number | null;
  cakto_product_id: string | null;
  checkout_url: string | null;
  checkout_url_yearly: string | null;
}

const moneyBR = (v: number | null) =>
  v == null ? '' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

function CheckoutLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {url && url !== '#' ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-primary hover:underline break-all"
        >
          {url.replace(/^https?:\/\//, '')}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">— gerado ao sincronizar</span>
      )}
    </div>
  );
}

export function CaktoPlanMapping() {
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ['platform-plans-cakto'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('id,name,slug,price_monthly,price_yearly,cakto_product_id,checkout_url,checkout_url_yearly')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as Plan[]) ?? [];
    },
  });

  const syncAll = useSyncAllCaktoPlans();
  const [results, setResults] = useState<Record<string, CaktoPlanSyncResult>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSyncAll = async () => {
    try {
      const res = await syncAll.mutateAsync();
      const map: Record<string, CaktoPlanSyncResult> = {};
      res.forEach((r) => (map[r.plan_id] = r));
      setResults(map);
      const synced = res.filter((r) => r.status === 'synced').length;
      const noMatch = res.filter((r) => r.status === 'no_product_match').length;
      toast.success(
        `${synced} plano(s) sincronizado(s)` + (noMatch ? ` · ${noMatch} sem produto na Cakto` : ''),
      );
      qc.invalidateQueries({ queryKey: ['platform-plans-cakto'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao sincronizar');
    }
  };

  // Override manual: usado só quando o nome do produto na Cakto difere do plano.
  const handleSaveProduct = async (planId: string) => {
    const v = overrides[planId]?.trim();
    setSavingId(planId);
    try {
      const { error } = await supabase
        .from('platform_plans')
        .update({ cakto_product_id: v || null } as any)
        .eq('id', planId);
      if (error) throw error;
      toast.success('Vínculo salvo. Clique em "Sincronizar com a Cakto" para gerar os links.');
      qc.invalidateQueries({ queryKey: ['platform-plans-cakto'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro');
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando planos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Vínculo dos planos com a Cakto</CardTitle>
              <CardDescription>
                Clique em sincronizar: a plataforma busca seus produtos na Cakto, casa cada um com o
                plano correspondente (por nome ou preço) e <strong>gera os links de checkout
                automaticamente</strong>. Você não precisa colar nada.
              </CardDescription>
            </div>
            <Button onClick={handleSyncAll} disabled={syncAll.isPending} className="shrink-0">
              {syncAll.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar com a Cakto
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {plans?.map((plan) => {
          const result = results[plan.id];
          const isFree = !plan.price_monthly && !plan.price_yearly;
          return (
            <Card key={plan.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan.slug}
                      {plan.price_monthly ? ` · ${moneyBR(plan.price_monthly)}/mês` : ''}
                      {plan.price_yearly ? ` · ${moneyBR(plan.price_yearly)}/ano` : ''}
                    </div>
                  </div>
                  <StatusPill plan={plan} result={result} isFree={isFree} />
                </div>

                {isFree ? (
                  <p className="text-sm text-muted-foreground">
                    Plano gratuito — não gera checkout na Cakto.
                  </p>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <CheckoutLink label="Checkout mensal" url={plan.checkout_url} />
                      <CheckoutLink label="Checkout anual" url={plan.checkout_url_yearly} />
                    </div>

                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground select-none">
                        Vincular produto manualmente (avançado)
                      </summary>
                      <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div className="flex-1">
                          <Label className="text-xs">ID do produto Cakto</Label>
                          <Input
                            value={overrides[plan.id] ?? plan.cakto_product_id ?? ''}
                            onChange={(e) =>
                              setOverrides((p) => ({ ...p, [plan.id]: e.target.value }))
                            }
                            placeholder="auto (deixe vazio para casar por nome/preço)"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveProduct(plan.id)}
                          disabled={savingId === plan.id}
                        >
                          {savingId === plan.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Salvar vínculo
                        </Button>
                      </div>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({
  plan,
  result,
  isFree,
}: {
  plan: Plan;
  result?: CaktoPlanSyncResult;
  isFree: boolean;
}) {
  if (isFree) return null;

  // Após uma sincronização, mostra o resultado dela.
  if (result) {
    if (result.status === 'synced') {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" /> Sincronizado
          {result.product_name ? ` · ${result.product_name}` : ''}
        </span>
      );
    }
    if (result.status === 'no_product_match') {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" /> Sem produto na Cakto
        </span>
      );
    }
    if (result.status === 'error') {
      return (
        <span className="flex items-center gap-1 text-xs text-destructive" title={result.error}>
          <AlertCircle className="h-4 w-4" /> Erro
        </span>
      );
    }
  }

  // Estado em repouso (antes de sincronizar).
  return plan.checkout_url && plan.checkout_url !== '#' ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2 className="h-4 w-4" /> Vinculado
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <AlertCircle className="h-4 w-4" /> Pendente
    </span>
  );
}
