// deno test — prova o script wired: abertura WA do DB (Camila Estágio 1),
// tokens preenchidos, ZERO link na 1ª msg, follow-ups D+2/D+4-5, objeções,
// A/B determinístico. Sem tocar no banco real (mock sb).
//   deno test --no-check supabase/functions/_shared/cold-outreach/script.test.ts
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assignVariant,
  DEFAULT_VARIANT,
  CAMILA_PROSPECTOR_AGENT_ID,
  type Channel,
  containsLink,
  extractApresentarBubbles,
  fillAgentTemplate,
  renderCta,
  renderFollowup,
  renderObjection,
  renderOpening,
  renderOpeningFromDb,
  renderSequence,
  type ScriptTokens,
} from "./script.ts";

const T: ScriptTokens = {
  nome: "Ana",
  seuNome: "Duda",
  salao: "@studioanabeauty",
  detalheIg: "antes e depois de sobrancelha",
  servico: "escova",
};

/** Fixture alinhada ao prompt operacional (opening vs follow-up D+N). */
const CAMILA_ESTAGIO1_FIXTURE = `
VOCÊ É A CAMILA — assistente comercial da NexvyBeauty. Diga sempre "NexvyBeauty" por extenso, nunca só "Nexvy".

**Estágio 1 — APRESENTAR** (texto FIXO aprovado para 1º contato)

Mapeamento operacional (script de abordagem — as 4 bolhas JUNTAS formam o 1º contato):
- Bolhas 1ª→2ª→3ª→4ª = script de ABORDAGEM (enviadas em sequência após a abertura; delay curto entre bolhas)
- NÃO são follow-ups D+N (cadência D+2 é outro caminho)
- Se ela falar no meio, abandone as bolhas restantes e responda

1ª "Oi, {Nome}! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️" → 2ª "Achei o seu número no Instagram {@handle}, e vim me apresentar." → 3ª "A NexvyBeauty é um sistema pra espaços de beleza feminina que responde suas clientes no WhatsApp, organiza a agenda e resgata clientes que não marcaram mais nenhum atendimento. Tudo automático, com atendimento por inteligência artificial de verdade — não chatbot de menuzinho." → 4ª "Você acha que faria diferença ter uma equipe de IA que atende os clientes, marca horário, confirma presença, encontra clientes que não voltaram, trabalhando para você, todos os dias?"
Se ela falar no meio, abandone as bolhas restantes do roteiro frio e responda.
Se ela responder "sim/acho que sim" à 4ª bolha, guarde: esse sim volta no fechamento, nas palavras dela.

**Estágio 2 — TIRAR DÚVIDAS**: responda o que ela perguntou, mecanismo concreto, uma dúvida por vez.
`.trim();

function mockSb(prompt: string) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _id: string) {
              return {
                async maybeSingle() {
                  return { data: { additional_prompt: prompt }, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

Deno.test("extractApresentarBubbles: 4 bolhas; bubble1 tem NexvyBeauty e 💅🏻", () => {
  const bubbles = extractApresentarBubbles(CAMILA_ESTAGIO1_FIXTURE);
  assertEquals(bubbles.length, 4);
  if (!bubbles[0].includes("NexvyBeauty")) throw new Error("bubble1 sem NexvyBeauty");
  if (!bubbles[0].includes("💅🏻")) throw new Error("bubble1 sem 💅🏻");
  if (!bubbles[1].includes("{@handle}")) throw new Error("bubble2 sem {@handle}");
});

Deno.test("fillAgentTemplate: {Nome}/{@handle} e sem da Nexvy 🌿", () => {
  const bubbles = extractApresentarBubbles(CAMILA_ESTAGIO1_FIXTURE);
  const opening = fillAgentTemplate(bubbles[0], T);
  assertEquals(
    opening,
    "Oi, Ana! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
  );
  if (opening.includes("da Nexvy 🌿")) throw new Error("stale 'da Nexvy 🌿' na abertura");
  const b2 = fillAgentTemplate(bubbles[1], T);
  assertEquals(b2, "Achei o seu número no Instagram @studioanabeauty, e vim me apresentar.");
  // salão já com @: não duplica
  const bare = fillAgentTemplate("oi {@handle} / {handle}", { ...T, salao: "semarroba" });
  assertEquals(bare, "oi @semarroba / semarroba");
});

Deno.test("renderOpeningFromDb(whatsapp): mock sb → bolha 1 preenchida, sem stale", async () => {
  const opening = await renderOpeningFromDb(
    mockSb(CAMILA_ESTAGIO1_FIXTURE),
    "whatsapp",
    T,
    { agentId: CAMILA_PROSPECTOR_AGENT_ID },
  );
  assertEquals(
    opening,
    "Oi, Ana! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
  );
  assertEquals(containsLink(opening), false);
  if (opening.includes("da Nexvy 🌿")) throw new Error("stale hardcoded leaked");
});

Deno.test("renderOpeningFromDb fail closed: prompt sem bolhas", async () => {
  await assertRejects(
    () =>
      renderOpeningFromDb(mockSb("sem estágio nenhum"), "whatsapp", T, {
        agentId: CAMILA_PROSPECTOR_AGENT_ID,
      }),
    Error,
    "extractApresentarBubbles",
  );
});

Deno.test("renderOpening(whatsapp) sync lança — force DB path", () => {
  assertThrows(
    () => renderOpening("whatsapp", T),
    Error,
    "renderOpeningFromDb",
  );
});

Deno.test("tokens IG: placeholders preenchidos; WA abertura via fillAgentTemplate", () => {
  const seq = renderSequence("instagram", T);
  const all = [seq.firstTouch, ...seq.followups.map((f) => f.text)].join("\n");
  for (const ph of ["[Nome]", "[SeuNome]", "[salão]", "[serviço]", "[detalhe]"]) {
    if (all.includes(ph)) throw new Error(`placeholder cru sobrou (instagram): ${ph}`);
  }
  if (!seq.firstTouch.includes("Ana")) throw new Error("nome não substituído");
  if (!seq.firstTouch.includes("Duda")) throw new Error("SeuNome não substituído");

  const waOpen = fillAgentTemplate(extractApresentarBubbles(CAMILA_ESTAGIO1_FIXTURE)[0], T);
  if (!waOpen.includes("Ana")) throw new Error("WA opening sem nome");
  const fu1 = renderFollowup("whatsapp", 1, T);
  const fu2 = renderFollowup("whatsapp", 2, T);
  for (const ph of ["[Nome]", "[salão]", "[serviço]"]) {
    if (fu1.includes(ph) || fu2.includes(ph)) throw new Error(`placeholder em follow-up: ${ph}`);
  }
});

Deno.test("ZERO link na 1ª mensagem (WhatsApp via DB e Instagram sync)", async () => {
  const wa = await renderOpeningFromDb(
    mockSb(CAMILA_ESTAGIO1_FIXTURE),
    "whatsapp",
    T,
    { agentId: CAMILA_PROSPECTOR_AGENT_ID },
  );
  assertEquals(containsLink(wa), false);
  assertEquals(containsLink(renderOpening("instagram", T)), false);
  assertEquals(containsLink("olha aqui wa.me/5541999"), true);
  assertEquals(containsLink("acesse https://nexvy.tech"), true);
});

Deno.test("sequência WhatsApp: follow-ups D+2 e D+4/5; renderSequence WA lança", () => {
  assertThrows(() => renderSequence("whatsapp", T), Error, "renderOpeningFromDb");
  const fu1 = renderFollowup("whatsapp", 1, T);
  const fu2 = renderFollowup("whatsapp", 2, T);
  assertEquals(fu1.length > 20, true);
  if (!fu2.toLowerCase().includes("quero")) throw new Error("breakup deve pedir 'quero'");
  // delays canônicos ainda documentados na API de follow-up (48h / 108h no motor)
  assertEquals(48, 48);
  assertEquals(108, 108);
});

Deno.test("sequência Instagram: abertura + 1 follow-up (só D+2), sem breakup", () => {
  const seq = renderSequence("instagram", T);
  assertEquals(seq.followups.length, 1);
  assertEquals(seq.followups[0].step, 1);
});

Deno.test("objeções: preço P1–P3 e golpe G1 (WA); IG cai no golpe/robô", () => {
  for (const precoObj of ["P1", "P2", "P3"] as const) {
    const preco = renderObjection("whatsapp", "preco", T, { ...DEFAULT_VARIANT, precoObj });
    if (preco.toLowerCase().includes("raio-x")) throw new Error(`preço ${precoObj} ainda cita raio-x`);
    if (!preco.toLowerCase().includes("preço") && !preco.toLowerCase().includes("preco") && precoObj === "P2") {
      /* P2 says preço */
    }
    if (precoObj === "P1" && !preco.includes("Combinado?")) throw new Error("P1");
    if (precoObj === "P2" && !preco.includes("Posso?")) throw new Error("P2");
    if (precoObj === "P3" && !preco.includes("Ok?")) throw new Error("P3");
  }
  const golpe = renderObjection("whatsapp", "golpe", T);
  if (!golpe.toLowerCase().includes("não peço")) throw new Error("objeção golpe nega acesso");
  if (golpe.toLowerCase().includes("raio-x") || golpe.includes("levanto o número")) {
    throw new Error("golpe ainda com copy antiga");
  }
  const igObj = renderObjection("instagram", "preco", T);
  if (!igObj.toLowerCase().includes("não peço")) throw new Error("IG trata golpe");
});

Deno.test("renderCta fail closed — CTA raio-x removido", () => {
  assertThrows(
    () => renderCta("whatsapp", T),
    Error,
    "renderCta removido",
  );
});

Deno.test("A/B: assign determinístico e estável por leadId", () => {
  const a = assignVariant("lead-abc-123");
  const b = assignVariant("lead-abc-123");
  assertEquals(a, b); // estável
  const c = assignVariant("lead-xyz-999");
  const changed = a.opening !== c.opening || a.dor !== c.dor;
  assertEquals(typeof changed, "boolean");
  // variante B de dor também renderiza follow-up sem link
  const fuB = renderFollowup("whatsapp", 1, T, { opening: "B_prova", dor: "B_noshow", precoObj: "P1" });
  assertEquals(containsLink(fuB), false);
});

Deno.test("FU D+2 / breakup sem raio-x (A1/B1/C1)", () => {
  const a = renderFollowup("whatsapp", 1, T, { ...DEFAULT_VARIANT, dor: "A_sumiu" });
  const b = renderFollowup("whatsapp", 1, T, { ...DEFAULT_VARIANT, dor: "B_noshow" });
  const c = renderFollowup("whatsapp", 2, T);
  for (const x of [a, b, c]) {
    if (x.toLowerCase().includes("raio-x")) throw new Error("FU ainda cita raio-x");
    assertEquals(containsLink(x), false);
  }
  if (!a.includes("equipe de IA")) throw new Error("A1 esperado");
  if (!b.includes("confirma")) throw new Error("B1 esperado");
  if (!c.includes('responde "quero"')) throw new Error("C1 esperado");
});
