import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — tarefas do pipeline ÚNICO, desacoplado do
 * tenant. Toca APENAS `platform_crm_tasks`. Sem organization_id — a RLS
 * super_admin-only isola os dados. `product_id` EXISTE no schema (FK →
 * platform_crm_products) e alimenta o filtro global de produto (A1.3).
 *
 * O responsável (user_id) é resolvido contra `profiles` num passo separado
 * (não há FK declarada de user_id → profiles).
 */

export type PlatformCrmTask = Tables<'platform_crm_tasks'>;
export type PlatformCrmTaskInsert = TablesInsert<'platform_crm_tasks'>;
export type PlatformCrmTaskUpdate = TablesUpdate<'platform_crm_tasks'>;

/** Tarefa com o perfil do responsável embutido (resolvido client-side). */
export type PlatformCrmTaskWithAssignee = PlatformCrmTask & {
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

/** Tarefa com responsável + lead + produto embutidos (lista da Gestão de Tarefas). */
export type PlatformCrmTaskWithRefs = PlatformCrmTaskWithAssignee & {
  lead?: { id: string; name: string; company: string | null } | null;
  product?: { id: string; name: string } | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

/** Invalidação comum das mutações: lista global + listas por lead. */
function invalidateAllTaskQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tasks'] });
  queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'lead-tasks'] });
}

/**
 * TODAS as tarefas da plataforma (Gestão de Tarefas — módulo Vendas), ordenadas
 * por vencimento. Lead/produto via join FK declarada; responsável resolvido em
 * `profiles`. "Realtime leve": refetch em foco + intervalo de 60s (sem canal
 * supabase novo — decisão de escopo para não sobrecarregar).
 */
export function usePlatformCrmTasks() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'tasks'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PlatformCrmTaskWithRefs[]> => {
      const { data, error } = await supabase
        .from('platform_crm_tasks')
        .select(
          `
          *,
          lead:platform_crm_leads!platform_crm_tasks_lead_id_fkey (id, name, company),
          product:platform_crm_products!platform_crm_tasks_product_id_fkey (id, name)
        `,
        )
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const tasks = (data ?? []) as unknown as PlatformCrmTaskWithRefs[];

      const userIds = [...new Set(tasks.map((t) => t.user_id).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        profilesMap = (profilesData ?? []).reduce(
          (acc, p) => ({ ...acc, [p.id]: { full_name: p.full_name, avatar_url: p.avatar_url } }),
          {},
        );
      }

      return tasks.map((t) => ({ ...t, profiles: profilesMap[t.user_id] ?? null }));
    },
  });
}

export function usePlatformCrmLeadTasks(leadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead-tasks', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<PlatformCrmTaskWithAssignee[]> => {
      const { data, error } = await supabase
        .from('platform_crm_tasks')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const tasks = (data ?? []) as PlatformCrmTask[];

      const userIds = [...new Set(tasks.map((t) => t.user_id).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        profilesMap = (profilesData ?? []).reduce(
          (acc, p) => ({ ...acc, [p.id]: { full_name: p.full_name, avatar_url: p.avatar_url } }),
          {},
        );
      }

      return tasks.map((t) => ({ ...t, profiles: profilesMap[t.user_id] ?? null }));
    },
  });
}

export function useCreatePlatformCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: PlatformCrmTaskInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_tasks')
        .insert(task)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTask;
    },
    onSuccess: (_data, _vars) => {
      invalidateAllTaskQueries(queryClient);
    },
  });
}

/** Marca/desmarca uma tarefa como concluída (completed <-> pending). */
export function useTogglePlatformCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      completed,
    }: {
      taskId: string;
      completed: boolean;
      /** Opcional: tarefa avulsa (sem lead) também alterna. */
      leadId?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('platform_crm_tasks')
        .update({
          status: completed ? 'completed' : 'pending',
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTask;
    },
    onSuccess: (_data, _vars) => {
      invalidateAllTaskQueries(queryClient);
    },
  });
}

/** Edição geral de uma tarefa (título, descrição, prioridade, vencimento, responsável, lead...). */
export function useUpdatePlatformCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmTaskUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTask;
    },
    onSuccess: () => {
      invalidateAllTaskQueries(queryClient);
    },
  });
}

/** Exclusão definitiva de uma tarefa (confirmada na UI via AlertDialog). */
export function useDeletePlatformCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_crm_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAllTaskQueries(queryClient);
    },
  });
}
