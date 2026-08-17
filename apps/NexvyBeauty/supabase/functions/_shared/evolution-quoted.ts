/**
 * Quote/reply de uma mensagem específica no sendText da Evolution.
 *
 *   deno test --no-check supabase/functions/_shared/evolution-quoted.test.ts
 */

export interface EvolutionQuoted {
  key: { id: string; fromMe: boolean; remoteJid?: string };
  message: { conversation: string };
}

export function quotedFromInbound(opts: {
  evolutionMessageId?: string | null;
  wamid?: string | null;
  content?: string | null;
  fromMe?: boolean;
  remoteJid?: string | null;
}): EvolutionQuoted | null {
  const id = String(opts.evolutionMessageId || opts.wamid || '').trim();
  if (!id) return null;
  const remoteJid = typeof opts.remoteJid === 'string' && opts.remoteJid.trim()
    ? opts.remoteJid.trim()
    : undefined;
  return {
    key: { id, fromMe: opts.fromMe === true, ...(remoteJid ? { remoteJid } : {}) },
    message: { conversation: String(opts.content ?? '').slice(0, 500) },
  };
}

export function remoteJidForQuote(opts: {
  waLid?: string | null;
  phoneDigits?: string | null;
}): string | null {
  const lid = String(opts.waLid ?? '').replace(/@lid$/i, '').trim();
  if (lid) return `${lid}@lid`;
  const pn = String(opts.phoneDigits ?? '').replace(/\D/g, '');
  if (pn) return `${pn}@s.whatsapp.net`;
  return null;
}

export type QuoteInboundMsg = {
  direction?: string;
  sender_type?: string;
  [key: string]: unknown;
};

/** Última inbound da visitante em histórico newest-first (mesmo critério de lastInboundOf). */
export function inboundForQuote<T extends QuoteInboundMsg>(historyDesc: T[]): T | null {
  return historyDesc.find((m) => m.direction === 'inbound' && m.sender_type === 'visitor') ?? null;
}
