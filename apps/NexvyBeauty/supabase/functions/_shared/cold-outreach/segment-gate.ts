// _shared/cold-outreach/segment-gate.ts
//
// Núcleo PURO do segment-gate + ordem de disparo do cold outreach WhatsApp.
// Dispara SÓ nos `salao_cliente` qualificados com telefone BR (o universo de
// 1.497). Bloqueia afiliado/revisao/descarte/só-instagram. Ordem de calibração:
// 26 semente-limpa (is_seed ∩ qualified) → 66 is_seed → massa
// (COLD-OUTREACH-SCRIPT §1/§4; blueprint LDR-BDR §2.3, Explorador 5).
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/segment-gate.test.ts
//
// A verdade do banco (predicado SQL espelhado) vive no motor; aqui é a lógica
// pura pra decidir por-lead e ORDENAR — testável sem tocar o banco.

/** Segmentos do classificador (`_shared/lead-geo.ts`) + o 5º a jusante (IG). */
export type LeadSegment =
  | "salao_cliente"
  | "afiliado_infoproduto"
  | "revisao"
  | "descarte"
  | "acionamento_via_instagram";

/** Único segmento alvo de cold WhatsApp. */
export const WHATSAPP_TARGET_SEGMENT: LeadSegment = "salao_cliente";

/** Segmentos NUNCA tocados no canal WhatsApp (bloqueio duro). */
export const WHATSAPP_BLOCKED_SEGMENTS: LeadSegment[] = [
  "afiliado_infoproduto", // vendem curso, não são salões
  "revisao", // só após revisão humana
  "descarte", // nunca
  "acionamento_via_instagram", // canal próprio (IG DM), outra matemática
];

/** Campos mínimos de um lead extraído que o gate precisa (subconjunto de `platform_crm_extracted_leads`). */
export interface GateLead {
  segment: LeadSegment | string | null;
  qualified: boolean | null;
  telefone: string | null;
  phone_is_br?: boolean | null;
  is_seed?: boolean | null;
  excluded_at?: string | null;
  seguidores?: number | null;
  handle?: string | null;
  /**
   * Portão de aprovação PER-LEAD (Prospecção): `NULL` = em tratamento (não
   * aprovado); preenchido = aprovado. SÓ leads aprovados podem disparar —
   * espelha `platform_crm_consolidated_leads` (que filtra `approved_at IS NOT NULL`).
   */
  approved_at?: string | null;
}

export interface GateVerdict {
  ok: boolean;
  reason: string | null;
}

/** Telefone presente e não-vazio (dígitos E.164 sem `+`). */
export function hasPhone(tel: string | null | undefined): boolean {
  return !!tel && tel.replace(/\D/g, "").length >= 10;
}

/**
 * Passa no gate de cold WhatsApp? Espelha o predicado SQL do Explorador 5 +
 * portão de aprovação per-lead:
 * approved_at IS NOT NULL AND segment='salao_cliente' AND qualified AND
 * telefone<>'' AND excluded_at IS NULL.
 * (optout/excluded são checados no banco via NOT EXISTS — não dá pra provar aqui.)
 */
export function passesWhatsappGate(lead: GateLead): GateVerdict {
  if (lead.excluded_at) return { ok: false, reason: "excluded (lixeira)" };
  if (!lead.approved_at) return { ok: false, reason: "não aprovado (approved_at IS NULL)" };
  if (lead.segment !== WHATSAPP_TARGET_SEGMENT) {
    return { ok: false, reason: `segment=${lead.segment ?? "null"} (não é salao_cliente)` };
  }
  if (lead.qualified !== true) return { ok: false, reason: "qualified=false" };
  if (!hasPhone(lead.telefone)) return { ok: false, reason: "sem telefone" };
  // phone_is_br é sinal de qualidade; quando presente e false, bloqueia.
  if (lead.phone_is_br === false) return { ok: false, reason: "phone_is_br=false" };
  return { ok: true, reason: null };
}

// ── Ordem de disparo: 26 semente-limpa → 66 is_seed → massa ──────────────────
export type DispatchTier = "semente_limpa" | "is_seed" | "massa";

export const TIER_ORDER: Record<DispatchTier, number> = {
  semente_limpa: 0,
  is_seed: 1,
  massa: 2,
};

/**
 * Classifica o lead na onda de disparo. "semente-limpa" = is_seed ∩ passa-no-gate
 * (os 26 que já vendem); "is_seed" = seed que ainda não passa (hub em revisão/sem
 * telefone) — no canal WA só entra se passar, então na prática vira 26→massa, mas
 * o tier fica explícito p/ métrica e p/ o caso IG (onde is_seed sem telefone conta).
 */
export function dispatchTier(lead: GateLead): DispatchTier {
  const seed = lead.is_seed === true;
  const passes = passesWhatsappGate(lead).ok;
  if (seed && passes) return "semente_limpa";
  if (seed) return "is_seed";
  return "massa";
}

/**
 * Comparador de ORDENAÇÃO da fila: tier primeiro (semente-limpa antes de massa),
 * depois seguidores desc (hub primeiro) — espelha `ORDER BY is_seed DESC,
 * seguidores DESC` do Explorador 5. Retorna <0 se `a` deve disparar antes de `b`.
 */
export function compareDispatchOrder(a: GateLead, b: GateLead): number {
  const ta = TIER_ORDER[dispatchTier(a)];
  const tb = TIER_ORDER[dispatchTier(b)];
  if (ta !== tb) return ta - tb;
  const sa = a.seguidores ?? 0;
  const sb = b.seguidores ?? 0;
  return sb - sa;
}

/** Filtra + ordena uma lista de leads na ordem canônica de disparo (só os que passam). */
export function selectAndOrderForDispatch<T extends GateLead>(leads: T[]): T[] {
  return leads
    .filter((l) => passesWhatsappGate(l).ok)
    .sort(compareDispatchOrder);
}

// ── Frente Instagram (segmento próprio, sem telefone) ────────────────────────
export const IG_TARGET_SEGMENT: LeadSegment = "acionamento_via_instagram";

/** Passa no gate de IG DM? (aprovado, segmento IG, tem handle; NÃO exige telefone). */
export function passesInstagramGate(lead: GateLead): GateVerdict {
  if (lead.excluded_at) return { ok: false, reason: "excluded (lixeira)" };
  if (!lead.approved_at) return { ok: false, reason: "não aprovado (approved_at IS NULL)" };
  if (lead.segment !== IG_TARGET_SEGMENT) {
    return { ok: false, reason: `segment=${lead.segment ?? "null"} (não é acionamento_via_instagram)` };
  }
  if (!lead.handle) return { ok: false, reason: "sem handle" };
  return { ok: true, reason: null };
}
