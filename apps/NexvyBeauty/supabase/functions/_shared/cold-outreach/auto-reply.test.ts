import { assertEquals } from "jsr:@std/assert@1";
import { classifyInboundKind, isAutoReply } from "./auto-reply.ts";

const JEISSIANE = `Olá, tudo bem? Aqui você encontra serviço de alongamento na técnica Acrílico. Acesse esse link https://wa.me/c/556899576171. Só marco seu horário mediante a taxa de agendamento R$40,00 via Pix. As mensagens são respondidas após o horário de atendimento.`;

const ELLAS = `Seja muito bem-vinda ao ELLAS STUDIO DE BELEZA! Nosso horário de atendimento é de segunda a sexta das 8:30 às 18:00. Responderemos assim que possível.`;

// D2 canary @espaco.leh — falso negativo: "agradece o seu contato" (não só "seu/o contato")
const LETICIA_ESPACO_LEH = `Espaço Lê agradece o seu contato!

Nosso atendimento é de terça a sábado das 9:00 as 19:00

Para agilizar seu atendimento 

Fale o serviço que deseja fazer, dia e horário 😘`;

Deno.test("Jeissiane auto-resposta → auto_reply", () => {
  assertEquals(isAutoReply(JEISSIANE), true);
  assertEquals(classifyInboundKind(JEISSIANE), "auto_reply");
});

Deno.test("Ellas auto-resposta → auto_reply", () => {
  assertEquals(isAutoReply(ELLAS), true);
});

Deno.test("Letícia / Espaço Lê away → auto_reply (não human)", () => {
  assertEquals(isAutoReply(LETICIA_ESPACO_LEH), true);
  assertEquals(classifyInboundKind(LETICIA_ESPACO_LEH), "auto_reply");
});

Deno.test("variantes agradece contato", () => {
  assertEquals(isAutoReply("Obrigado, agradece o seu contato!"), true);
  assertEquals(isAutoReply("Agradecemos — agradece seu contato em breve."), true);
  assertEquals(isAutoReply("Loja X agradece o contato."), true);
});

Deno.test("resposta humana curta → human", () => {
  assertEquals(classifyInboundKind("oi, quem é você?"), "human");
  assertEquals(classifyInboundKind("sim quero ver"), "human");
});

Deno.test("opt-out continua human (classifier separado do planInbound)", () => {
  assertEquals(classifyInboundKind("pare de me mandar"), "human");
});

Deno.test("Renata away + Aliny link-agendamento → auto_reply", () => {
  const renata =
    "Ola , Tudo bem ? Que bom que entrou em contato para cuidar das suas unhas. Em breve retorno sua mensagem para passar informações e agendamento.";
  const aliny =
    "Oiii, tudo bem?! Aqui é Aliny, e caso não te responda em seguida, vou te deixar abaixo o link de agendamento online.";
  assertEquals(classifyInboundKind(renata), "auto_reply");
  assertEquals(classifyInboundKind(aliny), "auto_reply");
});
