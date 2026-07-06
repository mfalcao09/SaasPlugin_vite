import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — tarefas vinculadas a um lead, pipeline ÚNICO
 * desacoplado do tenant. Toca APENAS `platform_crm_tasks`. Sem organization_id /
 * product_id — a RLS super_admin-only isola os dados.
 *
 * O responsável (user_id) é resolvido contra `profiles` num passo separado.
 */

export type PlatformCrmTask = Tables<'platform_crm_tasks'>;
export type PlatformCrmTaskInsert = TablesInsert<'platform_crm_tasks'>;

/** Tarefa com o perfil do responsável embutido (resolvido client-side). */
export type PlatformCrmTaskWithAssignee = PlatformCrmTask & {
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'lead-tasks', vars.lead_id],
      });
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
      leadId: string;
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'lead-tasks', vars.leadId],
      });
    },
  });
}
