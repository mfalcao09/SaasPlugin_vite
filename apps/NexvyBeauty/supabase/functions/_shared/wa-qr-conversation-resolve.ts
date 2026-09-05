/**
 * Escolha da conversa canônica no WhatsApp QR — evita thread duplicata
 * (telefone sem 9º dígito) e segue metadata.merged_into.
 *
 * Medido 2026-09-03 Jeissiane: interesse caiu em +556899576171 (sem 9) enquanto
 * a canônica era +5568999576171; webhook reabria a closed-merge e o brain calava.
 */

import { normalizePhoneBR, phoneVariantsBR } from "./phone.ts";
import {
  WA_QR_VISITOR_PREFIX_CANONICAL,
  WA_QR_VISITOR_PREFIX_LEGACY,
} from "./platform-wa-qr-identity.ts";

export type WaQrConversationRow = {
  id: string;
  status?: string | null;
  visitor_phone?: string | null;
  current_agent_id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** visitor_id lookup: todos prefixos × todas variantes BR do telefone. */
export function waQrVisitorIdsForPhoneVariants(input: unknown): string[] {
  const variants = phoneVariantsBR(input);
  const out = new Set<string>();
  for (const d of variants) {
    if (!d) continue;
    out.add(`${WA_QR_VISITOR_PREFIX_CANONICAL}${d}`);
    out.add(`${WA_QR_VISITOR_PREFIX_LEGACY}${d}`);
  }
  return Array.from(out);
}

/** Telefone canônico com "+" para INSERT (55+DDD+9+8). Fallback: +digits crus. */
export function waQrCanonicalVisitorPhone(input: unknown): string {
  const canon = normalizePhoneBR(input);
  if (canon) return `+${canon}`;
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function phoneDigitLen(phone: string | null | undefined): number {
  return String(phone ?? "").replace(/\D/g, "").length;
}

function mergedIntoId(row: WaQrConversationRow): string | null {
  const m = row.metadata;
  if (!m || typeof m !== "object") return null;
  const id = (m as Record<string, unknown>).merged_into;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Escolhe a conversa viva entre candidatas.
 * 1) Se a escolhida (ou qualquer) tem merged_into e o alvo está na lista → alvo
 * 2) Prefere status !== closed
 * 3) Prefere telefone mais longo (13 dígitos = com 9º)
 * 4) Prefere quem já tem current_agent_id
 * 5) Prefere created_at mais antigo (canônica do cold)
 */
export function pickCanonicalWaQrConversation(
  candidates: WaQrConversationRow[],
): WaQrConversationRow | null {
  if (!candidates.length) return null;

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const score = (c: WaQrConversationRow): number => {
    let s = 0;
    if (c.status !== "closed") s += 1000;
    s += phoneDigitLen(c.visitor_phone) * 10;
    if (c.current_agent_id) s += 50;
    // Mais antigo vence empate (cold canônico)
    const t = c.created_at ? Date.parse(c.created_at) : 0;
    s += t > 0 ? Math.max(0, 2_000_000_000_000 - t) / 1e12 : 0;
    return s;
  };

  let best = [...candidates].sort((a, b) => score(b) - score(a))[0]!;

  // Segue merge (até 3 hops se o alvo estiver no batch)
  for (let i = 0; i < 3; i++) {
    const target = mergedIntoId(best);
    if (!target) break;
    const next = byId.get(target);
    if (!next || next.id === best.id) break;
    best = next;
  }

  return best;
}

/** Se a row é perdedora de merge, devolve o UUID alvo (mesmo fora do batch). */
export function mergedIntoTargetId(row: WaQrConversationRow): string | null {
  return mergedIntoId(row);
}
