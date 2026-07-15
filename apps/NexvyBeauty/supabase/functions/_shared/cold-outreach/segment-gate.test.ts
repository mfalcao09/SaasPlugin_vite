// deno test — prova o segment-gate + ordem de disparo com DADOS SEMEADOS.
//   deno test --no-check supabase/functions/_shared/cold-outreach/segment-gate.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  compareDispatchOrder,
  dispatchTier,
  type GateLead,
  passesInstagramGate,
  passesWhatsappGate,
  selectAndOrderForDispatch,
} from "./segment-gate.ts";

const cliente = (o: Partial<GateLead> = {}): GateLead => ({
  segment: "salao_cliente",
  qualified: true,
  telefone: "5541985036800",
  phone_is_br: true,
  is_seed: false,
  excluded_at: null,
  seguidores: 1000,
  handle: "salao_x",
  ...o,
});

Deno.test("gate WhatsApp: salao_cliente qualificado com telefone PASSA", () => {
  assertEquals(passesWhatsappGate(cliente()).ok, true);
});

Deno.test("gate WhatsApp: BLOQUEIA afiliado, revisao, descarte, só-IG", () => {
  assertEquals(passesWhatsappGate(cliente({ segment: "afiliado_infoproduto" })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ segment: "revisao" })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ segment: "descarte" })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ segment: "acionamento_via_instagram" })).ok, false);
});

Deno.test("gate WhatsApp: bloqueia sem telefone, não-qualified, excluído, phone_is_br=false", () => {
  assertEquals(passesWhatsappGate(cliente({ telefone: null })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ telefone: "" })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ qualified: false })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ excluded_at: "2026-07-10T00:00:00Z" })).ok, false);
  assertEquals(passesWhatsappGate(cliente({ phone_is_br: false })).ok, false);
});

Deno.test("tier: semente-limpa = is_seed ∩ passa-gate; massa = resto", () => {
  assertEquals(dispatchTier(cliente({ is_seed: true })), "semente_limpa");
  assertEquals(dispatchTier(cliente({ is_seed: false })), "massa");
  // seed que não passa (sem telefone) → is_seed tier
  assertEquals(dispatchTier(cliente({ is_seed: true, telefone: null })), "is_seed");
});

Deno.test("ordem: semente-limpa antes de massa; dentro do tier, seguidores desc", () => {
  const seedHub = cliente({ is_seed: true, seguidores: 90_000, handle: "hub" });
  const massaBig = cliente({ is_seed: false, seguidores: 5000, handle: "m1" });
  const massaSmall = cliente({ is_seed: false, seguidores: 100, handle: "m2" });
  const ordered = selectAndOrderForDispatch([massaSmall, massaBig, seedHub]);
  assertEquals(ordered.map((l) => l.handle), ["hub", "m1", "m2"]);
  // comparador direto
  if (compareDispatchOrder(seedHub, massaBig) >= 0) throw new Error("seed deve vir antes");
});

Deno.test("selectAndOrder: descarta quem não passa no gate", () => {
  const ok = cliente({ handle: "ok" });
  const no = cliente({ segment: "descarte", handle: "no" });
  const out = selectAndOrderForDispatch([ok, no]);
  assertEquals(out.map((l) => l.handle), ["ok"]);
});

Deno.test("gate Instagram: só acionamento_via_instagram com handle (sem exigir telefone)", () => {
  const ig: GateLead = {
    segment: "acionamento_via_instagram",
    qualified: false,
    telefone: null,
    handle: "insta_salao",
    excluded_at: null,
  };
  assertEquals(passesInstagramGate(ig).ok, true);
  assertEquals(passesInstagramGate({ ...ig, handle: null }).ok, false);
  assertEquals(passesInstagramGate({ ...ig, segment: "salao_cliente" }).ok, false);
});
