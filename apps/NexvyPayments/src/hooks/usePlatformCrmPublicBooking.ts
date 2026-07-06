// usePlatformCrmPublicBooking — hooks do fluxo PÚBLICO de booking (Calendly de
// reunião de venda) do módulo super-admin `platform_crm_*`.
//
// Porte 1:1 de usePublicBooking.ts + useBookingConfirmation.ts (Vendus/CRM),
// com uma diferença de fronteira: o cliente anônimo NÃO lê tabelas direto
// (RLS por-tenant / desacoplamento). Toda leitura/escrita passa pelas edges
// públicas service-role `platform-booking-availability | -submit | -token`.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---- Tipos (locais — sem importar useBookingEventTypes, que puxa useAuth) ----

export interface PlatformQuestionField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'phone' | 'email';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface PlatformBookingEventType {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  location_details: string | null;
  color: string;
  is_active: boolean;
  buffer_before: number;
  buffer_after: number;
  min_notice_hours: number;
  max_days_ahead: number;
  questions: PlatformQuestionField[];
  confirmation_message: string | null;
  create_meet: boolean;
  // Campos de thank-you/experiência não existem em platform_crm → sempre ausentes/standard.
  thank_you_title?: string | null;
  thank_you_message?: string | null;
  what_happens?: unknown | null;
  next_steps?: unknown | null;
  booking_experience: 'standard' | 'conversational';
}

export interface PlatformPublicProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  booking_slug: string;
  booking_bio: string | null;
}

export interface PlatformAvailableSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface PlatformBookingSubmitInput {
  eventTypeId: string;
  startTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  additionalInfo?: Record<string, unknown>;
  timezone: string;
  tracking?: Record<string, unknown>;
}

const AVAIL_FN = 'platform-booking-availability';
const SUBMIT_FN = 'platform-booking-submit';
const TOKEN_FN = 'platform-booking-token';

// Buscar perfil público + tipos de evento ativos (modo B da edge).
export function usePlatformPublicProfile(slug: string | undefined) {
  return useQuery({
    queryKey: ['platform-public-profile', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase.functions.invoke(AVAIL_FN, {
        body: { userSlug: slug },
      });
      if (error) throw error;
      return (data?.profile ?? null) as PlatformPublicProfile | null;
    },
    enabled: !!slug,
  });
}

// Buscar tipos de evento ativos de um slug (modo B da edge).
export function usePlatformPublicEventTypes(slug: string | undefined) {
  return useQuery({
    queryKey: ['platform-public-event-types', slug],
    queryFn: async () => {
      if (!slug) return [];
      const { data, error } = await supabase.functions.invoke(AVAIL_FN, {
        body: { userSlug: slug },
      });
      if (error) throw error;
      return (data?.eventTypes ?? []) as PlatformBookingEventType[];
    },
    enabled: !!slug,
  });
}

// Buscar 1 tipo de evento por slug (modo C da edge) → { profile, eventType }.
export function usePlatformPublicEventTypeBySlug(
  userSlug: string | undefined,
  eventSlug: string | undefined,
) {
  return useQuery({
    queryKey: ['platform-public-event-type', userSlug, eventSlug],
    queryFn: async () => {
      if (!userSlug || !eventSlug) return null;
      const { data, error } = await supabase.functions.invoke(AVAIL_FN, {
        body: { userSlug, eventSlug },
      });
      if (error) throw error;
      if (!data?.eventType) return null;
      return {
        profile: (data.profile ?? null) as PlatformPublicProfile | null,
        eventType: data.eventType as PlatformBookingEventType,
      };
    },
    enabled: !!userSlug && !!eventSlug,
  });
}

// Buscar slots disponíveis para uma data (modo A da edge).
export function usePlatformAvailableSlots(
  eventTypeId: string | undefined,
  date: string | undefined,
  timezone: string = 'America/Sao_Paulo',
) {
  return useQuery({
    queryKey: ['platform-available-slots', eventTypeId, date, timezone],
    queryFn: async () => {
      if (!eventTypeId || !date) return [];
      const { data, error } = await supabase.functions.invoke(AVAIL_FN, {
        body: { eventTypeId, date, timezone },
      });
      if (error) throw error;
      return (data?.slots || []) as PlatformAvailableSlot[];
    },
    enabled: !!eventTypeId && !!date,
    staleTime: 1000 * 60,
  });
}

// Submeter agendamento (edge platform-booking-submit).
export function usePlatformSubmitBooking() {
  return useMutation({
    mutationFn: async (input: PlatformBookingSubmitInput) => {
      const { data, error } = await supabase.functions.invoke(SUBMIT_FN, {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        success: boolean;
        bookingId: string;
        calendarEventId: string;
        meetLink?: string;
        confirmationToken: string;
      };
    },
    onSuccess: () => {
      toast.success('Agendamento confirmado!');
    },
    onError: (error: Error) => {
      console.error('Error submitting booking:', error);
      toast.error(error.message || 'Erro ao agendar');
    },
  });
}

// ---- Confirmação / reagendamento por token (edge platform-booking-token) ----

export interface PlatformBookingDetails {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  confirmation_token: string;
  additional_info: Record<string, unknown>;
  created_at: string;
  event_type: {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    color: string;
    location_type: string;
    thank_you_title: string | null;
    thank_you_message: string | null;
    what_happens: unknown | null;
    next_steps: unknown | null;
  } | null;
  host_profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  calendar_event: {
    id: string;
    meet_link: string | null;
  } | null;
}

export function usePlatformBookingByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['platform-booking-by-token', token],
    queryFn: async (): Promise<PlatformBookingDetails | null> => {
      if (!token) return null;
      const { data, error } = await supabase.functions.invoke(TOKEN_FN, {
        body: { action: 'get', token },
      });
      if (error) throw error;
      return (data?.booking ?? null) as PlatformBookingDetails | null;
    },
    enabled: !!token,
  });
}

export function usePlatformRescheduleBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      token,
      newStartTime,
      timezone,
    }: {
      token: string;
      newStartTime: string;
      timezone: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(TOKEN_FN, {
        body: { action: 'reschedule', token, newStartTime, timezone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-booking-by-token', variables.token] });
      toast.success('Agendamento reagendado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error rescheduling:', error);
      toast.error('Erro ao reagendar');
    },
  });
}

export function usePlatformCancelBookingByToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ token, reason }: { token: string; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke(TOKEN_FN, {
        body: { action: 'cancel', token, reason: reason ?? null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-booking-by-token', variables.token] });
      toast.success('Agendamento cancelado');
    },
    onError: (error: Error) => {
      console.error('Error cancelling:', error);
      toast.error('Erro ao cancelar');
    },
  });
}
