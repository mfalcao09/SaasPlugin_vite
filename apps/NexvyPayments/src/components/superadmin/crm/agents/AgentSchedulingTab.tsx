// PORTE 1:1 de `.vendus-src-reference/src/components/admin/agents/AgentSchedulingTab.tsx`
// D3 P1/F1d — subsistema de AGENTES IA por produto. Twin: tipos de `./types`.
// Rewire tenant→plataforma (zero organization_id):
//   • membros: `usePlatformCrmTeamMembers` (reps da plataforma) em vez de profiles/orgId
//   • tipos de evento: `usePlatformCrmBookingEventTypes` (platform_crm_booking_event_types)
//   • produto vinculado: `usePlatformCrmProducts` (platform_crm_products)
import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, Bell, AlertTriangle, Sparkles } from 'lucide-react';
import type { ProductAgent } from './types';
import { usePlatformCrmTeamMembers } from '@/components/superadmin/crm/data/usePlatformCrmTeam';
import { usePlatformCrmBookingEventTypes } from '@/components/superadmin/crm/data/usePlatformCrmBookingEventTypes';
import { usePlatformCrmProducts } from '@/components/superadmin/crm/data/usePlatformCrmProducts';

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

export function AgentSchedulingTab({ formData, onChange }: Props) {
  const { data: members = [] } = usePlatformCrmTeamMembers();
  const { eventTypes: allEventTypes = [] } = usePlatformCrmBookingEventTypes();
  const { data: products = [] } = usePlatformCrmProducts();

  // Tipos de evento do anfitrião selecionado (ativos).
  const eventTypes = useMemo(
    () =>
      allEventTypes.filter(
        (e) =>
          e.is_active !== false &&
          (!formData.default_schedule_user_id || e.user_id === formData.default_schedule_user_id),
      ),
    [allEventTypes, formData.default_schedule_user_id],
  );

  const linkedProduct = useMemo(
    () => (formData.product_id ? products.find((p) => p.id === formData.product_id) ?? null : null),
    [products, formData.product_id],
  );

  const canSchedule = !!formData.can_schedule_meetings;
  const allowedIds = formData.allowed_event_type_ids ?? [];
  const notifyIds = formData.booking_notification_user_ids ?? [];
  const notifyAdmins = !!formData.booking_notify_org_admins;

  const toggleEventType = (id: string) => {
    const next = allowedIds.includes(id)
      ? allowedIds.filter((x) => x !== id)
      : [...allowedIds, id];
    onChange({ allowed_event_type_ids: next });
  };

  const toggleNotifyUser = (id: string) => {
    const next = notifyIds.includes(id)
      ? notifyIds.filter((x) => x !== id)
      : [...notifyIds, id];
    onChange({ booking_notification_user_ids: next });
  };

  const hostMember = useMemo(
    () => members.find((m) => m.id === formData.default_schedule_user_id),
    [members, formData.default_schedule_user_id],
  );

  // Auto-clean: ao trocar host, remove tipos de evento que não pertencem mais ao host.
  useEffect(() => {
    if (!formData.default_schedule_user_id) return;
    const validIds = new Set(eventTypes.map((e) => e.id));
    const filtered = allowedIds.filter((id) => validIds.has(id));
    if (filtered.length !== allowedIds.length) {
      onChange({ allowed_event_type_ids: filtered });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypes.map((e) => e.id).join(','), formData.default_schedule_user_id]);

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-muted/40">
        <div className="space-y-1">
          <Label className="font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Este agente pode marcar reuniões
          </Label>
          <p className="text-xs text-muted-foreground">
            Quando ativado, a IA pode consultar a agenda do anfitrião e confirmar horários com o lead.
          </p>
        </div>
        <Switch
          checked={canSchedule}
          onCheckedChange={(v) => onChange({ can_schedule_meetings: v })}
        />
      </div>

      {!canSchedule && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-dashed text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Ative o switch acima para configurar o agendamento deste agente.</span>
        </div>
      )}

      {canSchedule && (
        <>
          {/* Host */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Calendário do anfitrião
            </Label>
            <p className="text-xs text-muted-foreground">
              Vendedor cuja agenda a IA vai consultar e onde a reunião será criada.
            </p>
            <Select
              value={formData.default_schedule_user_id || '__none__'}
              onValueChange={(v) =>
                onChange({
                  default_schedule_user_id: v === '__none__' ? null : v,
                  allowed_event_type_ids: [],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o anfitrião" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Não definido —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email || m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event types */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Tipos de evento permitidos
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {hostMember
                ? `Tipos cadastrados por ${hostMember.full_name || hostMember.email}.`
                : 'Selecione um anfitrião para listar os tipos de evento dele.'}
              {' '}Se mais de um for permitido, a IA pergunta ao lead qual quer marcar.
            </p>

            {!formData.default_schedule_user_id ? (
              <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-lg">
                Defina o anfitrião primeiro.
              </div>
            ) : eventTypes.length === 0 ? (
              linkedProduct?.name ? (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 text-sm">
                  <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="space-y-1">
                    <div className="font-medium">Pronto pra agendar automaticamente</div>
                    <p className="text-xs text-muted-foreground">
                      Sem tipo de evento configurado, o sistema cria automaticamente{' '}
                      <span className="font-medium text-foreground">"Apresentação {linkedProduct.name}"</span>{' '}
                      (30 min, Google Meet) na primeira reunião agendada por esse agente.
                      Você pode personalizar depois nos tipos de evento.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-lg">
                  Esse anfitrião ainda não tem tipos de evento ativos.
                </div>
              )
            ) : (
              <div className="space-y-2">
                {eventTypes.map((et) => {
                  const checked = allowedIds.includes(et.id);
                  return (
                    <button
                      key={et.id}
                      type="button"
                      onClick={() => toggleEventType(et.id)}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition ${
                        checked
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{et.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {et.duration_minutes} min
                        </div>
                      </div>
                      <Switch checked={checked} onCheckedChange={() => toggleEventType(et.id)} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-3 p-3 rounded-lg border bg-muted/40">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <Label className="font-medium">Notificar quando uma reunião for confirmada</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Os usuários selecionados recebem aviso no sino de notificações da plataforma.
            </p>

            <div className="flex items-center justify-between gap-4 p-2 rounded-md bg-background">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Notificar todos os administradores</span>
              </div>
              <Switch
                checked={notifyAdmins}
                onCheckedChange={(v) => onChange({ booking_notify_org_admins: v })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Usuários específicos</Label>
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {members.map((m) => {
                  const checked = notifyIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleNotifyUser(m.id)}
                      className={`w-full flex items-center justify-between gap-2 p-2 rounded-md border text-left transition text-sm ${
                        checked
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:border-border bg-background'
                      }`}
                    >
                      <span className="truncate">{m.full_name || m.email}</span>
                      {checked && <Badge variant="secondary" className="text-[10px]">Notificar</Badge>}
                    </button>
                  );
                })}
                {members.length === 0 && (
                  <div className="text-xs text-muted-foreground italic p-2">
                    Nenhum membro encontrado.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
