import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Eventos de calendário do CRM de PLATAFORMA (super_admin) — a "Agenda" do
 * pipeline ÚNICO, desacoplada do tenant. Toca APENAS
 * `platform_crm_calendar_events` (join do lead via `platform_crm_leads`).
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM organization_id / product_id / deal_id (essas colunas não existem na
 *    tabela de plataforma; a RLS super_admin-only isola os dados).
 *  - `user_id` / `created_by` vêm de `auth.users` (super_admin logado).
 *  - lead → `platform_crm_leads` (não `leads`).
 *  - Google Calendar / sync = TODO(edge): a tabela tem colunas de sync, mas o
 *    push server-side depende de Edge Function não portada aqui.
 */

export type PlatformCrmCalendarEventRow = Tables<'platform_crm_calendar_events'>;
export type PlatformCrmCalendarEventInsert = TablesInsert<'platform_crm_calendar_events'>;
export type PlatformCrmCalendarEventUpdate = TablesUpdate<'platform_crm_calendar_events'>;

/** Evento com o lead embutido via join FK lead_id → platform_crm_leads. */
export type PlatformCrmCalendarEvent = PlatformCrmCalendarEventRow & {
  lead?: { id: string; name: string } | null;
};

export interface PlatformCrmCreateEventData {
  title: string;
  description?: string | null;
  location?: string | null;
  event_type?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  lead_id?: string | null;
  attendees?: any[];
  reminder_minutes?: number[];
  color?: string | null;
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  recurrence_end_date?: string | null;
  create_meet?: boolean;
  metadata?: Record<string, any>;
}

export interface PlatformCrmCalendarFilters {
  userId?: string;
  eventType?: string;
  startDate: Date;
  endDate: Date;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmCalendarEvents(filters: PlatformCrmCalendarFilters) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'calendar-events', filters],
    queryFn: async (): Promise<PlatformCrmCalendarEvent[]> => {
      let query = supabase
        .from('platform_crm_calendar_events')
        .select(`
          *,
          lead:platform_crm_leads(id, name)
        `)
        .gte('start_time', filters.startDate.toISOString())
        .lte('start_time', filters.endDate.toISOString())
        .order('start_time', { ascending: true });

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformCrmCalendarEvent[];
    },
  });
}

export function useCreatePlatformCrmCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: PlatformCrmCreateEventData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: event, error } = await supabase
        .from('platform_crm_calendar_events')
        .insert({
          ...data,
          user_id: user.id,
          created_by: user.id,
        } as PlatformCrmCalendarEventInsert)
        .select()
        .single();

      if (error) throw error;

      // TODO(edge): push para Google Calendar quando conectado depende de Edge
      // Function (`google-calendar-sync`) não portada no core.

      return event as PlatformCrmCalendarEventRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'calendar-events'] });
      toast({ title: 'Evento criado', description: 'O evento foi adicionado à agenda.' });
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM calendar event:', error);
      toast({ title: 'Erro ao criar evento', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdatePlatformCrmCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PlatformCrmCreateEventData> & { id: string }) => {
      const { data: event, error } = await supabase
        .from('platform_crm_calendar_events')
        .update(data as PlatformCrmCalendarEventUpdate)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // TODO(edge): sync para Google Calendar (Edge Function não portada no core).

      return event as PlatformCrmCalendarEventRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'calendar-events'] });
      toast({ title: 'Evento atualizado', description: 'As alterações foram salvas.' });
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM calendar event:', error);
      toast({ title: 'Erro ao atualizar evento', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeletePlatformCrmCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'calendar-events'] });
      toast({ title: 'Evento excluído', description: 'O evento foi removido da agenda.' });
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM calendar event:', error);
      toast({ title: 'Erro ao excluir evento', description: error.message, variant: 'destructive' });
    },
  });
}
