// deno test --no-check supabase/functions/_shared/evolution-baileys-jid.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  allowsDeviceOutboundCreateConversation,
  phoneDigitsFromJid,
  resolveBaileysMessageJids,
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
