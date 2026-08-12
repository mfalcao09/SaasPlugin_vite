// deno test --no-check supabase/functions/_shared/evolution-baileys-jid.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  allowsDeviceOutboundCreateConversation,
  formatLidSendNumber,
  lidDigitsFromWaLid,
  lidLookupNeeded,
  phoneDigitsFromJid,
  pickLidFromWhatsappNumbersRecords,
  pickLidJidFromEvolutionMessageRecords,
  requiresLidSend,
  resolveBaileysMessageJids,
  resolveEvolutionSendNumber,
} from "./evolution-baileys-jid.ts";

Deno.test("fromMe + @lid + remoteJidAlt → telefone resolvido (shape Camila)", () => {
  const r = resolveBaileysMessageJids({
    key: {
      fromMe: true,
      id: "2A2005256F6545267B8C",
      remoteJid: "62213373075703@lid",
      remoteJidAlt: "5511945760964@s.whatsapp.net",
    },
  });
  assertEquals(r.fromMe, true);
  assertEquals(r.remoteJid, "5511945760964@s.whatsapp.net");
  assertEquals(r.lidJid, "62213373075703@lid");
  assertEquals(phoneDigitsFromJid(r.remoteJid), "5511945760964");
});

Deno.test("sem Alt + @lid → digits vazios (no_phone)", () => {
  const r = resolveBaileysMessageJids({
    key: { fromMe: true, id: "x", remoteJid: "62213373075703@lid" },
  });
  assertEquals(phoneDigitsFromJid(r.remoteJid), "");
});

Deno.test("inbound + remoteJidAlt resolve telefone", () => {
  const r = resolveBaileysMessageJids({
    key: {
      fromMe: false,
      id: "in1",
      remoteJid: "999@lid",
      remoteJidAlt: "5511988776655@s.whatsapp.net",
    },
  });
  assertEquals(phoneDigitsFromJid(r.remoteJid), "5511988776655");
});

Deno.test("gate Camila: nome ou flag metadata", () => {
  assertEquals(allowsDeviceOutboundCreateConversation({ name: "camila-prospecativa-v5" }), true);
  assertEquals(allowsDeviceOutboundCreateConversation({ name: "fic-rematricula" }), false);
  assertEquals(
    allowsDeviceOutboundCreateConversation({
      name: "outro",
      metadata: { create_conversation_on_device_outbound: true },
    }),
    true,
  );
});

Deno.test("lidDigits / formatLidSendNumber", () => {
  assertEquals(lidDigitsFromWaLid("62213373075703@lid"), "62213373075703");
  assertEquals(lidDigitsFromWaLid("62213373075703"), "62213373075703");
  assertEquals(formatLidSendNumber("62213373075703"), "62213373075703@lid");
  assertEquals(lidDigitsFromWaLid("5511"), "");
});

Deno.test("send prefer @lid when wa_lid known + keep PN fallback digits", () => {
  const r = resolveEvolutionSendNumber({
    to: "+5511945760964",
    waLid: "62213373075703@lid",
  });
  assertEquals(r.usedLid, true);
  assertEquals(r.number, "62213373075703@lid");
  assertEquals(r.phoneDigits, "5511945760964");
});

Deno.test("cold first-touch: só PN → digits, sem @lid", () => {
  const r = resolveEvolutionSendNumber({ to: "5511988776655", waLid: null });
  assertEquals(r.usedLid, false);
  assertEquals(r.number, "5511988776655");
  assertEquals(r.phoneDigits, "5511988776655");
});

Deno.test("to já é @lid → number preserva sufixo", () => {
  const r = resolveEvolutionSendNumber({ to: "62213373075703@lid" });
  assertEquals(r.usedLid, true);
  assertEquals(r.number, "62213373075703@lid");
});

Deno.test("lidLookupNeeded: addressingMode=lid", () => {
  assertEquals(lidLookupNeeded({
    addressingMode: "lid",
    key: {
      fromMe: false,
      id: "3A0CF0F054CEED5D043F",
      remoteJid: "5511945760964@s.whatsapp.net",
      remoteJidAlt: "5511945760964@s.whatsapp.net",
    },
  }), true);
});

Deno.test("lidLookupNeeded: both JIDs PN without addressingMode", () => {
  assertEquals(lidLookupNeeded({
    key: {
      remoteJid: "5511945760964@s.whatsapp.net",
      remoteJidAlt: "5511945760964@s.whatsapp.net",
    },
  }), true);
});

Deno.test("lidLookupNeeded: store shape já tem @lid → false", () => {
  assertEquals(lidLookupNeeded({
    key: {
      remoteJid: "62213373075703@lid",
      remoteJidAlt: "5511945760964@s.whatsapp.net",
    },
  }), false);
});

Deno.test("pickLidJidFromEvolutionMessageRecords: remoteJid @lid", () => {
  const lid = pickLidJidFromEvolutionMessageRecords([
    {
      key: {
        fromMe: false,
        id: "3A0CF0F054CEED5D043F",
        remoteJid: "62213373075703@lid",
        remoteJidAlt: "5511945760964@s.whatsapp.net",
      },
    },
  ]);
  assertEquals(lid, "62213373075703@lid");
});

Deno.test("requiresLidSend: camila name ou flag", () => {
  assertEquals(requiresLidSend({ name: "camila-prospec-ativa-v5" }), true);
  assertEquals(requiresLidSend({ name: "fic-rematricula" }), false);
  assertEquals(
    requiresLidSend({ name: "outro", metadata: { require_lid_send: true } }),
    true,
  );
});

// ===== cold first-touch PN→LID (whatsappNumbers) — adições 463 =====

Deno.test("whatsappNumbers PATCHADO: lid JID direto → @lid formatado", () => {
  const records = [
    { jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454", lid: "62213373075703@lid" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5511954652454"), "62213373075703@lid");
});

Deno.test("whatsappNumbers PATCHADO: lid em dígitos crus → normaliza p/ @lid", () => {
  const records = [
    { jid: "5519999657110@s.whatsapp.net", exists: true, number: "5519999657110", lid: "62213373075703" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5519999657110"), "62213373075703@lid");
});

Deno.test("whatsappNumbers STOCK (medido em prod): sem lid → '' (mantém 409)", () => {
  const records = [
    { jid: "5519999657110@s.whatsapp.net", exists: true, number: "5519999657110" },
    { jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5519999657110"), "");
});

Deno.test("whatsappNumbers: marcador literal 'lid' é rejeitado (não é JID real)", () => {
  const records = [
    { jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454", lid: "lid" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5511954652454"), "");
});

Deno.test("whatsappNumbers: casa o record certo pela cauda, ignora o outro", () => {
  const records = [
    { jid: "5511111111111@s.whatsapp.net", exists: true, number: "5511111111111", lid: "111111111111@lid" },
    { jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454", lid: "62213373075703@lid" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5511954652454"), "62213373075703@lid");
});

Deno.test("whatsappNumbers: variante BR do 9º dígito ainda casa (cauda 8)", () => {
  const records = [
    { jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454", lid: "62213373075703@lid" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "551154652454"), "62213373075703@lid");
});

Deno.test("whatsappNumbers: exists:false não fornece lid", () => {
  const records = [
    { jid: "5511000000000@s.whatsapp.net", exists: false, number: "5511000000000", lid: "999999999999@lid" },
  ];
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5511000000000"), "");
});

Deno.test("whatsappNumbers: shape {data:[...]} também é lido", () => {
  const records = {
    data: [{ jid: "5511954652454@s.whatsapp.net", exists: true, number: "5511954652454", lid: "62213373075703@lid" }],
  };
  assertEquals(pickLidFromWhatsappNumbersRecords(records, "5511954652454"), "62213373075703@lid");
});

// ===== findMessages picker: guard de cauda (defesa do review HIGH) =====
// Evolution 2.3.7 IGNORA o filtro remoteJidAlt e devolve o instance inteiro; sem
// casar a cauda do PN, retornaríamos o LID do contato mais recente (OUTRA pessoa).

Deno.test("findMessages: record do ALVO casa a cauda → retorna o LID certo", () => {
  const records = [{
    key: { fromMe: false, id: "m1", remoteJid: "62213373075703@lid", remoteJidAlt: "5511945760964@s.whatsapp.net" },
  }];
  assertEquals(pickLidJidFromEvolutionMessageRecords(records, "5511945760964"), "62213373075703@lid");
});

Deno.test("findMessages: newest é de OUTRO PN → NÃO retorna (evita mis-delivery)", () => {
  const records = [{
    key: { fromMe: false, id: "foreign", remoteJid: "99999999999999@lid", remoteJidAlt: "5521988887777@s.whatsapp.net" },
  }];
  assertEquals(pickLidJidFromEvolutionMessageRecords(records, "5511945760964"), "");
});

Deno.test("findMessages: mistura — pula o estranho, acha o do alvo", () => {
  const records = [
    { key: { fromMe: false, id: "foreign", remoteJid: "99999999999999@lid", remoteJidAlt: "5521988887777@s.whatsapp.net" } },
    { key: { fromMe: false, id: "target", remoteJid: "62213373075703@lid", remoteJidAlt: "5511945760964@s.whatsapp.net" } },
  ];
  assertEquals(pickLidJidFromEvolutionMessageRecords(records, "5511945760964"), "62213373075703@lid");
});

Deno.test("findMessages: sem phoneDigits mantém compat legada (1º útil)", () => {
  const records = [{
    key: { fromMe: false, id: "m1", remoteJid: "62213373075703@lid", remoteJidAlt: "5511945760964@s.whatsapp.net" },
  }];
  assertEquals(pickLidJidFromEvolutionMessageRecords(records), "62213373075703@lid");
});
