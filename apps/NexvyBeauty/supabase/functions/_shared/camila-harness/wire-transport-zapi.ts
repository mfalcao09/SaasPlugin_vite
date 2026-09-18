// Wire transport Z-API / QR-send — impl real do WireTransport.
// Só envia se allowReal=true E caller passou flags live. Default callers usam dry.
import type { OutboundEnvelope } from "./outbound-queue.ts";
import type { WireTransport } from "./wire-transport.ts";
import { createDryWireTransport } from "./wire-transport.ts";
import { harnessAllowsRealWhatsapp } from "./runtime-bridge.ts";

export type WireSendInput = {
  to: string;
  text: string;
  idempotencyKey: string;
  conversationId: string;
  sendAs?: "text" | "link";
  linkPreview?: OutboundEnvelope["linkPreview"];
};

export type WireTransportZapiDeps = {
  /** Invoke platform-whatsapp-qr-send (text ou link com preview). */
  sendText: (input: WireSendInput) => Promise<{ ok: boolean; error?: string }>;
  envGet?: (k: string) => string | undefined;
};

/**
 * Real transport. allowReal only when HARNESS_PILOT_LIVE=1 && HARNESS_ALLOW_REAL_WHATSAPP=1.
 * Without those flags, behaves as dry (0 WA) even if constructed.
 */
export function createZapiWireTransport(
  deps: WireTransportZapiDeps,
): WireTransport {
  const envGet = deps.envGet ??
    ((k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined);
  const live = harnessAllowsRealWhatsapp({ get: envGet });
  if (!live) {
    return createDryWireTransport();
  }
  return {
    allowReal: true,
    send: async (env: OutboundEnvelope) => {
      const to = env.leadId.replace(/\D/g, "");
      if (!to) return { ok: false, realSend: false };
      const res = await deps.sendText({
        to,
        text: env.text,
        idempotencyKey: env.idempotencyKey,
        conversationId: env.conversationId,
        sendAs: env.sendAs,
        linkPreview: env.linkPreview,
      });
      if (!res.ok) return { ok: false, realSend: false };
      return { ok: true, realSend: true };
    },
  };
}

/** Factory for edge: dry unless live flags; sendText provided by host. */
export function resolveWireTransport(input: {
  envGet: (k: string) => string | undefined;
  sendText?: WireTransportZapiDeps["sendText"];
  forceDry?: boolean;
}): WireTransport {
  if (input.forceDry === true || !input.sendText) {
    return createDryWireTransport();
  }
  return createZapiWireTransport({
    sendText: input.sendText,
    envGet: input.envGet,
  });
}
