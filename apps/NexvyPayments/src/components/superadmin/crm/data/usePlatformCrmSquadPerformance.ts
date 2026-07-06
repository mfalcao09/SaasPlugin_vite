import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';

/**
 * CRM de PLATAFORMA (super_admin) — performance de um squad no mês corrente:
 * vendas (`platform_crm_deals` status=won), conversão (`platform_crm_leads`
 * vs `platform_crm_pipeline_stages.is_won`), meta (`platform_crm_sales_goals`)
 * e top vendedor. Port 1:1 do `useSquadPerformance` do CRM Vendus, apontando
 * para as tabelas `platform_crm_*` e SEM organization_id / product_id — a RLS
 * super_admin-only isola os dados.
 *
 * NOTE: comissões vivem em `platform_crm_commissions`; a performance de squad
 * é medida por deal_value (mesma métrica do original), não por comissão.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export interface PlatformCrmMemberPerformance {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: string;
  dealsCount: number;
  totalValue: number;
  targetValue: number;
  progressPercent: number;
}

export interface PlatformCrmSquadPerformance {
  squadId: string;
  membersCount: number;
  totalDeals: number;
  totalValue: number;
  targetValue: number;
  progressPercent: number;
  conversionRate: number;
  topSeller?: {
    id: string;
    name: string;
    value: number;
  };
  memberPerformances: PlatformCrmMemberPerformance[];
}

export function usePlatformCrmSquadPerformance(squadId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'squad-performance', squadId],
    enabled: !!squadId,
    queryFn: async (): Promise<PlatformCrmSquadPerformance | null> => {
      if (!squadId) return null;

      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      // Membros do squad
      const { data: members } = await supabase
        .from('platform_crm_squad_members')
        .select('user_id, role')
        .eq('squad_id', squadId);

      if (!members?.length) {
        return {
          squadId,
          membersCount: 0,
          totalDeals: 0,
          totalValue: 0,
          targetValue: 0,
          progressPercent: 0,
          conversionRate: 0,
          memberPerformances: [],
        };
      }

      const memberIds = members.map((m) => m.user_id);

      // Deals ganhos deste mês
      const { data: deals } = await supabase
        .from('platform_crm_deals')
        .select('seller_id, deal_value, status')
        .in('seller_id', memberIds)
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      // Leads para taxa de conversão
      const { data: leads } = await supabase
        .from('platform_crm_leads')
        .select('id, assigned_to, current_stage_id')
        .in('assigned_to', memberIds);

      // Metas dos membros
      const { data: goals } = await supabase
        .from('platform_crm_sales_goals')
        .select('user_id, target_value')
        .in('user_id', memberIds)
        .gte('period_end', monthStart)
        .lte('period_start', monthEnd)
        .eq('is_active', true);

      // Perfis (nome/avatar)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', memberIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const roleMap = new Map(members.map((m) => [m.user_id, m.role ?? 'member']));

      const memberPerformances: PlatformCrmMemberPerformance[] = memberIds.map((userId) => {
        const profile = profileMap.get(userId);
        const memberDeals = deals?.filter((d) => d.seller_id === userId) ?? [];
        const memberGoal = goals?.find((g) => g.user_id === userId);
        const totalValue = memberDeals.reduce((sum, d) => sum + Number(d.deal_value), 0);
        const targetValue = Number(memberGoal?.target_value ?? 0);

        return {
          userId,
          userName: profile?.full_name || 'Usuário',
          userAvatar: profile?.avatar_url ?? null,
          role: roleMap.get(userId) || 'member',
          dealsCount: memberDeals.length,
          totalValue,
          targetValue,
          progressPercent:
            targetValue > 0 ? Math.min((totalValue / targetValue) * 100, 100) : 0,
        };
      });

      const totalDeals = deals?.length ?? 0;
      const totalValue = deals?.reduce((sum, d) => sum + Number(d.deal_value), 0) ?? 0;
      const totalTarget = memberPerformances.reduce((sum, m) => sum + m.targetValue, 0);

      // Stages "won" para taxa de conversão
      const { data: wonStages } = await supabase
        .from('platform_crm_pipeline_stages')
        .select('id')
        .eq('is_won', true);

      const wonStageIds = new Set((wonStages ?? []).map((s) => s.id));
      const totalLeads = leads?.length ?? 0;
      const wonLeads =
        leads?.filter((l) => l.current_stage_id && wonStageIds.has(l.current_stage_id))
          .length ?? 0;

      const sortedMembers = [...memberPerformances].sort(
        (a, b) => b.totalValue - a.totalValue,
      );
      const topSeller = sortedMembers[0];

      return {
        squadId,
        membersCount: members.length,
        totalDeals,
        totalValue,
        targetValue: totalTarget,
        progressPercent:
          totalTarget > 0 ? Math.min((totalValue / totalTarget) * 100, 100) : 0,
        conversionRate: totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0,
        topSeller:
          topSeller && topSeller.totalValue > 0
            ? { id: topSeller.userId, name: topSeller.userName, value: topSeller.totalValue }
            : undefined,
        memberPerformances,
      };
    },
  });
}
