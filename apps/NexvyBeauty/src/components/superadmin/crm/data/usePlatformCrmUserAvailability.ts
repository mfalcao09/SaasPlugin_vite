import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * DISPONIBILIDADE (janelas de horário) do CRM de PLATAFORMA (super_admin) —
 * port 1:1 do `useUserAvailability` do CRM Vendus, desacoplado do tenant. Toca
 * `platform_crm_user_availability` (grade semanal) + `platform_crm_availability_overrides`
 * (exceções por data).
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM organization_id: as tabelas de plataforma isolam via `user_id` +
 *    RLS super_admin-only.
 *  - `userId` opcional (default = super_admin logado). Escritas sempre gravam no
 *    usuário logado (`auth.users`), igual ao original.
 */

export interface PlatformCrmUserAvailability {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean | null;
  created_at: string;
}

export interface PlatformCrmAvailabilityOverride {
  id: string;
  user_id: string;
  date: string;
  is_available: boolean | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
}

export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DAY_ABBREVIATIONS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmUserAvailability(userId?: string) {
  const queryClient = useQueryClient();

  const { data: availability, isLoading: loadingAvailability } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'user-availability', userId ?? 'me'],
    queryFn: async (): Promise<PlatformCrmUserAvailability[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('platform_crm_user_availability')
        .select('*')
        .eq('user_id', targetUserId)
        .order('day_of_week')
        .order('start_time');
      if (error) throw error;
      return (data ?? []) as PlatformCrmUserAvailability[];
    },
  });

  const { data: overrides, isLoading: loadingOverrides } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'availability-overrides', userId ?? 'me'],
    queryFn: async (): Promise<PlatformCrmAvailabilityOverride[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('platform_crm_availability_overrides')
        .select('*')
        .eq('user_id', targetUserId)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date');
      if (error) throw error;
      return (data ?? []) as PlatformCrmAvailabilityOverride[];
    },
  });

  const addTimeSlot = useMutation({
    mutationFn: async ({
      day_of_week,
      start_time,
      end_time,
    }: {
      day_of_week: number;
      start_time: string;
      end_time: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('platform_crm_user_availability')
        .insert({
          user_id: user.id,
          day_of_week,
          start_time,
          end_time,
          is_available: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PlatformCrmUserAvailability;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'user-availability'] });
      toast.success('Horário adicionado!');
    },
    onError: (err: any) => {
      console.error('Error adding platform CRM time slot:', err);
      toast.error('Erro ao adicionar horário');
    },
  });

  const removeTimeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_user_availability')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'user-availability'] });
      toast.success('Horário removido!');
    },
    onError: (err: any) => {
      console.error('Error removing platform CRM time slot:', err);
      toast.error('Erro ao remover horário');
    },
  });

  const updateTimeSlot = useMutation({
    mutationFn: async ({
      id,
      start_time,
      end_time,
    }: {
      id: string;
      start_time: string;
      end_time: string;
    }) => {
      const { data, error } = await supabase
        .from('platform_crm_user_availability')
        .update({ start_time, end_time })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformCrmUserAvailability;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'user-availability'] });
      toast.success('Horário atualizado!');
    },
    onError: (err: any) => {
      console.error('Error updating platform CRM time slot:', err);
      toast.error('Erro ao atualizar horário');
    },
  });

  const addOverride = useMutation({
    mutationFn: async (
      override: Omit<
        PlatformCrmAvailabilityOverride,
        'id' | 'user_id' | 'created_at'
      >,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('platform_crm_availability_overrides')
        .upsert(
          { user_id: user.id, ...override },
          { onConflict: 'user_id,date' },
        )
        .select()
        .single();
      if (error) throw error;
      return data as PlatformCrmAvailabilityOverride;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'availability-overrides'] });
      toast.success('Exceção salva!');
    },
    onError: (err: any) => {
      console.error('Error adding platform CRM override:', err);
      toast.error('Erro ao salvar exceção');
    },
  });

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_availability_overrides')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'availability-overrides'] });
      toast.success('Exceção removida!');
    },
    onError: (err: any) => {
      console.error('Error removing platform CRM override:', err);
      toast.error('Erro ao remover exceção');
    },
  });

  // Agrupar slots por dia da semana — idêntico ao original.
  const availabilityByDay = (availability ?? []).reduce((acc, slot) => {
    if (!acc[slot.day_of_week]) acc[slot.day_of_week] = [];
    acc[slot.day_of_week].push(slot);
    return acc;
  }, {} as Record<number, PlatformCrmUserAvailability[]>);

  return {
    availability: availability ?? [],
    availabilityByDay,
    overrides: overrides ?? [],
    isLoading: loadingAvailability || loadingOverrides,
    addTimeSlot,
    removeTimeSlot,
    updateTimeSlot,
    addOverride,
    removeOverride,
  };
}
