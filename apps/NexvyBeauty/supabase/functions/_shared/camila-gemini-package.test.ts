import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CAMILA_BRAIN_PROMPT, assembleCamilaSystemPrompt } from "./camila-brain-prompt.ts";
import {
  buildGeminiGenerateBody,
  extractGeminiText,
  GEMINI_FLASH_MODEL,
} from "./gemini-generate.ts";

Deno.test("prompt da Camila não oferece raio-x e recomenda o segundo plano", () => {
  const text = CAMILA_BRAIN_PROMPT.toLowerCase();
  assertEquals(text.includes("raio-x"), false);
  assertEquals(text.includes("raio x"), false);
  assertEquals(text.includes("qr code"), false);
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "segundo plano da seção");
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "Se essa seção não vier, não invente preço nem URL");
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "Oi, {nome}!");
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "No máximo 4 mensagens");
  assertEquals(CAMILA_BRAIN_PROMPT.includes("P2:"), false);
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "Uma pergunta antiga no histórico não muda o assunto");
  assertStringIncludes(CAMILA_BRAIN_PROMPT, "Vou te explicar");
});

Deno.test("pacote da Camila não herda base com raio-x", () => {
  const packed = assembleCamilaSystemPrompt({
    now: "Hoje é terça.",
    checkout: "LINKS DE PAGAMENTO\nPremium: até 3 agentes de IA",
    ficha: "Nome: Ana",
    fatos: "",
    journey: "",
    reactivation: "",
  });
  assertEquals(/raio-x/i.test(packed), false);
  assertStringIncludes(packed, "LINKS DE PAGAMENTO");
  assertStringIncludes(packed, "Nome: Ana");
  const priced = assembleCamilaSystemPrompt({
    now: "Hoje é terça.",
    checkout: "LINKS DE PAGAMENTO\nPremium hoje sai por R$ 427",
    ficha: "",
    fatos: "",
    journey: "",
    reactivation: "",
    ticketSpeech: "Valorv",
    unanswered: ["Quanto ?", "Instala um app?"],
  });
  assertStringIncludes(priced, "═══ FALA DESTE BILHETE ═══");
  assertStringIncludes(priced, "Valorv");
  assertStringIncludes(priced, "═══ PREÇO NESTE TURNO ═══");
  assertStringIncludes(priced, "Quanto ?");
  const how = assembleCamilaSystemPrompt({
    now: "Hoje é terça.",
    checkout: "",
    ficha: "",
    fatos: "",
    journey: "",
    reactivation: "",
    ticketSpeech: "Como funciona?",
  });
  assertEquals(how.includes("═══ PREÇO NESTE TURNO ═══"), false);
  assertStringIncludes(how, "Como funciona?");
});

Deno.test("corpo Gemini usa 3.6 flash e pensamento mínimo", () => {
  const body = buildGeminiGenerateBody({
    system: CAMILA_BRAIN_PROMPT,
    messages: [
      { role: "assistant", content: "Oi, Ana!" },
      { role: "user", content: "Como funciona?" },
    ],
    maxOutputTokens: 512,
  });
  const config = body.generationConfig as {
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: string };
  };
  assertEquals(config.maxOutputTokens, 512);
  assertEquals(config.thinkingConfig.thinkingLevel, "MINIMAL");
  assertEquals(GEMINI_FLASH_MODEL, "gemini-3.6-flash");
  const contents = body.contents as Array<{ role: string }>;
  assertEquals(contents[0].role, "user");
});

Deno.test("texto Gemini ignora pensamento", () => {
  assertEquals(
    extractGeminiText({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "raciocínio interno" },
            { text: "Funciona no WhatsApp que você já usa." },
          ],
        },
      }],
    }),
    "Funciona no WhatsApp que você já usa.",
  );
});
