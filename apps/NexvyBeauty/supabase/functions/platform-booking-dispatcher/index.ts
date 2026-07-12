// platform-booking-dispatcher — motor de ENTREGA das confirmações de booking do
// módulo super-admin `platform_crm_*`. Cumpre o // TODO(edge) deixado em
// platform-booking-submit: a submissão faz nascer a reunião; ESTA edge entrega a
// confirmação ao convidado e o aviso interno ao vendedor.
//
// Desacoplamento vs. fonte (booking-dispatcher/Vendus):
//   - a fonte é cron-driven sobre booking_scheduled_jobs + Evolution (WhatsApp
//     não-oficial, por-tenant). AQUI o canal é a WhatsApp Cloud API oficial
//     (número de VENDAS da plataforma), mono-connection, SEM organization_id.
//   - connection ativa = platform_crm_whatsapp_meta_connections (status='active'
//     mais recente), token via decryptSecret, POST em /{phone_number_id}/messages
//     (mesmo padrão de entrega do platform-webchat-inbox).
//   - conteúdo reusa o motor de templates da fonte (_shared/booking-templates.ts):
//     confirmation_whatsapp p/ o convidado, internal_whatsapp p/ o vendedor,
//     com fallback nos DEFAULT_TEMPLATES quando o event_type não customizou.
//
// Invocação: server-to-server pelo platform-booking-submit (fire-and-forget,
//   Authorization: Bearer SERVICE_ROLE). O gate JWT do gateway aceita QUALQUER
//   JWT do projeto (inclusive o anon key público) — por isso a função valida
//   internamente que o bearer É a service-role key (comparação timing-safe).
//
// Payload aceito: { booking_id }  (canônico — recarrega o booking por id).
//
// E-mail: a plataforma não tem provedor transacional próprio (o tenant usa
//   sendPlatformEmail; portar aqui criaria dependência cruzada). Registramos um
//   // TODO logado por ora — a confirmação por WhatsApp é o canal ativo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, timingSafeEqual } from '../_shared/meta-graph.ts';
import { authenticatePlatformAgent } from '../_shared/platform-crm-auth.ts';
import {
  buildBookingVars,
  renderTemplate,
  DEFAULT_TEMPLATES,
} from '../_shared/booking-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SB = any;

interface RequestBody {
  booking_id?: string;
  // aceito por conveniência (compat camelCase); o booking_id é a chave canônica —
  // o dispatcher sempre recarrega a row completa por id.
  bookingId?: string;
  // Ação de entrega. Ausente ou 'confirmation' → caminho legado (confirmação ao
  // convidado + aviso interno de novo agendamento). 'cancellation' → NOVO caminho
  // aditivo: entrega o aviso de cancelamento (convidado + vendedor). O caminho de
  // confirmação NUNCA é tocado por 'cancellation' e vice-versa.
  action?: 'confirmation' | 'cancellation';
}

/**
 * Entrega uma mensagem de texto no WhatsApp Cloud API (número de VENDAS).
 * Mono-connection: usa a connection `active` mais recente. Retorna o wamid para
 * casar com os statuses (sent/delivered/read) que chegam pelo webhook.
 * Espelho 1:1 do deliverViaWhatsAppCloud do platform-webchat-inbox.
 */
async function deliverWhatsAppText(
  supabase: SB,
  toPhone: string,
  content: string,
): Promise<{ wamid: string | null; error: string | null }> {
  try {
    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, phone_number_id, access_token_encrypted')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
      return { wamid: null, error: 'no_active_connection' };
    }
    const token = await decryptSecret(conn.access_token_encrypted as string);
    const to = String(toPhone ?? '').replace(/\D/g, '');
    if (!to) return { wamid: null, error: 'no_destination_phone' };

    const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: content } };
    const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `graph ${res.status}`;
      console.error('[platform-booking-dispatcher] entrega WhatsApp falhou:', msg);
      return { wamid: null, error: String(msg).slice(0, 300) };
    }
    return { wamid: data?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    console.error('[platform-booking-dispatcher] entrega WhatsApp exception:', e);
    return { wamid: null, error: String(e).slice(0, 300) };
  }
}

/**
 * CANCELAMENTO — caminho ADITIVO e independente do fluxo de confirmação.
 * Entrega o aviso de cancelamento ao convidado (WhatsApp Cloud API) e, quando
 * configurado, o aviso interno ao vendedor. Idempotente por wamid: o wamid da
 * mensagem de cancelamento ao convidado é gravado em
 * `platform_crm_booking_requests.cancellation_message_id`; reinvocação com o
 * wamid já presente NÃO reenvia (mesma disciplina do whatsapp_message_id da
 * confirmação). O aviso ao vendedor é best-effort e não bloqueia.
 *
 * Pré-condição de dados: a transição de status para 'cancelled' já foi feita por
 * quem chama (hook usePlatformCrmBookings / platform-booking-token). Esta edge
 * apenas ENTREGA a notificação; não altera status.
 */
async function handleCancellation(
  supabase: SB,
  bookingId: string,
  siteUrl: string,
): Promise<Response> {
  // 1) Recarrega o booking (fonte da verdade). Select próprio — não toca o select
  //    do fluxo de confirmação.
  const { data: booking, error: bErr } = await supabase
    .from('platform_crm_booking_requests')
    .select('id, event_type_id, host_user_id, calendar_event_id, guest_name, guest_email, guest_phone, start_time, end_time, timezone, status, confirmation_token, cancellation_reason, cancellation_message_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return json({ error: 'booking not found' }, 404);

  // 2) Relações (event_type nome + settings de notificação, host, seller notif,
  //    calendar meet_link) — mesmas fontes do fluxo de confirmação.
  const [etRes, settingsRes, hostRes, sellerNotifRes, calRes] = await Promise.all([
    supabase.from('platform_crm_booking_event_types')
      .select('id, name, confirmation_message')
      .eq('id', booking.event_type_id).maybeSingle(),
    supabase.from('platform_crm_booking_notification_settings')
      .select('send_whatsapp, notify_seller_on_cancel, internal_channel, internal_message_template')
      .eq('event_type_id', booking.event_type_id).maybeSingle(),
    supabase.from('profiles')
      .select('full_name')
      .eq('id', booking.host_user_id).maybeSingle(),
    supabase.from('platform_crm_seller_notification_settings')
      .select('channel, whatsapp_number')
      .eq('user_id', booking.host_user_id).maybeSingle(),
    booking.calendar_event_id
      ? supabase.from('platform_crm_calendar_events').select('meet_link').eq('id', booking.calendar_event_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const eventType = etRes.data;
  const settings = settingsRes.data;
  const hostName = (hostRes.data?.full_name as string) ?? 'Vendedor';
  const sellerNotif = sellerNotifRes.data;
  const meetLink = (calRes.data?.meet_link as string) ?? null;

  const vars = buildBookingVars({
    guest_name: booking.guest_name,
    guest_email: booking.guest_email,
    guest_phone: booking.guest_phone,
    start_time: booking.start_time,
    end_time: booking.end_time,
    timezone: booking.timezone,
    event_name: eventType?.name,
    host_name: hostName,
    meet_link: meetLink,
    confirmation_url: `${siteUrl}/confirmar/${booking.confirmation_token}`,
    reschedule_url: `${siteUrl}/reagendar/${booking.confirmation_token}`,
    cancellation_reason: booking.cancellation_reason,
  });

  const results: Record<string, unknown> = {};

  // ============================================================
  // 3) AVISO DE CANCELAMENTO AO CONVIDADO (WhatsApp)
  //    Idempotência por wamid: cancellation_message_id já gravado → não reenvia.
  //    Respeita o opt-in send_whatsapp do event_type (mesmo gate da confirmação).
  // ============================================================
  const guestPhone = booking.guest_phone;
  if (guestPhone && booking.cancellation_message_id) {
    results.guest_whatsapp = { skipped: 'already_sent', wamid: booking.cancellation_message_id };
  } else if (guestPhone && settings?.send_whatsapp !== true) {
    results.guest_whatsapp = { skipped: 'send_whatsapp_disabled' };
  } else if (guestPhone) {
    const tpl = DEFAULT_TEMPLATES.cancellation_whatsapp;
    const message = renderTemplate(tpl, vars);

    const { wamid, error } = await deliverWhatsAppText(supabase, guestPhone, message);
    results.guest_whatsapp = { wamid, error };

    if (wamid) {
      // Grava o wamid do cancelamento (idempotência) — NÃO altera status nem o
      // whatsapp_message_id da confirmação.
      await supabase.from('platform_crm_booking_requests')
        .update({ cancellation_message_id: wamid, updated_at: new Date().toISOString() })
        .eq('id', booking.id);
    }

    await supabase.from('platform_crm_booking_logs').insert({
      booking_id: booking.id,
      type: wamid ? 'cancellation_sent' : 'send_failed',
      channel: 'whatsapp',
      payload: { target: 'guest', kind: 'cancellation', wamid, phone_digits: String(guestPhone).replace(/\D/g, '') },
      error: error,
    });
  } else {
    console.log(`[platform-booking-dispatcher] booking ${booking.id}: sem telefone do convidado — cancelamento WhatsApp pulado`);
    results.guest_whatsapp = { skipped: 'no_guest_phone' };
  }

  // ============================================================
  // 4) AVISO INTERNO AO VENDEDOR (WhatsApp)
  //    Gate: notify_seller_on_cancel (DEFAULT true) + número interno + canal.
  // ============================================================
  const sellerWantsCancel = settings?.notify_seller_on_cancel !== false;
  const sellerChannel = sellerNotif?.channel ?? settings?.internal_channel ?? 'both';
  const sellerPhone = sellerNotif?.whatsapp_number ?? null;

  if (sellerWantsCancel && sellerPhone && (sellerChannel === 'whatsapp' || sellerChannel === 'both')) {
    const message = renderTemplate(DEFAULT_TEMPLATES.internal_cancellation_whatsapp, vars);
    const { wamid, error } = await deliverWhatsAppText(supabase, sellerPhone, message);
    results.seller_whatsapp = { wamid, error };

    await supabase.from('platform_crm_booking_logs').insert({
      booking_id: booking.id,
      type: wamid ? 'notification_sent' : 'send_failed',
      channel: 'whatsapp',
      payload: { target: 'seller', kind: 'cancellation', wamid, phone_digits: String(sellerPhone).replace(/\D/g, '') },
      error: error,
    });
  } else {
    results.seller_whatsapp = {
      skipped: !sellerWantsCancel ? 'opted_out' : (!sellerPhone ? 'no_seller_phone' : 'channel_not_whatsapp'),
    };
  }

  console.log(`[platform-booking-dispatcher] cancelamento ${booking.id} processado`, JSON.stringify(results));
  return json({ ok: true, booking_id: booking.id, action: 'cancellation', results });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    // Parse do body ANTES do gate — precisamos do `action` p/ decidir a auth e do
    // body p/ o authenticatePlatformAgent (service_role + actorUserId).
    const body: RequestBody = await req.json().catch(() => ({}));
    const bookingId = body.booking_id ?? body.bookingId;

    // Gate de auth. O gateway JWT aceitaria até o anon key público — insuficiente
    // para um endpoint que dispara WhatsApp. A função valida por si:
    //   • CONFIRMAÇÃO (e default): server-to-server, SÓ service-role key
    //     (timing-safe) — comportamento legado INTOCADO.
    //   • CANCELAMENTO (aditivo): também aceita super_admin — o hook
    //     usePlatformCrmBookings cancela do BROWSER com JWT super_admin. Aceita
    //     JWT do usuário (getClaims + role super_admin) OU service-role, via
    //     authenticatePlatformAgent (mesmo padrão dos outros platform-*).
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const isServiceRole = !!bearer && timingSafeEqual(bearer, serviceKey);

    if (body.action === 'cancellation') {
      if (!isServiceRole) {
        const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
        if (errorResponse) return errorResponse;
      }
    } else if (!isServiceRole) {
      // Confirmação / default: gate service-role-only original, intocado.
      return json({ error: 'forbidden' }, 403);
    }

    if (!bookingId) return json({ error: 'booking_id required' }, 400);

    // Base do frontend (rotas /confirmar e /reagendar por token). Mesmo padrão
    // do booking-dispatcher da fonte.
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.nexvy.tech';

    // ROTEAMENTO ADITIVO: 'cancellation' é um caminho SEPARADO — não passa por
    // nenhuma linha do fluxo de confirmação abaixo. Ausência de action (ou
    // 'confirmation') mantém 100% o comportamento legado.
    if (body.action === 'cancellation') {
      return await handleCancellation(supabase, bookingId, siteUrl);
    }

    // 1) Recarrega o booking (fonte da verdade — nunca confia no payload).
    const { data: booking, error: bErr } = await supabase
      .from('platform_crm_booking_requests')
      .select('id, event_type_id, host_user_id, calendar_event_id, guest_name, guest_email, guest_phone, start_time, end_time, timezone, status, confirmation_token, whatsapp_message_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (bErr || !booking) return json({ error: 'booking not found' }, 404);

    // Booking já cancelado → nada a enviar (idempotência defensiva).
    if (['cancelled', 'cancelado'].includes(booking.status)) {
      return json({ ok: true, skipped: 'cancelled' });
    }

    // 2) Relações: event_type (nome + settings de notificação), host (vendedor),
    //    calendar_event (meet_link). Tudo service-role.
    const [etRes, settingsRes, hostRes, sellerNotifRes, calRes] = await Promise.all([
      supabase.from('platform_crm_booking_event_types')
        .select('id, name, confirmation_message')
        .eq('id', booking.event_type_id).maybeSingle(),
      supabase.from('platform_crm_booking_notification_settings')
        .select('send_whatsapp, confirmation_message_whatsapp, notify_seller_on_new, internal_channel, internal_message_template')
        .eq('event_type_id', booking.event_type_id).maybeSingle(),
      supabase.from('profiles')
        .select('full_name')
        .eq('id', booking.host_user_id).maybeSingle(),
      supabase.from('platform_crm_seller_notification_settings')
        .select('notify_new_booking, channel, whatsapp_number')
        .eq('user_id', booking.host_user_id).maybeSingle(),
      booking.calendar_event_id
        ? supabase.from('platform_crm_calendar_events').select('meet_link').eq('id', booking.calendar_event_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const eventType = etRes.data;
    const settings = settingsRes.data;
    const hostName = (hostRes.data?.full_name as string) ?? 'Vendedor';
    const sellerNotif = sellerNotifRes.data;
    const meetLink = (calRes.data?.meet_link as string) ?? null;

    // 3) Variáveis padrão (mesmo motor da fonte — data/hora/vendedor/links).
    const vars = buildBookingVars({
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      guest_phone: booking.guest_phone,
      start_time: booking.start_time,
      end_time: booking.end_time,
      timezone: booking.timezone,
      event_name: eventType?.name,
      host_name: hostName,
      meet_link: meetLink,
      confirmation_url: `${siteUrl}/confirmar/${booking.confirmation_token}`,
      reschedule_url: `${siteUrl}/reagendar/${booking.confirmation_token}`,
    });

    const results: Record<string, unknown> = {};

    // ============================================================
    // 4) CONFIRMAÇÃO AO CONVIDADO (WhatsApp)
    //    Só envia se houver telefone. Template: customização do event_type
    //    (confirmation_message_whatsapp | confirmation_message) → DEFAULT.
    // ============================================================
    const guestPhone = booking.guest_phone;
    if (guestPhone && booking.whatsapp_message_id) {
      // Idempotência: confirmação já enviada (wamid gravado) — reinvocação não reenvia.
      results.guest_whatsapp = { skipped: 'already_sent', wamid: booking.whatsapp_message_id };
    } else if (guestPhone && settings?.send_whatsapp !== true) {
      // Respeita o opt-in do event_type (send_whatsapp DEFAULT false no schema —
      // mesmo gate da fonte tenant booking-submit).
      results.guest_whatsapp = { skipped: 'send_whatsapp_disabled' };
    } else if (guestPhone) {
      const tpl = settings?.confirmation_message_whatsapp
        || eventType?.confirmation_message
        || DEFAULT_TEMPLATES.confirmation_whatsapp;
      const message = renderTemplate(tpl, vars);

      const { wamid, error } = await deliverWhatsAppText(supabase, guestPhone, message);
      results.guest_whatsapp = { wamid, error };

      if (wamid) {
        // Grava o wamid no booking (o webhook Meta atualiza os statuses por ele)
        // e transiciona o status para 'confirmacao_enviada' (idem à fonte).
        const updates: Record<string, unknown> = { whatsapp_message_id: wamid, updated_at: new Date().toISOString() };
        if (booking.status === 'confirmed') updates.status = 'confirmacao_enviada';
        await supabase.from('platform_crm_booking_requests').update(updates).eq('id', booking.id);
      }

      await supabase.from('platform_crm_booking_logs').insert({
        booking_id: booking.id,
        type: wamid ? 'confirmation_sent' : 'send_failed',
        channel: 'whatsapp',
        payload: { target: 'guest', wamid, phone_digits: String(guestPhone).replace(/\D/g, '') },
        error: error,
      });
    } else {
      console.log(`[platform-booking-dispatcher] booking ${booking.id}: sem telefone do convidado — confirmação WhatsApp pulada`);
      results.guest_whatsapp = { skipped: 'no_guest_phone' };
    }

    // ============================================================
    // 5) AVISO INTERNO AO VENDEDOR (WhatsApp)
    //    Só quando o vendedor optou por receber (seller_notification_settings
    //    ou notification_settings do event_type) e há número interno.
    // ============================================================
    const sellerWantsNew = sellerNotif
      ? sellerNotif.notify_new_booking !== false
      : (settings?.notify_seller_on_new !== false);
    const sellerChannel = sellerNotif?.channel ?? settings?.internal_channel ?? 'both';
    const sellerPhone = sellerNotif?.whatsapp_number ?? null;

    if (sellerWantsNew && sellerPhone && (sellerChannel === 'whatsapp' || sellerChannel === 'both')) {
      const tpl = settings?.internal_message_template || DEFAULT_TEMPLATES.internal_whatsapp;
      const message = renderTemplate(tpl, vars);
      const { wamid, error } = await deliverWhatsAppText(supabase, sellerPhone, message);
      results.seller_whatsapp = { wamid, error };

      await supabase.from('platform_crm_booking_logs').insert({
        booking_id: booking.id,
        type: wamid ? 'notification_sent' : 'send_failed',
        channel: 'whatsapp',
        payload: { target: 'seller', wamid, phone_digits: String(sellerPhone).replace(/\D/g, '') },
        error: error,
      });
    } else {
      results.seller_whatsapp = {
        skipped: !sellerWantsNew ? 'opted_out' : (!sellerPhone ? 'no_seller_phone' : 'channel_not_whatsapp'),
      };
    }

    // ============================================================
    // 6) E-MAIL — sem provedor transacional na plataforma (o tenant usa
    //    sendPlatformEmail; portar aqui criaria dependência cruzada). Fica como
    //    // TODO(edge) logado até a plataforma ter seu próprio pipeline de e-mail.
    // ============================================================
    if (booking.guest_email) {
      console.log(`[platform-booking-dispatcher] TODO(edge): e-mail de confirmação para ${booking.guest_email} — plataforma ainda sem provedor transacional (WhatsApp é o canal ativo).`);
      results.guest_email = { todo: 'no_platform_email_provider' };
    }

    console.log(`[platform-booking-dispatcher] booking ${booking.id} processado`, JSON.stringify(results));
    return json({ ok: true, booking_id: booking.id, results });
  } catch (error) {
    console.error('[platform-booking-dispatcher] erro:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
