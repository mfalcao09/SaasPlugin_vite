// platform-booking-token — confirmação / reagendamento / cancelamento de uma
// reunião pública por TOKEN, no módulo super-admin `platform_crm_*`.
// PÚBLICO (verify_jwt=false).
//
// Por que uma edge (e não as RPCs get/reschedule/cancel_booking_by_token):
//   aquelas RPCs operam sobre public.booking_requests (o CRM legado/tenant).
//   Reusá-las cruzaria a fronteira tenant↔plataforma. Aqui replicamos a MESMA
//   lógica sobre platform_crm_* via service-role — o cliente anônimo nunca lê
//   as tabelas direto (padrão do app: público só fala com edges).
//
// Ações (campo `action`):
//   'get'        { token }                              → { booking }  (booking + event_type + host_profile + calendar_event)
//   'reschedule' { token, newStartTime, timezone }      → { ok, id, end_time }
//   'cancel'     { token, reason? }                     → { ok, id }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface RequestBody {
  action: 'get' | 'reschedule' | 'cancel';
  token?: string;
  newStartTime?: string;
  timezone?: string;
  reason?: string;
}

// deno-lint-ignore no-explicit-any
type SB = any;

const validToken = (t?: string): t is string => typeof t === 'string' && t.length >= 16;

// GET — booking por token + relações (event_type, host_profile, calendar_event).
// Espelha useBookingConfirmation.useBookingByToken (Vendus), tabelas platform_crm_*.
async function handleGet(sb: SB, token: string) {
  const { data: booking } = await sb
    .from('platform_crm_booking_requests')
    .select(
      'id, guest_name, guest_email, guest_phone, start_time, end_time, timezone, status, confirmation_token, additional_info, created_at, event_type_id, host_user_id, calendar_event_id, cancellation_reason',
    )
    .eq('confirmation_token', token)
    .maybeSingle();

  if (!booking) return json({ booking: null }, 404);

  const [etRes, hostRes, calRes] = await Promise.all([
    sb.from('platform_crm_booking_event_types')
      .select('id, name, description, duration_minutes, color, location_type')
      .eq('id', booking.event_type_id)
      .maybeSingle(),
    sb.from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', booking.host_user_id)
      .maybeSingle(),
    booking.calendar_event_id
      ? sb.from('platform_crm_calendar_events')
          .select('id, meet_link')
          .eq('id', booking.calendar_event_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return json({
    booking: {
      ...booking,
      additional_info: booking.additional_info || {},
      // campos de thank-you não existem em platform_crm → null (front faz fallback)
      event_type: etRes.data
        ? {
            ...etRes.data,
            thank_you_title: null,
            thank_you_message: null,
            what_happens: null,
            next_steps: null,
          }
        : null,
      host_profile: hostRes.data,
      calendar_event: calRes.data,
    },
  });
}

// RESCHEDULE — replica reschedule_booking_by_token sobre platform_crm_*.
async function handleReschedule(sb: SB, token: string, newStartTime?: string, timezone?: string) {
  if (!newStartTime || !timezone) return json({ error: 'Missing parameters' }, 400);

  const { data: booking } = await sb
    .from('platform_crm_booking_requests')
    .select('id, calendar_event_id, status, event_type_id')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (!booking) return json({ error: 'Booking not found' }, 404);

  const { data: et } = await sb
    .from('platform_crm_booking_event_types')
    .select('duration_minutes')
    .eq('id', booking.event_type_id)
    .maybeSingle();

  const duration = et?.duration_minutes ?? 30;
  const newStart = new Date(newStartTime);
  const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
  const newStartIso = newStart.toISOString();
  const newEndIso = newEnd.toISOString();

  const { error: updErr } = await sb
    .from('platform_crm_booking_requests')
    .update({
      start_time: newStartIso,
      end_time: newEndIso,
      timezone,
      status: booking.status === 'cancelled' ? 'confirmed' : booking.status,
    })
    .eq('id', booking.id);

  if (updErr) {
    console.error('[platform-booking-token] reschedule error:', updErr);
    return json({ error: 'Failed to reschedule' }, 500);
  }

  if (booking.calendar_event_id) {
    await sb
      .from('platform_crm_calendar_events')
      .update({ start_time: newStartIso, end_time: newEndIso })
      .eq('id', booking.calendar_event_id);
  }

  return json({ ok: true, id: booking.id, end_time: newEndIso });
}

// CANCEL — replica cancel_booking_by_token sobre platform_crm_*.
async function handleCancel(sb: SB, token: string, reason?: string) {
  const { data: booking } = await sb
    .from('platform_crm_booking_requests')
    .select('id, calendar_event_id, status')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (!booking) return json({ error: 'Booking not found' }, 404);
  if (booking.status === 'cancelled') return json({ ok: true, already_cancelled: true });

  const { error: updErr } = await sb
    .from('platform_crm_booking_requests')
    .update({ status: 'cancelled', cancellation_reason: reason ?? null })
    .eq('id', booking.id);

  if (updErr) {
    console.error('[platform-booking-token] cancel error:', updErr);
    return json({ error: 'Failed to cancel' }, 500);
  }

  if (booking.calendar_event_id) {
    await sb
      .from('platform_crm_calendar_events')
      .update({ status: 'cancelled' })
      .eq('id', booking.calendar_event_id);
  }

  return json({ ok: true, id: booking.id });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { action, token } = body;

    if (!validToken(token)) return json({ error: 'Invalid token' }, 400);

    switch (action) {
      case 'get':
        return await handleGet(sb, token);
      case 'reschedule':
        return await handleReschedule(sb, token, body.newStartTime, body.timezone);
      case 'cancel':
        return await handleCancel(sb, token, body.reason);
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    console.error('Error in platform-booking-token:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
