// deno test — prova o seletor de persona BDR (isolado do #68). Garante que o BDR
// não vaza como abridor inbound e que a Duda é o destino do handoff.
//   deno test --no-check supabase/functions/_shared/cold-outreach/persona.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { type AgentLike, isProspectorAgent, isSdrAgent, pickProspectorPersona, pickSdrPersona } from "./persona.ts";

const bdr: AgentLike = { id: "bdr-1", name: "Beto · Prospecção", agent_type: "prospector", is_active: true };
const duda: AgentLike = { id: "sdr-1", name: "Duda — SDR", agent_type: "sdr", is_active: true };
const bia: AgentLike = { id: "clo-1", name: "Bia — Closer", agent_type: "closer", is_active: true };
const nina: AgentLike = { id: "ret-1", name: "Nina — Retenção", agent_type: "retention", is_active: true };

Deno.test("isProspectorAgent: só o BDR (por tipo e por nome)", () => {
  assertEquals(isProspectorAgent(bdr), true);
  assertEquals(isProspectorAgent({ id: "x", name: "BDR outbound", agent_type: "custom" }), true);
  assertEquals(isProspectorAgent(duda), false);
  assertEquals(isProspectorAgent(bia), false);
  assertEquals(isProspectorAgent(nina), false);
});

Deno.test("pickProspectorPersona: acha o BDR; null se não houver (nunca agents[0])", () => {
  assertEquals(pickProspectorPersona([duda, bia, bdr, nina])?.id, "bdr-1");
  assertEquals(pickProspectorPersona([duda, bia, nina]), null);
  // BDR inativo não é escolhido
  assertEquals(pickProspectorPersona([{ ...bdr, is_active: false }]), null);
});

Deno.test("pickSdrPersona: Duda é o destino do handoff; null sem SDR", () => {
  assertEquals(pickSdrPersona([bdr, bia, duda])?.id, "sdr-1");
  assertEquals(pickSdrPersona([bdr, bia, nina]), null); // sem Duda → não abre com quem não devia
});

Deno.test("isolamento: BDR não é reconhecido como SDR", () => {
  assertEquals(isSdrAgent(bdr), false);
});
