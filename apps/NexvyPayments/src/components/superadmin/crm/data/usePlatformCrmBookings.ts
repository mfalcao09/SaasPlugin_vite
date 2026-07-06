import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * REUNIÕES (bookings) do CRM de PLATAFORMA (super_admin) — port 1:1 do
 * `useBookings` do CRM Vendus, desacoplado do tenant. Toca APENAS
 * `platform_crm_booking_requests` (booking estilo Calendly de REUNIÃO de venda).
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM organization_id: a tabela de plataforma usa `host_user_id` (vendedor da
 *    plataforma) e a RLS super_admin-only isola os dados.
 *  - Super_admin enxerga TODAS as reuniões (sem gate por host_user_id): o
 *    original filtrava por `user.id`; aqui a central mostra a agenda da equipe.
 *  - `event_type` embutido via join FK event_type_id → platform_crm_booking_event_types.
 *  - Ao cancelar, o evento de calendário associado (se houver) vira `cancelled`
 *    em `platform_crm_calendar_events` (não `calendar_events`).
 */

export type PlatformCrmBookingRow = Tables<'platform_crm_booking_requests'>;

/** Booking com o tipo de evento embutido (join) — espelha o original. */
export type PlatformCrmBooking = PlatformCrmBookingRow & {
  event_type?: {
    id: string;
    name: string;
    color: string | null;
    duration_minutes: number;
    location_type: string;
  } | null;
};

export interface PlatformCrmBookingsFilter {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  upcoming?: boolean;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmBookings(filter?: PlatformCrmBookingsFilter) {
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'bookings', filter],
    queryFn: async (): Promise<PlatformCrmBooking[]> => {
      let query = supabase
        .from('platform_crm_booking_requests')
        .select(`
          *,
          event_type:platform_crm_booking_event_types!event_type_id(
            id, name, color, duration_minutes, location_type
          )
        `)
        .order('start_time', { ascending: filter?.upcoming !== false });

      if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      if (filter?.upcoming) {
        query = query.gte('start_time', new Date().toISOString());
      }
      if (filter?.dateFrom) {
        query = query.gte('start_time', filter.dateFrom);
      }
      if (filter?.dateTo) {
        query = query.lte('start_time', filter.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformCrmBooking[];
    },
  });

  const cancelBooking = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_booking_requests')
        .update({ status: 'cancelled', cancellation_reason: reason ?? null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Também cancelar o evento de calendário associado (se houver).
      if (data.calendar_event_id) {
        await supabase
          .from('platform_crm_calendar_events')
          .update({ status: 'cancelled' })
          .eq('id', data.calendar_event_id);
      }

      // TODO(edge): disparar aviso de cancelamento (email/WhatsApp) depende do
      // dispatcher server-side (Edge Function) não portado no core.
      return data as PlatformCrmBookingRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'calendar-events'] });
      toast.success('Agendamento cancelado!');
    },
    onError: (err: any) => {
      console.error('Error cancelling platform CRM booking:', err);
      toast.error('Erro ao cancelar agendamento');
    },
  });

  const markCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('platform_crm_booking_requests')
        .update({ status: 'completed' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformCrmBookingRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'bookings'] });
      toast.success('Agendamento concluído!');
    },
    onError: (err: any) => {
      console.error('Error marking platform CRM booking completed:', err);
      toast.error('Erro ao concluir agendamento');
    },
  });

  // Agrupar por data — idêntico ao original.
  const bookingsByDate = (bookings ?? []).reduce((acc, booking) => {
    const date = booking.start_time.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(booking);
    return acc;
  }, {} as Record<string, PlatformCrmBooking[]>);

  return {
    bookings: bookings ?? [],
    bookingsByDate,
    isLoading,
    error,
    cancelBooking,
    markCompleted,
  };
}
