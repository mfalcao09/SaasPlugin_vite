import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * TIPOS DE EVENTO de booking do CRM de PLATAFORMA (super_admin) — port 1:1 do
 * `useBookingEventTypes` do CRM Vendus, desacoplado do tenant. Toca APENAS
 * `platform_crm_booking_event_types` (Calendly de reunião de venda).
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM organization_id: a tabela de plataforma isola via `user_id` (vendedor
 *    da plataforma) + RLS super_admin-only. Super_admin vê TODOS os tipos (o
 *    original filtrava por `user.id`; aqui a lista é da equipe).
 *  - `user_id` = super_admin logado (auth.users).
 *  - Colunas do original SEM equivalente no schema de plataforma são omitidas do
 *    payload: `booking_experience`, `thank_you_title/message`, `what_happens`,
 *    `next_steps`. A UI que dependia delas (experiência de agendamento) fica
 *    fora nesta onda — o schema `platform_crm_booking_event_types` não as tem.
 */

export interface QuestionField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'phone' | 'email';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

/** Espelha `platform_crm_booking_event_types` Row com `questions` já tipado. */
export interface PlatformCrmBookingEventType {
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
  questions: QuestionField[];
  confirmation_message: string | null;
  create_meet: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePlatformCrmEventTypeInput {
  name: string;
  slug: string;
  description?: string;
  duration_minutes: number;
  location_type: string;
  location_details?: string;
  color?: string;
  is_active?: boolean;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_hours?: number;
  max_days_ahead?: number;
  questions?: QuestionField[];
  confirmation_message?: string;
  create_meet?: boolean;
}

const PLATFORM_CRM_KEY = 'platform-crm';

/** Normaliza `questions` (Json) para array tipado — igual ao original. */
function parseEventType(data: unknown): PlatformCrmBookingEventType {
  const item = data as Record<string, unknown>;
  return {
    ...item,
    questions: Array.isArray(item.questions) ? (item.questions as QuestionField[]) : [],
  } as PlatformCrmBookingEventType;
}

export function usePlatformCrmBookingEventTypes() {
  const queryClient = useQueryClient();

  const { data: eventTypes, isLoading, error } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'booking-event-types'],
    queryFn: async (): Promise<PlatformCrmBookingEventType[]> => {
      const { data, error } = await supabase
        .from('platform_crm_booking_event_types')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(parseEventType);
    },
  });

  const createEventType = useMutation({
    mutationFn: async (input: CreatePlatformCrmEventTypeInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('platform_crm_booking_event_types')
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description,
          duration_minutes: input.duration_minutes,
          location_type: input.location_type,
          location_details: input.location_details,
          color: input.color,
          is_active: input.is_active,
          buffer_before: input.buffer_before,
          buffer_after: input.buffer_after,
          min_notice_hours: input.min_notice_hours,
          max_days_ahead: input.max_days_ahead,
          questions: (input.questions ?? []) as unknown as Json,
          confirmation_message: input.confirmation_message,
          create_meet: input.create_meet,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'booking-event-types'] });
      toast.success('Tipo de evento criado com sucesso!');
    },
    onError: (err: any) => {
      console.error('Error creating platform CRM event type:', err);
      toast.error('Erro ao criar tipo de evento');
    },
  });

  const updateEventType = useMutation({
    mutationFn: async ({
      id,
      questions,
      ...input
    }: Partial<PlatformCrmBookingEventType> & { id: string }) => {
      const updateData: Record<string, unknown> = { ...input };
      if (questions !== undefined) {
        updateData.questions = questions as unknown as Json;
      }
      const { data, error } = await supabase
        .from('platform_crm_booking_event_types')
        .update(updateData as TablesUpdate<'platform_crm_booking_event_types'>)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'booking-event-types'] });
      toast.success('Tipo de evento atualizado!');
    },
    onError: (err: any) => {
      console.error('Error updating platform CRM event type:', err);
      toast.error('Erro ao atualizar tipo de evento');
    },
  });

  const deleteEventType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_booking_event_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'booking-event-types'] });
      toast.success('Tipo de evento excluído!');
    },
    onError: (err: any) => {
      console.error('Error deleting platform CRM event type:', err);
      toast.error('Erro ao excluir tipo de evento');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('platform_crm_booking_event_types')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'booking-event-types'] });
      toast.success(data.is_active ? 'Evento ativado!' : 'Evento desativado!');
    },
    onError: (err: any) => {
      console.error('Error toggling platform CRM event type:', err);
      toast.error('Erro ao alterar status do evento');
    },
  });

  return {
    eventTypes: eventTypes ?? [],
    isLoading,
    error,
    createEventType,
    updateEventType,
    deleteEventType,
    toggleActive,
  };
}

/** Gera slug a partir do nome — idêntico ao `generateSlug` do original. */
export function generatePlatformCrmEventSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
