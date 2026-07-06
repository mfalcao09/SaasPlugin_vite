import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * NOTIFICAÇÕES & AUTOMAÇÃO de booking do CRM de PLATAFORMA (super_admin) — port
 * do `useBookingNotifications` do CRM Vendus, desacoplado do tenant. Toca APENAS
 * `platform_crm_booking_notification_settings` (1:1 por event_type) e
 * `platform_crm_booking_reminders` (N por event_type). Ambas via
 * `event_type_id` → `platform_crm_booking_event_types`.
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM `organization_id`: RLS super_admin-only isola. Nada de tenant.
 *  - SEM `whatsapp_instance_id` na tabela de settings (coluna inexistente no
 *    schema de plataforma). A seleção de instância de disparo é estado local da
 *    UI (não persiste) até o dispatcher existir. TODO(edge).
 *  - O ENVIO real (confirmação/lembrete/recuperação por e-mail/WhatsApp) depende
 *    de Edge Function ainda não portada — este hook só faz o CRUD de config.
 *    TODO(edge): `platform-booking-dispatcher`.
 */

export type ReminderChannel = 'whatsapp' | 'email' | 'both';
export type OffsetUnit = 'minutes' | 'hours' | 'days';
export type InternalChannel = 'whatsapp' | 'email' | 'both';

/** Row persistida de settings (espelha `platform_crm_booking_notification_settings`). */
export type PlatformCrmBookingNotificationSettings =
  Tables<'platform_crm_booking_notification_settings'>;

/** Row persistida de lembrete (espelha `platform_crm_booking_reminders`). */
export type PlatformCrmBookingReminder = Tables<'platform_crm_booking_reminders'>;

/**
 * Draft da UI de settings: campos persistidos + `whatsapp_instance_id` (NÃO
 * persistido — a coluna não existe no schema de plataforma; estado só de UI).
 */
export type PlatformCrmBookingNotificationDraft = Partial<
  PlatformCrmBookingNotificationSettings
> & {
  whatsapp_instance_id?: string | null;
};

export const DEFAULT_CONFIRMATION_WHATSAPP = `Olá, {{nome_lead}}! 👋

Passando para confirmar a *{{nome_evento}}* da *{{empresa}}*.

📅 {{data}}
⏰ {{hora}}
📍 {{modalidade}}

Posso confirmar essa agenda? Responda:
1️⃣ Confirmar
2️⃣ Reagendar
3️⃣ Cancelar`;

export const DEFAULT_RECOVERY = `Olá, {{nome_lead}}!
Ainda não recebemos sua confirmação para a reunião com {{nome_vendedor}}.

Você conseguirá participar?

1️⃣ Sim
2️⃣ Reagendar
3️⃣ Cancelar`;

export const DEFAULT_INTERNAL = `✅ {{nome_lead}} confirmou a reunião.

🗓 {{data}} às {{hora}}
📞 {{telefone_lead}}
🔗 {{link_reuniao}}`;

/** Defaults de settings para um novo event_type (sem organization_id). */
export function buildDefaultSettings(
  eventTypeId: string,
): PlatformCrmBookingNotificationDraft {
  return {
    event_type_id: eventTypeId,
    send_email: true,
    send_whatsapp: false,
    whatsapp_instance_id: null,
    confirmation_message_whatsapp: DEFAULT_CONFIRMATION_WHATSAPP,
    confirmation_subject_email: 'Sua reunião foi confirmada',
    confirmation_html_email: null,
    notify_seller_on_new: true,
    notify_seller_on_confirm: true,
    notify_seller_on_reschedule: true,
    notify_seller_on_cancel: true,
    internal_channel: 'both',
    internal_message_template: DEFAULT_INTERNAL,
    recovery_enabled: false,
    recovery_offset_value: 3,
    recovery_offset_unit: 'hours',
    recovery_message: DEFAULT_RECOVERY,
  };
}

export function usePlatformCrmBookingNotifications(
  eventTypeId: string | null | undefined,
) {
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['platform-crm', 'booking-notification-settings', eventTypeId],
    queryFn: async (): Promise<PlatformCrmBookingNotificationSettings | null> => {
      if (!eventTypeId) return null;
      const { data, error } = await supabase
        .from('platform_crm_booking_notification_settings')
        .select('*')
        .eq('event_type_id', eventTypeId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!eventTypeId,
  });

  const reminders = useQuery({
    queryKey: ['platform-crm', 'booking-reminders', eventTypeId],
    queryFn: async (): Promise<PlatformCrmBookingReminder[]> => {
      if (!eventTypeId) return [];
      const { data, error } = await supabase
        .from('platform_crm_booking_reminders')
        .select('*')
        .eq('event_type_id', eventTypeId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventTypeId,
  });

  const upsertSettings = useMutation({
    mutationFn: async (input: PlatformCrmBookingNotificationDraft) => {
      if (!eventTypeId) throw new Error('Missing event');
      // Descarta `whatsapp_instance_id` (não persistido — coluna inexistente).
      const { whatsapp_instance_id: _ignored, ...persisted } = {
        ...buildDefaultSettings(eventTypeId),
        ...input,
      };
      const payload = { ...persisted, event_type_id: eventTypeId };
      const { data, error } = await supabase
        .from('platform_crm_booking_notification_settings')
        .upsert(payload, { onConflict: 'event_type_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-crm', 'booking-notification-settings', eventTypeId],
      });
      toast.success('Notificações salvas');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar'),
  });

  const createReminder = useMutation({
    mutationFn: async (input: Partial<PlatformCrmBookingReminder>) => {
      if (!eventTypeId) throw new Error('Missing');
      const payload = {
        event_type_id: eventTypeId,
        offset_value: input.offset_value ?? 1,
        offset_unit: (input.offset_unit ?? 'hours') as OffsetUnit,
        channel: (input.channel ?? 'whatsapp') as ReminderChannel,
        message_template:
          input.message_template ??
          `Olá, {{nome_lead}}! Lembrete: sua reunião com {{nome_vendedor}} é em breve.\n\n🗓 {{data}}\n⏰ {{hora}}\n{{link_reuniao}}`,
        email_subject: input.email_subject ?? 'Lembrete da sua reunião',
        is_active: input.is_active ?? true,
        order_index: input.order_index ?? (reminders.data?.length ?? 0),
      };
      const { data, error } = await supabase
        .from('platform_crm_booking_reminders')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['platform-crm', 'booking-reminders', eventTypeId],
      }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateReminder = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<PlatformCrmBookingReminder> & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_booking_reminders')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['platform-crm', 'booking-reminders', eventTypeId],
      }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_booking_reminders')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['platform-crm', 'booking-reminders', eventTypeId],
      }),
    onError: (e: any) => toast.error(e.message),
  });

  return {
    settings: settings.data,
    isLoading: settings.isLoading || reminders.isLoading,
    reminders: reminders.data || [],
    upsertSettings,
    createReminder,
    updateReminder,
    deleteReminder,
  };
}

export const TEMPLATE_VARIABLES = [
  { key: '{{nome_lead}}', label: 'Nome do lead' },
  { key: '{{nome_vendedor}}', label: 'Vendedor' },
  { key: '{{email_lead}}', label: 'Email' },
  { key: '{{telefone_lead}}', label: 'Telefone' },
  { key: '{{data}}', label: 'Data' },
  { key: '{{hora}}', label: 'Hora' },
  { key: '{{modalidade}}', label: 'Modalidade' },
  { key: '{{nome_evento}}', label: 'Evento' },
  { key: '{{link_reuniao}}', label: 'Link reunião' },
  { key: '{{empresa}}', label: 'Empresa' },
] as const;

export function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
