import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Pencil, Mail, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import {
  usePlatformCrmBookingNotifications,
  type PlatformCrmBookingReminder,
  type OffsetUnit,
  type ReminderChannel,
} from '@/components/superadmin/crm/data/usePlatformCrmBookingNotifications';
import { cn } from '@/lib/utils';
import { PlatformCrmMessageTemplateEditor } from './PlatformCrmMessageTemplateEditor';

/**
 * Lista de LEMBRETES automáticos do CRM de PLATAFORMA (super_admin) — port 1:1
 * do `RemindersList` do CRM Vendus. CRUD via `usePlatformCrmBookingNotifications`
 * (`platform_crm_booking_reminders`); sem tenant/organization_id.
 * TODO(edge): o disparo real do lembrete depende do dispatcher inexistente.
 */

interface Props {
  eventTypeId: string;
}

const CHANNEL_ICON = {
  whatsapp: <MessageCircle className="h-4 w-4 text-emerald-500" />,
  email: <Mail className="h-4 w-4 text-blue-500" />,
  both: (
    <div className="flex items-center -space-x-0.5">
      <MessageCircle className="h-4 w-4 text-emerald-500" />
      <Mail className="h-4 w-4 text-blue-500" />
    </div>
  ),
};

const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  both: 'Ambos',
};

export function PlatformCrmRemindersList({ eventTypeId }: Props) {
  const { reminders, createReminder, updateReminder, deleteReminder } =
    usePlatformCrmBookingNotifications(eventTypeId);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base">Lembretes Automáticos</Label>
          <p className="text-xs text-muted-foreground">
            Crie lembretes que serão enviados antes da reunião.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => createReminder.mutate({})}
          disabled={createReminder.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar lembrete
        </Button>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Nenhum lembrete configurado.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_minmax(0,1.5fr)_80px] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border/60">
            <div>Envia antes</div>
            <div>Canal</div>
            <div>Mensagem</div>
            <div className="text-right">Ações</div>
          </div>

          <div className="divide-y divide-border/40">
            {reminders.map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                isEditing={editingId === r.id}
                onEdit={() => setEditingId(editingId === r.id ? null : r.id)}
                onDelete={() => deleteReminder.mutate(r.id)}
                onUpdate={(patch) => updateReminder.mutate({ id: r.id, ...patch })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReminderRow({
  reminder,
  isEditing,
  onEdit,
  onDelete,
  onUpdate,
}: {
  reminder: PlatformCrmBookingReminder;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<PlatformCrmBookingReminder>) => void;
}) {
  const channel = reminder.channel as ReminderChannel;
  return (
    <div className={cn('px-4 py-3', isEditing && 'bg-muted/20')}>
      <div className="grid grid-cols-[110px_1fr_minmax(0,1.5fr)_80px] gap-3 items-center">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={reminder.offset_value}
            onChange={(e) => onUpdate({ offset_value: parseInt(e.target.value) || 1 })}
            className="h-8 w-14 text-center"
          />
          <Select
            value={reminder.offset_unit}
            onValueChange={(v) => onUpdate({ offset_unit: v as OffsetUnit })}
          >
            <SelectTrigger className="h-8 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">minutos</SelectItem>
              <SelectItem value="hours">horas</SelectItem>
              <SelectItem value="days">dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select
          value={channel}
          onValueChange={(v) => onUpdate({ channel: v as ReminderChannel })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>
              <div className="flex items-center gap-2">
                {CHANNEL_ICON[channel]}
                <span>{CHANNEL_LABEL[channel]}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="both">Ambos</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {reminder.message_template?.replace(/\n+/g, ' ').slice(0, 120)}
        </p>

        <div className="flex items-center justify-end gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3">
          <PlatformCrmMessageTemplateEditor
            value={reminder.message_template || ''}
            onChange={(v) => onUpdate({ message_template: v })}
            rows={5}
            placeholder="Mensagem do lembrete..."
          />
        </div>
      )}
    </div>
  );
}
