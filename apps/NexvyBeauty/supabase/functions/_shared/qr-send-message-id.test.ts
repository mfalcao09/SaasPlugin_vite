import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractQrSendMessageId } from "./qr-send-message-id.ts";

Deno.test("Z-API messageId", () => {
  assertEquals(
    extractQrSendMessageId({ ok: true, body: { messageId: "3EB0ABC" } }),
    "3EB0ABC",
  );
});

Deno.test("Evolution key.id", () => {
  assertEquals(
    extractQrSendMessageId({ ok: true, body: { key: { id: "EVO1" } } }),
    "EVO1",
  );
});

Deno.test("ausente → null (não inventar)", () => {
  assertEquals(extractQrSendMessageId({ ok: true, body: {} }), null);
  assertEquals(extractQrSendMessageId({ ok: true }), null);
});
