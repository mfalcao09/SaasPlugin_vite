/**
 * Barrel do subsistema de BOOKING (Calendly de reunião de venda) do CRM de
 * PLATAFORMA (super_admin). Port 1:1 de `admin/booking/` do CRM Vendus,
 * desacoplado do tenant (tabelas `platform_crm_booking_*` / `_user_availability`
 * / `_availability_overrides`; slug do vendedor em `platform_crm_seller_booking`).
 * Sem tocar a agenda do salão do tenant.
 */
export { PlatformCrmBookingsManager } from './PlatformCrmBookingsManager';
export { PlatformCrmEventTypesManager } from './PlatformCrmEventTypesManager';
export { PlatformCrmEventTypeEditor } from './PlatformCrmEventTypeEditor';
export { PlatformCrmAvailabilityManager } from './PlatformCrmAvailabilityManager';
export { PlatformCrmAddTimeSlotDialog } from './PlatformCrmAddTimeSlotDialog';
export { PlatformCrmCopyDayDialog } from './PlatformCrmCopyDayDialog';
export { PlatformCrmTeamBookingLinks } from './PlatformCrmTeamBookingLinks';
export { PlatformCrmBookingStatusBadge } from './PlatformCrmBookingStatusBadge';
export { PlatformCrmBookingTimeline } from './PlatformCrmBookingTimeline';
