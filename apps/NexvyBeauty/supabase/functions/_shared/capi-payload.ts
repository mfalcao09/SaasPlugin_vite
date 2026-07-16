// _shared/capi-payload.ts — construtor PURO do payload da Conversions API (Meta)
// para eventos de Click-to-WhatsApp (business_messaging). Sem banco/rede →
// unit-testável (golden suite própria). Encoda o CONTRATO EXATO verificado na doc
// Meta Business Messaging (2026-07-16):
//   POST https://graph.facebook.com/v{ver}/{DATASET_ID}/events?access_token=…
//   {
//     data: [{
//       event_name, event_time(Unix SEGUNDOS), action_source:'business_messaging',
//       messaging_channel:'whatsapp', event_id,
//       user_data: { whatsapp_business_account_id, ctwa_clid },   // ctwa_clid NÃO-hasheado
//       custom_data: { value, currency }                          // só p/ Purchase
//     }],
//     partner_agent
//   }
//   token: whatsapp_business_management + whatsapp_business_manage_events.
//
// ⚠️ event_name usa os valores REAIS da CAPI-CTWA (Schedule/Lead/Qualified NÃO
// existem nessa API — ver doc). Mapa jornada→CAPI abaixo.

/** Mapa evento-de-jornada (nosso funil de 6) → event_name da CAPI-CTWA (valores REAIS).
 *  temperature_changed entra como QualifiedLead (o consumidor já filtra to∈{warm,hot}). */
export const JOURNEY_TO_CAPI: Record<string, string> = {
  meta_ctwa_received: 'LeadSubmitted', // #2 conversa iniciada (ctwa_clid capturado)
  temperature_changed: 'QualifiedLead', // #3 lead qualificada (dona real) — filtrado no SQL
  lead_qualified: 'QualifiedLead', // #3 (se emitido direto no futuro)
  demo_completed: 'ViewContent', // #4 raio-x/demo entregue (sinal mais rico)
  checkout_created: 'InitiateCheckout', // #5 checkout gerado
  sale_completed: 'Purchase', // #6 compra
  pix_paid: 'Purchase', // #6 compra (variante PIX)
};

export interface CapiConfig {
  datasetId: string;
  wabaId: string; // whatsapp_business_account_id (obrigatório no user_data)
  partnerAgent?: string;
}

export interface CapiEventInput {
  journeyEventType: string;
  journeyEventId: string;
  ctwaClid: string;
  eventTimeIso: string | null; // occurred_at do journey; fallback = agora
  value?: number | null;
  currency?: string | null;
  nowMs?: number; // injeção p/ teste determinístico (default Date.now())
}

/** event_name da CAPI para um tipo de jornada, ou null se não mapeável. */
export function capiEventName(journeyEventType: string): string | null {
  return JOURNEY_TO_CAPI[journeyEventType] ?? null;
}

/** Chave de dedup estável (event_id) — 1 evento CAPI por evento de jornada.
 *  Também serve de dedup com o Pixel do lado da Meta. */
export function capiEventId(eventName: string, journeyEventId: string): string {
  return `${eventName}.${journeyEventId}`;
}

/** Monta o corpo da requisição /{dataset}/events. Retorna null quando não há o
 *  que enviar (evento não-mapeável, sem ctwa_clid ou sem WABA). Purchase sem
 *  value é aceito (custom_data só entra quando há valor). */
export function buildCapiPayload(
  input: CapiEventInput,
  cfg: CapiConfig,
): { eventName: string; eventId: string; body: Record<string, unknown> } | null {
  const eventName = capiEventName(input.journeyEventType);
  if (!eventName) return null;
  if (!input.ctwaClid || !cfg.wabaId) return null;

  const fallbackMs = input.nowMs ?? Date.now();
  const baseMs = input.eventTimeIso ? new Date(input.eventTimeIso).getTime() : fallbackMs;
  const eventTime = Math.floor((Number.isFinite(baseMs) ? baseMs : fallbackMs) / 1000);
  const eventId = capiEventId(eventName, input.journeyEventId);

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: eventTime,
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    event_id: eventId,
    user_data: {
      whatsapp_business_account_id: cfg.wabaId,
      ctwa_clid: input.ctwaClid,
    },
  };
  if (typeof input.value === 'number' && Number.isFinite(input.value)) {
    event.custom_data = { value: input.value, currency: input.currency ?? 'BRL' };
  }

  const body: Record<string, unknown> = { data: [event] };
  if (cfg.partnerAgent) body.partner_agent = cfg.partnerAgent;
  return { eventName, eventId, body };
}
