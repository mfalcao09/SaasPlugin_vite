import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EffectivePlan {
  plan_id: string | null;
  plan_name: string;
  plan_slug: string;
  limits: {
    max_users: number;
    max_connections: number;
    max_professionals: number | null;
    max_sectors: number;
    max_products: number;
    max_contacts: number;
    max_messages_month: number;
    max_ai_tokens_month: number;
    max_ai_agents: number;
  };
  features: Record<string, boolean>;
}

export function useOrganizationEffectivePlan(orgId?: string | null) {
  return useQuery({
    queryKey: ['org-effective-plan', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc('get_organization_effective_limits', {
        p_org_id: orgId,
      });
      if (error) throw error;
      return data as unknown as EffectivePlan | null;
    },
    enabled: !!orgId,
  });
}

/**
 * Uso de CANAIS de WhatsApp da org — a MESMA fonte que os gates das edges.
 *
 * REGRA (decisão Marcelo 2026-08-01, verbatim: "Consome o mesmo slot"):
 * `max_connections` conta canais somando Evolution (QR) + Meta Cloud (Oficial).
 *
 * ⚠️ NÃO derive `used` de `instances.length` na tela. Era exatamente isso que o
 * badge fazia, e por isso exibiria "1 / 1 usadas" numa org com 1 QR + 1 Oficial.
 * O gate do servidor e a tela têm que ler a MESMA função, senão a tela volta a
 * divergir do que o servidor impede.
 *
 * ⚠️ `data` vem NULL quando a RPC RECUSA a leitura (gate `auth.role()` no topo
 * dela) — e isso NÃO é `error`: a query resolve com sucesso. Quem consome trata
 * "não sei" como desconhecido; nunca preenche com default.
 */
export interface OrgChannelUsage {
  limit: number;
  used: number;
  by_type: { evolution: number; meta: number };
}

export function useOrgChannelUsage(orgId?: string | null) {
  return useQuery({
    queryKey: ['org-channel-usage', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      // `as any` no nome: a RPC é nova e `types.ts` (gerado) ainda não a
      // conhece. Mesmo idioma já usado no repo para RPCs recém-criadas
      // (get_invitation_by_token, get_auth_user_id_by_email, …); some quando
      // os types forem regenerados, o que aqui é sempre commit próprio.
      const { data, error } = await supabase.rpc('get_org_channel_usage' as any, {
        p_org_id: orgId,
      });
      if (error) throw error;
      return data as unknown as OrgChannelUsage | null;
    },
    enabled: !!orgId,
  });
}

export function useChangeOrganizationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, planId }: { orgId: string; planId: string | null }) => {
      const { error } = await supabase
        .from('organizations')
        .update({ plan_id: planId })
        .eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['org-effective-plan', vars.orgId] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
