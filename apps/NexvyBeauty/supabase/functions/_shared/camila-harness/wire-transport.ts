// Wire transport — entrega de um OutboundEnvelope (dry ou Z-API/QR).
// Nome definitivo do fio de envio do camila-harness (piloto e pós-piloto).
// Nunca importa Z-API neste arquivo base; impl real vive em wire-transport-zapi.ts.

import type { OutboundEnvelope } from "./outbound-queue.ts";

export type WireTransport = {
  allowReal: boolean;
  send: (env: OutboundEnvelope) => Promise<{ ok: boolean; realSend: boolean }>;
};

/** Default seguro: 0 WhatsApp real. */
export function createDryWireTransport(): WireTransport {
  return {
    allowReal: false,
    send: async () => ({ ok: true, realSend: false }),
  };
}
