import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * NOTIFICAÇÕES do CRM de PLATAFORMA (super_admin) — Central de Notificações
 * TOTALMENTE DESACOPLADA do tenant. Toca APENAS:
 *   - platform_crm_admin_notifications  (registro de envio manual do admin)
 *   - platform_crm_notifications        (notificação individual por usuário/app)
 *   - platform_crm_auto_notification_settings (config única de alertas automáticos)
 *
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 * Diferenças vs. original (CRM Vendus):
 *   - Sem escopo "product" (não há produtos/atribuições no CRM de plataforma).
 *   - `created_by` resolvido via supabase.auth.getUser() (desacoplado de useAuth/org).
 *   - `created_by_profile` resolvido por join manual (não há FK declarada).
 *   - Config de alertas é linha ÚNICA (não há organization_id): maybeSingle + upsert por id.
 *   - Envio de e-mail = TODO(edge): a Edge Function `send-notification-email` da plataforma
 *     ainda não existe; a UI mostra o canal e faz stub (não quebra o envio de app).
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export type PlatformCrmNotificationType = Tables<'platform_crm_admin_notifications'>['type'];

export type PlatformCrmAdminNotification = Tables<'platform_crm_admin_notifications'> & {
  created_by_profile?: { full_name: string | null } | null;
};

export type PlatformCrmAutoNotificationSettings =
  Tables<'platform_crm_auto_notification_settings'>;
export type PlatformCrmAutoNotificationSettingsInsert =
  TablesInsert<'platform_crm_auto_notification_settings'>;
export type PlatformCrmAutoNotificationSettingsUpdate =
  TablesUpdate<'platform_crm_auto_notification_settings'>;

export interface PlatformCrmCreateNotificationData {
  type: NonNullable<PlatformCrmNotificationType>;
  title: string;
  message: string;
  action_url?: string;
  scope: 'all' | 'squad' | 'custom';
  scope_filters: {
    squadIds?: string[];
    userIds?: string[];
  };
  send_app: boolean;
  send_email: boolean;
}

/** Resolve o UUID do usuário logado (super_admin) — desacoplado de `useAuth`/org. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Histórico de envios manuais ────────────────────────────────────────────
export function usePlatformCrmNotificationHistory() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'admin-notifications'],
    queryFn: async (): Promise<PlatformCrmAdminNotification[]> => {
      const { data, error } = await supabase
        .from('platform_crm_admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []) as Tables<'platform_crm_admin_notifications'>[];

      // Join manual com `profiles` (não há FK declarada de created_by → profiles).
      const creatorIds = [
        ...new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]),
      ];
      const nameMap = new Map<string, string | null>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        (profiles ?? []).forEach((p) => nameMap.set(p.id, p.full_name));
      }

      return rows.map((r) => ({
        ...r,
        created_by_profile: r.created_by
          ? { full_name: nameMap.get(r.created_by) ?? null }
          : null,
      }));
    },
  });
}

/**
 * Resolve destinatários pelo escopo. Universo = reps de venda DA PLATAFORMA:
 * user_ids em `platform_crm_squad_members` + os já atribuídos a leads
 * (assigned_to / sdr_id / closer_id), enriquecidos por `profiles`.
 * Sem escopo "product" e sem organization_id (desacoplado).
 */
async function resolveRecipients(
  scope: string,
  scopeFilters: PlatformCrmCreateNotificationData['scope_filters'],
): Promise<Array<{ id: string; email: string | null; full_name: string }>> {
  // Escopo custom: os próprios user_ids escolhidos.
  if (scope === 'custom') {
    const userIds = scopeFilters.userIds ?? [];
    if (userIds.length === 0) return [];
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);
    if (error) throw error;
    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? null,
      full_name: p.full_name || p.email || 'Sem nome',
    }));
  }

  // Escopo squad: membros dos squads selecionados.
  let candidateIds: Set<string> | null = null;
  if (scope === 'squad') {
    const squadIds = scopeFilters.squadIds ?? [];
    if (squadIds.length === 0) return [];
    const { data: members } = await supabase
      .from('platform_crm_squad_members')
      .select('user_id')
      .in('squad_id', squadIds);
    candidateIds = new Set((members ?? []).map((m) => m.user_id).filter(Boolean) as string[]);
    if (candidateIds.size === 0) return [];
  }

  // Escopo all (ou squad já filtrado): universo de reps da plataforma.
  const { data: squadMembers } = await supabase
    .from('platform_crm_squad_members')
    .select('user_id');
  const { data: assigned } = await supabase
    .from('platform_crm_leads')
    .select('assigned_to, sdr_id, closer_id');

  const ids = new Set<string>();
  (squadMembers ?? []).forEach((m) => m.user_id && ids.add(m.user_id));
  (assigned ?? []).forEach((l) => {
    if (l.assigned_to) ids.add(l.assigned_to);
    if (l.sdr_id) ids.add(l.sdr_id);
    if (l.closer_id) ids.add(l.closer_id);
  });

  let universe = [...ids];
  if (candidateIds) universe = universe.filter((id) => candidateIds!.has(id));
  if (universe.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', universe);
  if (error) throw error;

  return (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? null,
    full_name: p.full_name || p.email || 'Sem nome',
  }));
}

// ── Criar e enviar notificação manual ──────────────────────────────────────
export function useCreatePlatformCrmNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PlatformCrmCreateNotificationData) => {
      const userId = await currentUserId();

      // 1. Resolve destinatários pelo escopo.
      const recipients = await resolveRecipients(data.scope, data.scope_filters);
      if (recipients.length === 0) {
        throw new Error('Nenhum destinatário encontrado para o escopo selecionado');
      }

      // 2. Registro do envio manual (admin_notifications).
      const { data: adminNotification, error: adminError } = await supabase
        .from('platform_crm_admin_notifications')
        .insert({
          created_by: userId,
          type: data.type,
          title: data.title,
          message: data.message,
          action_url: data.action_url || null,
          scope: data.scope,
          scope_filters: data.scope_filters,
          send_app: data.send_app,
          send_email: data.send_email,
          recipients_count: recipients.length,
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (adminError) throw adminError;

      // 3. Notificações individuais (app) se send_app.
      if (data.send_app) {
        const notifications = recipients.map((recipient) => ({
          user_id: recipient.id,
          type: data.type,
          title: data.title,
          message: data.message,
          action_url: data.action_url || null,
          admin_notification_id: adminNotification.id,
          is_read: false,
        }));

        const { error: notifError } = await supabase
          .from('platform_crm_notifications')
          .insert(notifications);

        if (notifError) {
          console.error('Error creating platform CRM notifications:', notifError);
        }
      }

      // 4. Envio de e-mail.
      // TODO(edge): implementar Edge Function `send-notification-email` da plataforma.
      // Por ora, o canal aparece na UI mas o disparo real é um stub (não quebra o app).
      let emailQueued = false;
      if (data.send_email) {
        emailQueued = true;
      }

      return { adminNotification, recipientsCount: recipients.length, emailQueued };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'admin-notifications'],
      });
      toast.success(`Notificação enviada para ${result.recipientsCount} destinatário(s)`);
      if (result.emailQueued) {
        toast.info('Envio por e-mail em breve (integração pendente).');
      }
    },
    onError: (error: Error) => {
      console.error('Error creating platform CRM notification:', error);
      toast.error(error.message || 'Erro ao enviar notificação');
    },
  });
}

// ── Prévia de contagem de destinatários ────────────────────────────────────
export function usePlatformCrmRecipientCount(
  scope: string,
  scopeFilters: PlatformCrmCreateNotificationData['scope_filters'],
) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'recipient-count', scope, scopeFilters],
    queryFn: async () => {
      const recipients = await resolveRecipients(scope, scopeFilters);
      return recipients.length;
    },
    staleTime: 10000,
  });
}

// ── Configurações de notificações automáticas (linha única) ────────────────
export function usePlatformCrmAutoNotificationSettings() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'auto-notification-settings'],
    queryFn: async (): Promise<PlatformCrmAutoNotificationSettings | null> => {
      const { data, error } = await supabase
        .from('platform_crm_auto_notification_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as PlatformCrmAutoNotificationSettings | null;
    },
  });
}

/**
 * Salva as configurações de alertas automáticos. Linha ÚNICA: se já existe (id),
 * faz UPDATE por id; senão INSERT. Sem organization_id (desacoplado da plataforma).
 */
export function useSavePlatformCrmAutoNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<PlatformCrmAutoNotificationSettings>) => {
      const { data: existing } = await supabase
        .from('platform_crm_auto_notification_settings')
        .select('id')
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('platform_crm_auto_notification_settings')
          .update(settings as PlatformCrmAutoNotificationSettingsUpdate)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('platform_crm_auto_notification_settings')
        .insert(settings as PlatformCrmAutoNotificationSettingsInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'auto-notification-settings'],
      });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Error saving platform CRM auto notification settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });
}
