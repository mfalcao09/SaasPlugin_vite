// platform-booking-submit — porte 1:1 de booking-submit (Vendus/CRM) para o
// módulo super-admin `platform_crm_*`. PÚBLICO (verify_jwt=false).
//
// Desacoplamento vs. fonte:
//   - tabelas → platform_crm_* (zero organization_id/product_id)
//   - cria platform_crm_calendar_events + platform_crm_booking_requests + token
//   - envio de e-mail/WhatsApp e sync de calendário externo saem daqui e viram
//     um motor dedicado: // TODO(edge): platform-booking-dispatcher (igual aos
//     demais motores da plataforma — a submissão nunca depende do envio).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface RequestBody {
  eventTypeId: string;
  startTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  additionalInfo?: Record<string, unknown>;
  timezone: string;
  tracking?: Record<string, unknown>;
  // aceitos por compatibilidade com o front público (userSlug/eventSlug),
  // mas o eventTypeId é a chave canônica — igual à fonte.
  userSlug?: string;
  eventSlug?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: RequestBody = await req.json();
    const { eventTypeId, startTime, guestName, guestEmail, additionalInfo, timezone, tracking } = body;
    const guestPhone = body.guestPhone;

    // Validation (idêntica à fonte)
    if (!eventTypeId || !startTime || !guestName || !guestEmail) {
      return json({ error: 'Missing required fields' }, 400);
    }

    console.log(`[platform-booking-submit] booking for ${guestEmail} at ${startTime}`);

    // 1. Fetch event type
    const { data: eventType, error: eventError } = await supabase
      .from('platform_crm_booking_event_types')
      .select('*')
      .eq('id', eventTypeId)
      .single();

    if (eventError || !eventType) {
      console.error('Event type not found:', eventError);
      return json({ error: 'Event type not found' }, 404);
    }

    if (!eventType.is_active) {
      return json({ error: 'Event type is not active' }, 400);
    }

    // 2. Calculate end time
    // Regra: se vier sem offset de timezone, assumir Brasília (-03:00) — não UTC.
    const hasTzOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(startTime);
    const normalizedStart = hasTzOffset ? startTime : `${startTime}-03:00`;
    const startDate = new Date(normalizedStart);
    const endDate = new Date(startDate.getTime() + eventType.duration_minutes * 60 * 1000);
    const startTimeIso = startDate.toISOString();
    const endTime = endDate.toISOString();

    // 3. Check for conflicts (double-booking protection)
    const { data: conflicts } = await supabase
      .from('platform_crm_calendar_events')
      .select('id')
      .eq('user_id', eventType.user_id)
      .neq('status', 'cancelled')
      .lt('start_time', endTime)
      .gt('end_time', startTimeIso);

    if (conflicts && conflicts.length > 0) {
      console.log('Time slot is no longer available');
      return json({ error: 'Este horário não está mais disponível' }, 409);
    }

    // 4. Create calendar event (platform_crm_calendar_events — sem organization_id)
    const { data: calendarEvent, error: calendarError } = await supabase
      .from('platform_crm_calendar_events')
      .insert({
        user_id: eventType.user_id,
        title: `${eventType.name} com ${guestName}`,
        description: `Agendamento via link público\n\nConvidado: ${guestName}\nEmail: ${guestEmail}${guestPhone ? `\nTelefone: ${guestPhone}` : ''}`,
        start_time: startTimeIso,
        end_time: endTime,
        event_type: 'booking',
        status: 'confirmed',
        color: eventType.color,
        create_meet: eventType.create_meet,
        attendees: [{ email: guestEmail, name: guestName }],
        metadata: {
          booking_event_type_id: eventType.id,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
        },
      })
      .select()
      .single();

    if (calendarError) {
      console.error('Error creating calendar event:', calendarError);
      return json({ error: 'Failed to create calendar event' }, 500);
    }

    // 5. Create booking request (token de confirmação/reagendamento)
    const confirmationToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

    const { data: booking, error: bookingError } = await supabase
      .from('platform_crm_booking_requests')
      .insert({
        event_type_id: eventType.id,
        host_user_id: eventType.user_id,
        calendar_event_id: calendarEvent.id,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone || null,
        start_time: startTimeIso,
        end_time: endTime,
        timezone: timezone || 'America/Sao_Paulo',
        status: 'confirmed',
        additional_info: additionalInfo || {},
        confirmation_token: confirmationToken,
        tracking: tracking || {},
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      // Rollback calendar event
      await supabase.from('platform_crm_calendar_events').delete().eq('id', calendarEvent.id);
      return json({ error: 'Failed to create booking' }, 500);
    }

    console.log(`[platform-booking-submit] booking created: ${booking.id}`);

    // 6. Notificações (confirmação por WhatsApp ao convidado + aviso interno ao
    //    vendedor): delegadas ao platform-booking-dispatcher. Fire-and-forget e
    //    NON-FATAL — a submissão NUNCA depende do envio (igual aos demais motores).
    //    server-to-server com SERVICE_ROLE (o dispatcher não é público); em
    //    EdgeRuntime.waitUntil pra não bloquear a resposta ao cliente.
    try {
      const dispatch = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-booking-dispatcher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ booking_id: booking.id }),
      }).catch((e) => {
        console.error('[platform-booking-submit] dispatch falhou (non-fatal):', e);
      });
      // @ts-ignore — EdgeRuntime existe no runtime das Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(dispatch);
      }
    } catch (e) {
      console.error('[platform-booking-submit] dispatch setup falhou (non-fatal):', e);
    }

    return json({
      success: true,
      bookingId: booking.id,
      calendarEventId: calendarEvent.id,
      meetLink: calendarEvent.meet_link || undefined,
      confirmationToken,
    });
  } catch (error) {
    console.error('Error processing booking:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
