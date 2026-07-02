import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, Loader2, Save, Pencil } from 'lucide-react';
import {
  usePlatformCrmBookingNotifications,
  buildDefaultSettings,
  DEFAULT_CONFIRMATION_WHATSAPP,
  DEFAULT_RECOVERY,
  DEFAULT_INTERNAL,
  type PlatformCrmBookingNotificationDraft,
  type PlatformCrmBookingNotificationSettings,
  type InternalChannel,
  type OffsetUnit,
} from '@/components/superadmin/crm/data/usePlatformCrmBookingNotifications';
import { PlatformCrmMessageTemplateEditor } from './PlatformCrmMessageTemplateEditor';
import { PlatformCrmMessagePreview } from './PlatformCrmMessagePreview';
import { PlatformCrmRemindersList } from './PlatformCrmRemindersList';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

/**
 * Aba NOTIFICAÇÕES & AUTOMAÇÃO do editor de Tipo de Evento no CRM de PLATAFORMA
 * (super_admin) — port do `NotificationsAutomationTab` do CRM Vendus,
 * desacoplado do tenant. CRUD via `usePlatformCrmBookingNotifications`
 * (`platform_crm_booking_notification_settings` + `platform_crm_booking_reminders`).
 *
 * Desacoplamento vs. o CRM de tenant original:
 *  - SEM `useAuth`/`organization_id`: defaults só a partir de `eventTypeId`; RLS
 *    super_admin isola.
 *  - Seletor de "Instância WhatsApp" (nº de disparo) OMITIDO: (a) a coluna
 *    `whatsapp_instance_id` não existe em `platform_crm_booking_notification_settings`
 *    e (b) a fonte de instâncias (`useEvolutionInstances`) é tenant-bound
 *    (`organization_id`) — importá-la violaria a fronteira. TODO(edge): plugar
 *    seleção de nº de disparo quando o dispatcher de plataforma existir.
 *  - O ENVIO real (confirmação/lembrete/recuperação por e-mail/WhatsApp) depende
 *    de Edge Function não portada. O botão "Salvar notificações" persiste a
 *    config; o disparo é TODO(edge): `platform-booking-dispatcher`.
 */

interface Props {
  eventTypeId: string;
}

export function PlatformCrmNotificationsAutomationTab({ eventTypeId }: Props) {
  const { settings, isLoading, upsertSettings } = usePlatformCrmBookingNotifications(eventTypeId);
  const [draft, setDraft] = useState<PlatformCrmBookingNotificationDraft>({});
  const [recoveryEditOpen, setRecoveryEditOpen] = useState(false);

  useEffect(() => {
    if (settings) {
      setDraft(settings);
    } else if (eventTypeId) {
      setDraft(buildDefaultSettings(eventTypeId));
    }
  }, [settings, eventTypeId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const update = <K extends keyof PlatformCrmBookingNotificationSettings>(
    key: K,
    value: PlatformCrmBookingNotificationSettings[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Main content */}
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold">Notificações & Automação</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure confirmações, lembretes e automações deste tipo de evento.
          </p>
        </div>

        {/* 1. Channels */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">1. Canais de envio</Label>
          <div className="space-y-2">
            <ChannelToggle
              checked={!!draft.send_email}
              onChange={(v) => update('send_email', v)}
              icon={<Mail className="h-4 w-4 text-blue-500" />}
              label="Enviar confirmação por E-mail"
            />
            <ChannelToggle
              checked={!!draft.send_whatsapp}
              onChange={(v) => update('send_whatsapp', v)}
              icon={<MessageCircle className="h-4 w-4 text-emerald-500" />}
              label="Enviar confirmação por WhatsApp"
            />
          </div>
          {/* TODO(edge): seleção de instância/nº de disparo do WhatsApp — coluna
              `whatsapp_instance_id` inexistente no schema de plataforma e a fonte
              de instâncias é tenant-bound. Plugar quando houver dispatcher. */}
        </div>

        {/* 2. Confirmation message template */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">2. Template de mensagem de confirmação</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Esta mensagem será enviada assim que o agendamento for criado.
            </p>
          </div>
          <PlatformCrmMessageTemplateEditor
            value={draft.confirmation_message_whatsapp || ''}
            onChange={(v) => update('confirmation_message_whatsapp', v)}
            placeholder={DEFAULT_CONFIRMATION_WHATSAPP}
            rows={9}
          />
          <p className="text-xs text-muted-foreground">
            Dica: use as variáveis para personalizar a mensagem automaticamente.
          </p>
        </div>

        {/* 3. Reminders */}
        <PlatformCrmRemindersList eventTypeId={eventTypeId} />

        {/* Save button */}
        <div className="flex justify-end pt-2">
          {/* TODO(edge): persiste a config; disparo real depende de edge inexistente. */}
          <Button
            type="button"
            onClick={() => upsertSettings.mutate(draft)}
            disabled={upsertSettings.isPending}
          >
            {upsertSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar notificações
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="space-y-6 lg:sticky lg:top-4 self-start">
        <PlatformCrmMessagePreview template={draft.confirmation_message_whatsapp || ''} />

        {/* 4. Recovery */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">4. Recuperação de não confirmados</Label>
            <Switch
              checked={!!draft.recovery_enabled}
              onCheckedChange={(v) => update('recovery_enabled', v)}
            />
          </div>
          {draft.recovery_enabled && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Disparar mensagem caso o lead não confirme até
              </p>
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <Input
                  type="number"
                  min={1}
                  value={draft.recovery_offset_value ?? 3}
                  onChange={(e) => update('recovery_offset_value', parseInt(e.target.value) || 1)}
                  className="h-9"
                />
                <Select
                  value={draft.recovery_offset_unit ?? 'hours'}
                  onValueChange={(v) => update('recovery_offset_unit', v as OffsetUnit)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutos</SelectItem>
                    <SelectItem value="hours">horas</SelectItem>
                    <SelectItem value="days">dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">antes da reunião.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setRecoveryEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Editar mensagem de recuperação
              </Button>
            </div>
          )}
        </div>

        {/* 5. Internal notifications */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <Label className="text-sm font-semibold">5. Notificações internas</Label>
          <p className="text-xs text-muted-foreground">
            Escolha quando e como o vendedor será notificado.
          </p>
          <div className="space-y-2">
            <InternalChk
              checked={!!draft.notify_seller_on_new}
              onChange={(v) => update('notify_seller_on_new', v)}
              label="Notificar vendedor quando alguém agendar"
            />
            <InternalChk
              checked={!!draft.notify_seller_on_confirm}
              onChange={(v) => update('notify_seller_on_confirm', v)}
              label="Notificar vendedor quando lead confirmar"
            />
            <InternalChk
              checked={!!draft.notify_seller_on_reschedule}
              onChange={(v) => update('notify_seller_on_reschedule', v)}
              label="Notificar vendedor quando solicitar reagendamento"
            />
            <InternalChk
              checked={!!draft.notify_seller_on_cancel}
              onChange={(v) => update('notify_seller_on_cancel', v)}
              label="Notificar vendedor quando cancelar"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label className="text-xs text-muted-foreground">Canal de notificação</Label>
            <Select
              value={draft.internal_channel ?? 'both'}
              onValueChange={(v) => update('internal_channel', v as InternalChannel)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Ambos (WhatsApp e E-mail)</SelectItem>
                <SelectItem value="whatsapp">Somente WhatsApp</SelectItem>
                <SelectItem value="email">Somente E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Mensagem para o vendedor</Label>
            </div>
            <PlatformCrmMessageTemplateEditor
              value={draft.internal_message_template || ''}
              onChange={(v) => update('internal_message_template', v)}
              placeholder={DEFAULT_INTERNAL}
              rows={5}
              showInsertButton={false}
            />
          </div>
        </div>
      </aside>

      {/* Recovery edit dialog */}
      <Dialog open={recoveryEditOpen} onOpenChange={setRecoveryEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Mensagem de recuperação</DialogTitle>
          </DialogHeader>
          <PlatformCrmMessageTemplateEditor
            value={draft.recovery_message || ''}
            onChange={(v) => update('recovery_message', v)}
            placeholder={DEFAULT_RECOVERY}
            rows={9}
          />
          <DialogFooter>
            <Button onClick={() => setRecoveryEditOpen(false)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelToggle({
  checked, onChange, icon, label,
}: { checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5 cursor-pointer hover:border-primary/40 transition-colors">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {icon}
      <span className="text-sm">{label}</span>
    </label>
  );
}

function InternalChk({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
