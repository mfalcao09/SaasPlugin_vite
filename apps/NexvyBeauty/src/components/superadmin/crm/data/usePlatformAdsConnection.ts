import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Meta Ads (super_admin, PRODUCT-scoped) — status + OAuth start + sync manual.
 *
 * Fonte de verdade: tabela `ads_platform_connections` (product-scoped, RLS
 * `ads_platform_connections_super_admin_only` — o super_admin lê direto via
 * supabase-js). Edges consumidas:
 *   • ads-oauth-start  → { authorize_url }  (o browser redireciona pra Meta)
 *   • ads-sync         → { ok, accounts, campaigns, adsets, ads, metrics_rows }
 *
 * ⚠️ `ads_platform_connections` ainda NÃO está nos types gerados do supabase
 * (schema recém-criado, regen numa fase posterior de deploy). Por isso a query
 * usa cast localizado (`as never` no nome da tabela) + interface local — sem
 * inventar tipos no arquivo gerado.
 */

export type AdsConnectionStatus = 'pending' | 'active' | 'error' | 'revoked';

export interface AdsPlatformConnection {
  id: string;
  product_id: string;
  platform: string; // 'meta'
  status: AdsConnectionStatus;
  last_error: string | null;
  external_business_id: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AdsSyncSummary {
  ok: boolean;
  accounts: number;
  campaigns: number;
  adsets: number;
  ads: number;
  metrics_rows: number;
  error?: string;
}

/**
 * Conexão Meta Ads do produto ativo. `null` em productId desabilita a query
 * (nada pra buscar). Retorna a conexão mais recente (por created_at) do par
 * (product_id, platform='meta') ou `null` quando ainda não há nenhuma.
 */
export function usePlatformAdsConnection(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-connection', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_platform_connections' as never)
        .select('*')
        .eq('product_id', productId as string)
        .eq('platform', 'meta')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AdsPlatformConnection[];
      return rows[0] ?? null;
    },
  });
}

/**
 * Inicia o OAuth (Facebook Login for Business). Em sucesso redireciona o browser
 * pra `authorize_url`. Erros de negócio da edge vêm como HTTP 200 `{error}` — por
 * isso checamos tanto `error` quanto `(data as any).error`.
 */
export function useStartAdsOAuth() {
  return useMutation({
    mutationFn: async (product_id: string) => {
      const { data, error } = await supabase.functions.invoke('ads-oauth-start', {
        body: { product_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.authorize_url as string | undefined;
      if (!url) throw new Error('authorize_url ausente na resposta');
      return url;
    },
    onSuccess: (authorize_url) => {
      // Redireciona o browser pra tela de consentimento da Meta.
      window.location.href = authorize_url;
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao iniciar conexão com a Meta'),
  });
}

/**
 * Dispara o sync manual ("Sincronizar agora"). A edge devolve `{ ok, ...summary }`
 * ou `{ ok:false, error }` (HTTP 200). Mostra sumário/erro em toast e revalida o
 * status da conexão.
 */
export function useSyncAds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product_id: string) => {
      const { data, error } = await supabase.functions.invoke('ads-sync', {
        body: { product_id },
      });
      if (error) throw error;
      const res = data as AdsSyncSummary;
      if (res?.ok === false) throw new Error(res?.error ?? 'Falha na sincronização');
      return res;
    },
    onSuccess: (res, product_id) => {
      qc.invalidateQueries({ queryKey: ['platform-ads-connection', product_id] });
      toast.success('Sincronização concluída', {
        description: `${res.accounts} conta(s) · ${res.campaigns} campanha(s) · ${res.adsets} conjunto(s) · ${res.ads} anúncio(s) · ${res.metrics_rows} métrica(s)`,
      });
    },
    onError: (e: any, product_id) => {
      qc.invalidateQueries({ queryKey: ['platform-ads-connection', product_id] });
      toast.error(e?.message ?? 'Falha ao sincronizar Meta Ads');
    },
  });
}
