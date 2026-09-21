import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldReopenClosedWaQrConversation } from "./wa-qr-conversation-reopen.ts";

Deno.test("closed sem DNC → pode reabrir (inbox normal)", () => {
  assertEquals(
    shouldReopenClosedWaQrConversation({ status: "closed", metadata: {} }),
    true,
  );
});

Deno.test("closed + do_not_contact → NÃO reabre (caso Joice)", () => {
  assertEquals(
    shouldReopenClosedWaQrConversation({
      status: "closed",
      metadata: {
        do_not_contact: true,
        do_not_contact_reason: "opt_out_remarketing",
        remarketing: true,
      },
    }),
    false,
  );
});

Deno.test("closed + remarketing → NÃO reabre", () => {
  assertEquals(
    shouldReopenClosedWaQrConversation({
      status: "closed",
      metadata: { remarketing: true },
    }),
    false,
  );
});

Deno.test("closed + already_contacted reason → NÃO reabre", () => {
  assertEquals(
    shouldReopenClosedWaQrConversation({
      status: "closed",
      metadata: {
        do_not_contact: true,
        do_not_contact_reason: "already_contacted_d2_canary_leticia",
      },
    }),
    false,
  );
});

Deno.test("bot_active → não é caso de reopen (false)", () => {
  assertEquals(
    shouldReopenClosedWaQrConversation({
      status: "bot_active",
      metadata: {},
    }),
    false,
  );
});
