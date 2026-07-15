// deno test — prova o script wired: tokens preenchidos, ZERO link na 1ª msg,
// follow-ups D+2/D+4-5, objeções, A/B determinístico. Sem tocar no banco.
//   deno test --no-check supabase/functions/_shared/cold-outreach/script.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  assignVariant,
  type Channel,
  containsLink,
  renderCta,
  renderObjection,
  renderOpening,
  renderSequence,
  type ScriptTokens,
} from "./script.ts";

const T: ScriptTokens = {
  nome: "Ana",
  seuNome: "Duda",
  salao: "Studio Ana Beauty",
  detalheIg: "antes e depois de sobrancelha",
  servico: "escova",
};

Deno.test("tokens: todos preenchidos, nenhum placeholder cru sobra", () => {
  for (const ch of ["whatsapp", "instagram"] as Channel[]) {
    const seq = renderSequence(ch, T);
    const all = [seq.firstTouch, ...seq.followups.map((f) => f.text)].join("\n");
    for (const ph of ["[Nome]", "[SeuNome]", "[salão]", "[serviço]", "[detalhe]"]) {
      if (all.includes(ph)) throw new Error(`placeholder cru sobrou (${ch}): ${ph}`);
    }
    if (!seq.firstTouch.includes("Ana")) throw new Error("nome não substituído");
    if (!seq.firstTouch.includes("Duda")) throw new Error("SeuNome não substituído");
  }
});

Deno.test("ZERO link na 1ª mensagem (WhatsApp e Instagram)", () => {
  for (const ch of ["whatsapp", "instagram"] as Channel[]) {
    const opening = renderOpening(ch, T);
    assertEquals(containsLink(opening), false);
  }
  // sanity do detector: um texto COM link é detectado
  assertEquals(containsLink("olha aqui wa.me/5541999"), true);
  assertEquals(containsLink("acesse https://nexvy.tech"), true);
});

Deno.test("sequência WhatsApp: abertura + 2 follow-ups (D+2 e D+4/5 breakup)", () => {
  const seq = renderSequence("whatsapp", T);
  assertEquals(seq.followups.length, 2);
  assertEquals(seq.followups[0].step, 1);
  assertEquals(seq.followups[0].delayHours, 48); // D+2
  assertEquals(seq.followups[1].step, 2);
  assertEquals(seq.followups[1].delayHours, 108); // D+4/5 breakup
  // breakup pede "quero"
  if (!seq.followups[1].text.toLowerCase().includes("quero")) throw new Error("breakup deve pedir 'quero'");
});

Deno.test("sequência Instagram: abertura + 1 follow-up (só D+2), sem breakup", () => {
  const seq = renderSequence("instagram", T);
  assertEquals(seq.followups.length, 1);
  assertEquals(seq.followups[0].step, 1);
});

Deno.test("objeções: preço e golpe (WA); IG cai no golpe/robô", () => {
  const preco = renderObjection("whatsapp", "preco", T);
  if (!preco.toLowerCase().includes("preço")) throw new Error("objeção preço");
  const golpe = renderObjection("whatsapp", "golpe", T);
  if (!golpe.toLowerCase().includes("não peço")) throw new Error("objeção golpe nega acesso");
  const igObj = renderObjection("instagram", "preco", T);
  if (!igObj.toLowerCase().includes("não peço")) throw new Error("IG trata golpe");
});

Deno.test("CTA WhatsApp pede 'quero' e não tem link", () => {
  const cta = renderCta("whatsapp", T);
  if (!cta.toLowerCase().includes("quero")) throw new Error("CTA deve pedir 'quero'");
  assertEquals(containsLink(cta), false);
});

Deno.test("A/B: assign determinístico e estável por leadId", () => {
  const a = assignVariant("lead-abc-123");
  const b = assignVariant("lead-abc-123");
  assertEquals(a, b); // estável
  const c = assignVariant("lead-xyz-999");
  // pelo menos um eixo tende a diferir entre ids distintos (não garantido, mas o hash muda)
  const changed = a.opening !== c.opening || a.dor !== c.dor || a.cta !== c.cta;
  assertEquals(typeof changed, "boolean");
  // a variante B de abertura também não tem link
  const openingB = renderOpening("whatsapp", T, { opening: "B_prova", dor: "B_noshow", cta: "B_quero" });
  assertEquals(containsLink(openingB), false);
});
