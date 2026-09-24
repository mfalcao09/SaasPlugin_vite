// Triagem canônica do CRM. `segment` é apenas a projeção legada usada pela UI
// antiga; regras de negócio novas devem operar neste vocabulário.

export const CANONICAL_TRIAGE = [
  "principal",
  "semente",
  "nao_classificado",
  "remocao_confirmada",
] as const;

export type CanonicalTriage = (typeof CANONICAL_TRIAGE)[number];

export function isCanonicalTriage(value: unknown): value is CanonicalTriage {
  return typeof value === "string" &&
    (CANONICAL_TRIAGE as readonly string[]).includes(value);
}

export function triageFromLegacySegment(value: unknown): CanonicalTriage {
  switch (value) {
    case "salao_cliente": return "principal";
    case "afiliado_infoproduto": return "semente";
    case "descarte": return "remocao_confirmada";
    case "revisao": return "nao_classificado";
    default: return "nao_classificado";
  }
}

/** Projeção para consumidores legados. Não é a fonte canônica. */
export function legacySegmentFromTriage(value: CanonicalTriage): string {
  switch (value) {
    case "principal": return "salao_cliente";
    case "semente": return "afiliado_infoproduto";
    case "nao_classificado": return "revisao";
    case "remocao_confirmada": return "revisao";
  }
}

export function isPromotableTriage(value: unknown): boolean {
  return value === "principal" || value === "semente";
}
