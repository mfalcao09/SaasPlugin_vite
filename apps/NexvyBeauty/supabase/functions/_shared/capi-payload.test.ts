// capi-payload.test.ts — SMOKE do construtor de payload da Conversions API (G4).
//
// Golden suite das funções PURAS de _shared/capi-payload.ts. Prova, sem rede, o
// CONTRATO EXATO da CAPI-CTWA (valores reais da doc Meta) e o dedup por event_id.
// Roda: deno test supabase/functions/_shared/capi-payload.test.ts

import { buildCapiPayload, type CapiConfig, capiEventId, capiEventName } from './capi-payload.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} — esperado ${e}, veio ${a}`);
}

const cfg: CapiConfig = { datasetId: 'DS123', wabaId: '1023556786945354', partnerAgent: 'nexvybeauty' };
const EVENT_TIME_ISO = '2026-07-16T00:00:00.000Z';
const EVENT_TIME_UNIX = Math.floor(new Date(EVENT_TIME_ISO).getTime() / 1000);

Deno.test('capiEventName — mapa jornada→CAPI com os valores REAIS da Meta', () => {
  eq(capiEventName('meta_ctwa_received'), 'LeadSubmitted', '#2 conversa');
  eq(capiEventName('temperature_changed'), 'QualifiedLead', '#3 qualificada');
  eq(capiEventName('demo_completed'), 'ViewContent', '#4 demo');
  eq(capiEventName('checkout_created'), 'InitiateCheckout', '#5 checkout');
  eq(capiEventName('sale_completed'), 'Purchase', '#6 compra');
  eq(capiEventName('pix_paid'), 'Purchase', '#6 compra pix');
  eq(capiEventName('first_message_in'), null, 'evento fora do funil → null');
});

Deno.test('buildCapiPayload — Purchase com value → corpo exato da CAPI-CTWA', () => {
  const built = buildCapiPayload(
    {
      journeyEventType: 'sale_completed',
      journeyEventId: 'je-uuid-1',
      ctwaClid: 'CLID_ABC',
      eventTimeIso: EVENT_TIME_ISO,
      value: 427,
      currency: 'BRL',
    },
    cfg,
  );
  eq(built?.eventName, 'Purchase', 'eventName');
  eq(built?.eventId, 'Purchase.je-uuid-1', 'event_id dedup');
  const event = (built?.body.data as any[])[0];
  eq(event.event_name, 'Purchase', 'payload.event_name');
  eq(event.event_time, EVENT_TIME_UNIX, 'event_time = Unix SEGUNDOS');
  eq(event.action_source, 'business_messaging', 'action_source');
  eq(event.messaging_channel, 'whatsapp', 'messaging_channel');
  eq(event.event_id, 'Purchase.je-uuid-1', 'payload.event_id');
  eq(event.user_data.whatsapp_business_account_id, '1023556786945354', 'user_data.waba (obrigatório)');
  eq(event.user_data.ctwa_clid, 'CLID_ABC', 'user_data.ctwa_clid (não-hasheado)');
  eq(event.custom_data.value, 427, 'custom_data.value');
  eq(event.custom_data.currency, 'BRL', 'custom_data.currency');
  eq((built?.body as any).partner_agent, 'nexvybeauty', 'partner_agent');
});

Deno.test('buildCapiPayload — LeadSubmitted sem value → sem custom_data', () => {
  const built = buildCapiPayload(
    { journeyEventType: 'meta_ctwa_received', journeyEventId: 'je-2', ctwaClid: 'C2', eventTimeIso: null, nowMs: 1784160000000 },
    cfg,
  );
  const event = (built?.body.data as any[])[0];
  eq(event.event_name, 'LeadSubmitted', 'eventName');
  eq('custom_data' in event, false, 'sem value → sem custom_data');
  eq(event.event_time, 1784160000, 'fallback nowMs → unix s');
});

Deno.test('buildCapiPayload — guardas: retorna null quando não dá pra enviar', () => {
  const base = { journeyEventType: 'sale_completed', journeyEventId: 'x', ctwaClid: 'C', eventTimeIso: null };
  eq(buildCapiPayload({ ...base, journeyEventType: 'first_message_in' }, cfg), null, 'evento não-mapeável → null');
  eq(buildCapiPayload({ ...base, ctwaClid: '' }, cfg), null, 'sem ctwa_clid → null');
  eq(buildCapiPayload(base, { datasetId: 'DS', wabaId: '' }), null, 'sem WABA → null');
});

Deno.test('capiEventId — dedup estável 1:1 com o evento de jornada', () => {
  eq(capiEventId('Purchase', 'je-9'), 'Purchase.je-9', 'formato dedup');
});
