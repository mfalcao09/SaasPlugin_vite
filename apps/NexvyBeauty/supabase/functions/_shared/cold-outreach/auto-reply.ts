// _shared/cold-outreach/auto-reply.ts
// Classifica auto-resposta comercial (WhatsApp Business away) vs resposta humana.
//   deno test --allow-env supabase/functions/_shared/cold-outreach/auto-reply.test.ts

import { normalize } from "./opt-out.ts";

export type InboundKind = "auto_reply" | "human";

const AUTO_REPLY_PATTERNS: RegExp[] = [
  /\bagradece\s+(seu|o)\s+contato\b/,
  /\bfora\s+do\s+horario\s+de\s+atendimento\b/,
  /\bhorario\s+de\s+atendimento\b/,
  /\batendemos\s+de\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)/,
  /\bno\s+momento\s+estamos\s+(fora|offline|indispon)/,
  /\bresponderemos\s+(assim\s+que|em\s+breve|logo)/,
  /\bdeixe\s+sua\s+mensagem\b/,
  /\bmenuzinho\b.*\bwhatsapp\b/,
  /\bwa\.me\/c\//,
  /\btaxa\s+de\s+agendamento\b/,
  /\bpix\b.*\b(agendamento|horario)\b/,
  /\bnao\s+perturbe\b.*\bhorario\b/,
  /\bautomatica?\s+(mensagem|resposta)\b/,
  /\bauto\s*reply\b/,
  /\bfora\s+do\s+expediente\b/,
];

/** Auto-resposta típica de WhatsApp Business: longa, horário, catálogo, Pix. */
export function isAutoReply(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  if (AUTO_REPLY_PATTERNS.some((re) => re.test(n))) return true;
  // Heurística: mensagens muito longas com múltiplos sinais comerciais.
  if (n.length >= 180) {
    let score = 0;
    if (/\bhorario\b/.test(n)) score++;
    if (/\b(atendimento|agendamento|catalogo|pix|link)\b/.test(n)) score++;
    if (/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(n)) score++;
    if (score >= 2) return true;
  }
  return false;
}

export function classifyInboundKind(text: string): InboundKind {
  return isAutoReply(text) ? "auto_reply" : "human";
}
