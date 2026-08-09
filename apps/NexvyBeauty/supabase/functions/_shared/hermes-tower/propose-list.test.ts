import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isEligibleForProposal, proposePilotList, type ProposeCandidate } from "./propose-list.ts";

function lead(partial: Partial<ProposeCandidate> & { id: string }): ProposeCandidate {
  return {
    handle: "salao_x",
    primeiro_nome: "Ana",
    telefone: "5511999999999",
    segment: "salao_cliente",
    qualified: true,
    seguidores: 2000,
    categoria: "cabelo",
    approved_at: null,
    excluded_at: null,
    ...partial,
  };
}

Deno.test("isEligibleForProposal rejects excluded and bad phone", () => {
  assertEquals(isEligibleForProposal(lead({ id: "1", excluded_at: "2026-01-01" })), false);
  assertEquals(isEligibleForProposal(lead({ id: "2", telefone: "119999" })), false);
  assertEquals(isEligibleForProposal(lead({ id: "3" })), true);
});

Deno.test("proposePilotList caps at 10 and sorts by score", () => {
  const candidates = Array.from({ length: 12 }, (_, i) =>
    lead({
      id: `id-${i}`,
      qualified: i < 5,
      seguidores: 1000 + i,
      telefone: `55119888888${String(i).padStart(2, "0")}`,
    }),
  );
  const out = proposePilotList({ candidates, limit: 10 });
  assertEquals(out.selected.length, 10);
  assertEquals(out.limit, 10);
  assertEquals(out.notes.includes("aprovacao_humana_obrigatoria_na_gestao"), true);
  for (let i = 1; i < out.selected.length; i++) {
    assertEquals(out.selected[i - 1].score >= out.selected[i].score, true);
  }
});
