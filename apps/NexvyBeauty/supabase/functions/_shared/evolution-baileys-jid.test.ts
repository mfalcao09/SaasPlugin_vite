// deno test --no-check supabase/functions/_shared/evolution-baileys-jid.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  allowsDeviceOutboundCreateConversation,
  formatLidSendNumber,
  lidDigitsFromWaLid,
  phoneDigitsFromJid,
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
