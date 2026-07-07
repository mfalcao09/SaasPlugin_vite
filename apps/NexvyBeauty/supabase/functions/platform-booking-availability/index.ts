// platform-booking-availability — porte 1:1 de booking-availability (Vendus/CRM)
// para o módulo super-admin `platform_crm_*`. PÚBLICO (verify_jwt=false).
//
// Desacoplamento vs. fonte:
//   - tabelas → platform_crm_* (zero organization_id/product_id)
//   - slug do vendedor resolve via platform_crm_seller_booking (NÃO profiles.booking_slug)
//   - nome/foto do vendedor lidos server-side (service-role) de profiles.full_name/avatar_url;
//     o cliente anônimo só fala com esta edge (nunca lê profiles direto).
//
// Modos de resposta:
//   { userSlug }                 → { profile, eventTypes }               (lista de tipos ativos)
//   { userSlug, eventSlug }      → { profile, eventType }                (1 tipo por slug)
//   { eventTypeId, date }        → { slots }                             (disponibilidade)
//   { userSlug, eventSlug, date }→ { profile, eventType, slots }         (calendário direto)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface RequestBody {
  userSlug?: string;
  eventSlug?: string;
  eventTypeId?: string;
  date?: string;
  timezone?: string;
}

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

// deno-lint-ignore no-explicit-any
type SB = any;

// Resolve o vendedor (host) público a partir do slug de booking.
// Nome/foto vêm de profiles (service-role); bio de platform_crm_seller_booking.
async function resolveSellerBySlug(sb: SB, slug: string) {
  const { data: seller } = await sb
    .from('platform_crm_seller_booking')
    .select('user_id, booking_slug, booking_bio')
    .eq('booking_slug', slug)
    .maybeSingle();
  if (!seller) return null;

  const { data: prof } = await sb
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', seller.user_id)
    .maybeSingle();

  return {
    id: seller.user_id as string,
    full_name: (prof?.full_name as string) ?? null,
    avatar_url: (prof?.avatar_url as string) ?? null,
    booking_slug: seller.booking_slug as string,
    booking_bio: (seller.booking_bio as string) ?? null,
  };
}

// deno-lint-ignore no-explicit-any
function parseEventType(item: any) {
  return {
    ...item,
    questions: Array.isArray(item?.questions) ? item.questions : [],
    // platform_crm não tem coluna booking_experience → default 'standard'
    booking_experience: (item?.booking_experience as string) || 'standard',
  };
}

// Geração de slots — IDÊNTICA à fonte (booking-availability), só troca as tabelas.
async function computeSlots(
  sb: SB,
  eventTypeId: string,
  date: string,
): Promise<{ slots: TimeSlot[] } | { error: string; status: number }> {
  const { data: eventType, error: eventError } = await sb
    .from('platform_crm_booking_event_types')
    .select('*')
    .eq('id', eventTypeId)
    .single();

  if (eventError || !eventType) {
    console.error('Event type not found:', eventError);
    return { error: 'Event type not found', status: 404 };
  }

  const userId = eventType.user_id;
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  const { data: weeklyAvailability } = await sb
    .from('platform_crm_user_availability')
    .select('*')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_available', true);

  const { data: override } = await sb
    .from('platform_crm_availability_overrides')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (override && !override.is_available) {
    console.log('Date is blocked by override');
    return { slots: [] };
  }

  let timeRanges: { start: string; end: string }[] = [];

  if (override && override.is_available && override.start_time && override.end_time) {
    timeRanges = [{ start: override.start_time, end: override.end_time }];
  } else if (weeklyAvailability && weeklyAvailability.length > 0) {
    timeRanges = weeklyAvailability.map((a: { start_time: string; end_time: string }) => ({
      start: a.start_time,
      end: a.end_time,
    }));
  }

  if (timeRanges.length === 0) {
    console.log('No availability configured for this day');
    return { slots: [] };
  }

  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const { data: existingEvents } = await sb
    .from('platform_crm_calendar_events')
    .select('start_time, end_time')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .gte('start_time', startOfDay)
    .lte('start_time', endOfDay);

  const duration = eventType.duration_minutes;
  const bufferBefore = eventType.buffer_before || 0;
  const bufferAfter = eventType.buffer_after || 0;
  const minNoticeHours = eventType.min_notice_hours || 0;

  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);

  const slots: TimeSlot[] = [];

  for (const range of timeRanges) {
    const [startHour, startMin] = range.start.split(':').map(Number);
    const [endHour, endMin] = range.end.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + duration <= endMinutes) {
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndMin = currentMinutes + duration;
      const slotEndHour = Math.floor(slotEndMin / 60);
      const slotEndMinute = slotEndMin % 60;

      const startStr = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`;
      const endStr = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`;

      const slotDateTime = new Date(`${date}T${startStr}:00`);

      if (slotDateTime < minNoticeTime) {
        currentMinutes += 30;
        continue;
      }

      const slotStart = currentMinutes;
      const slotEnd = currentMinutes + duration;

      let hasConflict = false;
      for (const event of existingEvents || []) {
        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(event.end_time);

        const eventStartMinutes = eventStart.getHours() * 60 + eventStart.getMinutes() - bufferBefore;
        const eventEndMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes() + bufferAfter;

        if (slotStart < eventEndMinutes && slotEnd > eventStartMinutes) {
          hasConflict = true;
          break;
        }
      }

      slots.push({ start: startStr, end: endStr, available: !hasConflict });
      currentMinutes += 30;
    }
  }

  console.log(`Generated ${slots.length} slots, ${slots.filter((s) => s.available).length} available`);
  return { slots };
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
    const userSlug = body.userSlug?.trim();
    const eventSlug = body.eventSlug?.trim();
    const eventTypeId = body.eventTypeId?.trim();
    const date = body.date?.trim();

    // ---- Modo A: disponibilidade por eventTypeId + date (usado pelo calendário) ----
    if (eventTypeId && date) {
      const res = await computeSlots(sb, eventTypeId, date);
      if ('error' in res) return json({ error: res.error }, res.status);

      // Se também vier userSlug, devolve profile junto (conveniência).
      if (userSlug) {
        const profile = await resolveSellerBySlug(sb, userSlug);
        return json({ ...res, profile: profile ?? null });
      }
      return json(res);
    }

    // ---- Modos B/C: precisam do slug do vendedor ----
    if (!userSlug) {
      return json({ error: 'userSlug or (eventTypeId + date) is required' }, 400);
    }

    const profile = await resolveSellerBySlug(sb, userSlug);
    if (!profile) return json({ error: 'Página não encontrada', profile: null }, 404);

    // ---- Modo C: 1 tipo de evento por slug (+ slots opcionais) ----
    if (eventSlug) {
      const { data: eventType } = await sb
        .from('platform_crm_booking_event_types')
        .select('*')
        .eq('user_id', profile.id)
        .eq('slug', eventSlug)
        .eq('is_active', true)
        .maybeSingle();

      if (!eventType) return json({ profile, eventType: null }, 404);

      const parsed = parseEventType(eventType);

      if (date) {
        const res = await computeSlots(sb, parsed.id, date);
        if ('error' in res) return json({ error: res.error }, res.status);
        return json({ profile, eventType: parsed, slots: res.slots });
      }
      return json({ profile, eventType: parsed });
    }

    // ---- Modo B: lista de tipos ativos do vendedor ----
    const { data: eventTypes } = await sb
      .from('platform_crm_booking_event_types')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .order('name');

    return json({ profile, eventTypes: (eventTypes || []).map(parseEventType) });
  } catch (error) {
    console.error('Error in platform-booking-availability:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
