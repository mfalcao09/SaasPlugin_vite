// deno test — prova a classificação de resposta (opt-out / quero / neutral).
//   deno test --no-check supabase/functions/_shared/cold-outreach/opt-out.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { classifyReply, isOptOut, isWantSignal, normalize } from "./opt-out.ts";

Deno.test("opt-out: pega SAIR/PARE e variações, com/sem acento e maiúscula", () => {
  for (const t of ["SAIR", "pare", "PARA de me mandar msg", "não quero mais receber", "me tira daqui", "descadastrar", "sem interesse", "STOP", "quero cancelar"]) {
    assertEquals(isOptOut(t), true, `deveria ser opt-out: ${t}`);
  }
});

Deno.test("want: pega 'quero' e sinais de aceite", () => {
  for (const t of ["quero", "Quero ver!", "pode puxar", "bora", "me mostra", "tenho interesse", "aceito"]) {
    assertEquals(isWantSignal(t), true, `deveria ser want: ${t}`);
  }
});

Deno.test("prioridade: opt-out vence want ('quero sair')", () => {
  assertEquals(classifyReply("quero sair dessa lista").intent, "opt_out");
  assertEquals(classifyReply("me tira, não quero").intent, "opt_out");
});

Deno.test("neutral: texto sem sinal", () => {
  assertEquals(classifyReply("oi tudo bem?").intent, "neutral");
  assertEquals(classifyReply("quem é você?").intent, "neutral");
});

Deno.test("want puro classifica como want", () => {
  assertEquals(classifyReply("quero ver o raio-x").intent, "want");
  assertEquals(classifyReply("pode mandar").intent, "want");
});

Deno.test("normalize: remove acento e pontuação, colapsa espaço", () => {
  assertEquals(normalize("Não   quero!!!"), "nao quero");
  assertEquals(normalize("SAIR."), "sair");
});
