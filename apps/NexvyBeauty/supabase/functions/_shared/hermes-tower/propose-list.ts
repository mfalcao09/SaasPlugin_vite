/**
 * Proposta de lista piloto para a torre Hermes / gestao.
 * Puro: sem I/O. O bridge aplica o filtro no SQL e passa candidatos aqui.
 */

export type ProposeCandidate = {
  id: string;
  handle: string | null;
  primeiro_nome: string | null;
  telefone: string | null;
  segment: string | null;
  qualified: boolean | null;
  seguidores: number | null;
  categoria: string | null;
  cidade?: string | null;
  approved_at: string | null;
  excluded_at: string | null;
};

export type ProposeListInput = {
  candidates: ProposeCandidate[];
  limit?: number;
};

export type ProposeListItem = {
  lead_id: string;
  handle: string | null;
  primeiro_nome: string | null;
  telefone: string | null;
  score: number;
  reasons: string[];
};

export type ProposeListResult = {
  limit: number;
  selected: ProposeListItem[];
  rejected_count: number;
  notes: string[];
};

function scoreLead(c: ProposeCandidate): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (c.qualified) {
    score += 40;
    reasons.push("qualified");
  }
  if (c.telefone && c.telefone.replace(/\D/g, "").length >= 12) {
    score += 30;
    reasons.push("phone_br_ok");
  }
  if (c.segment === "salao_cliente") {
    score += 20;
    reasons.push("segment_salao");
  }
  const seg = c.seguidores ?? 0;
  if (seg >= 500 && seg <= 50000) {
    score += 10;
    reasons.push("followers_band");
  }
  return { score, reasons };
}

/** Elegível para proposta (ainda pode estar sem approved_at — UI aprova depois). */
export function isEligibleForProposal(c: ProposeCandidate): boolean {
  if (c.excluded_at) return false;
  if (!c.telefone || !String(c.telefone).trim()) return false;
  const digits = c.telefone.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 13) return false;
  if (!digits.startsWith("55")) return false;
  if (c.segment && c.segment !== "salao_cliente" && c.segment !== "acionamento_via_instagram") {
    return false;
  }
  return true;
}

export function proposePilotList(input: ProposeListInput): ProposeListResult {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 10);
  const notes: string[] = [];
  let rejected = 0;
  const scored: ProposeListItem[] = [];

  for (const c of input.candidates) {
    if (!isEligibleForProposal(c)) {
      rejected += 1;
      continue;
    }
    const { score, reasons } = scoreLead(c);
    scored.push({
      lead_id: c.id,
      handle: c.handle,
      primeiro_nome: c.primeiro_nome,
      telefone: c.telefone,
      score,
      reasons,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.lead_id.localeCompare(b.lead_id));
  const selected = scored.slice(0, limit);
  if (scored.length > limit) {
    notes.push(`cortados_por_cap:${scored.length - limit}`);
  }
  notes.push(`piloto_cap:${limit}`);
  notes.push("aprovacao_humana_obrigatoria_na_gestao");

  return { limit, selected, rejected_count: rejected, notes };
}
