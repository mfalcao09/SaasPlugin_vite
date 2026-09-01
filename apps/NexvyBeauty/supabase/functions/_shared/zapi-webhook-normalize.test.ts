import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isZapiWebhookPayload,
  normalizeZapiWebhook,
} from "./zapi-webhook-normalize.ts";
import { extractZapiQr, maskSecret } from "./zapi-client.ts";

Deno.test("maskSecret never returns full token", () => {
  const m = maskSecret("F452fcd86f1574bb2b2b55ae7c758b1baS");
  assertEquals(m.includes("F452"), true);
  assertEquals(m.includes("1baS"), true);
  assertEquals(m.includes("fcd86f1574"), false);
});

Deno.test("isZapiWebhookPayload detects callbacks", () => {
  assertEquals(isZapiWebhookPayload({ type: "ReceivedCallback" }), true);
  assertEquals(isZapiWebhookPayload({ type: "ConnectedCallback" }), true);
  assertEquals(isZapiWebhookPayload({ event: "MESSAGES_UPSERT" }), false);
});

Deno.test("normalizeZapiWebhook maps inbound text", () => {
  const norm = normalizeZapiWebhook({
    type: "ReceivedCallback",
    phone: "5511999999999",
    chatLid: "123456789012345@lid",
    fromMe: false,
    messageId: "ABC123",
    text: { message: "oi camila" },
    senderName: "Lead",
  }, "INST");
  assertEquals(norm.kind, "message");
  if (norm.kind === "message") {
    assertEquals(norm.content, "oi camila");
    assertEquals(norm.messageId, "ABC123");
    assertEquals(norm.remoteJid, "5511999999999@s.whatsapp.net");
    assertEquals(norm.lidJid, "123456789012345@lid");
    assertEquals(norm.fromMe, false);
  }
});

Deno.test("normalizeZapiWebhook lid-only keeps @lid remoteJid", () => {
  const norm = normalizeZapiWebhook({
    type: "ReceivedCallback",
    chatLid: "999888777666555@lid",
    fromMe: false,
    messageId: "LIDONLY",
    text: { message: "sem pn" },
  }, "INST");
  assertEquals(norm.kind, "message");
  if (norm.kind === "message") {
    assertEquals(norm.remoteJid, "999888777666555@lid");
    assertEquals(norm.lidJid, "999888777666555@lid");
  }
});

Deno.test("normalizeZapiWebhook maps connected", () => {
  const norm = normalizeZapiWebhook({
    type: "ConnectedCallback",
    phone: "5511888777666",
    connected: true,
  }, "INST");
  assertEquals(norm.kind, "connection");
  if (norm.kind === "connection") {
    assertEquals(norm.state, "open");
    assertEquals(norm.phone, "5511888777666");
  }
});

Deno.test("extractZapiQr accepts value base64", () => {
  const qr = extractZapiQr({ value: "data:image/png;base64,aaaa" + "b".repeat(40) });
  assertExists(qr);
  assertEquals(qr!.startsWith("data:image"), true);
});
