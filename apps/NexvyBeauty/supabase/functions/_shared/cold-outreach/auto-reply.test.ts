import { assertEquals } from "jsr:@std/assert@1";
import { classifyInboundKind, isAutoReply } from "./auto-reply.ts";

const JEISSIANE = `Olá, tudo bem? Aqui você encontra serviço de alongamento na técnica Acrílico. Acesse esse link https://wa.me/c/556899576171. Só marco seu horário mediante a taxa de agendamento R$40,00 via Pix. As mensagens são respondidas após o horário de atendimento.`;

const ELLAS = `Seja muito bem-vinda ao ELLAS STUDIO DE BELEZA! Nosso horário de atendimento é de segunda a sexta das 8:30 às 18:00. Responderemos assim que possível.`;

Deno.test("Jeissiane auto-resposta → auto_reply", () => {
  assertEquals(isAutoReply(JEISSIANE), true);
  assertEquals(classifyInboundKind(JEISSIANE), "auto_reply");
});

Deno.test("Ellas auto-resposta → auto_reply", () => {
  assertEquals(isAutoReply(ELLAS), true);
});

Deno.test("resposta humana curta → human", () => {
  assertEquals(classifyInboundKind("oi, quem é você?"), "human");
  assertEquals(classifyInboundKind("sim quero ver"), "human");
});

Deno.test("opt-out continua human (classifier separado do planInbound)", () => {
  assertEquals(classifyInboundKind("pare de me mandar"), "human");
});
