// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-brain-gate.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  harnessAllowsBrainSend,
  harnessAllowsInboundBrain,
} from "./harness-brain-gate.ts";
import { FIXTURE } from "./attendance-window.ts";

Deno.test("domingo: cérebro NÃO fala (janela Harness)", () => {
  const v = harnessAllowsBrainSend({ now: FIXTURE.sun1100, action: "reply" });
  assertEquals(v.canOut, false);
  assertEquals(v.reason, "closed_sunday");
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: v.allowed,
      replyReason: v.reason,
    }).allowed,
    false,
  );
});

Deno.test("sábado 15h: inbound pode falar; kill não entra neste portão", () => {
  const v = harnessAllowsBrainSend({ now: FIXTURE.sat1500, action: "reply" });
  assertEquals(v.canOut, true);
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: v.allowed,
      replyReason: v.reason,
    }).reason,
    "harness_reply_ok",
  );
});

Deno.test("opt-out / DNC continuam calados mesmo na janela", () => {
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: true,
      replyReason: "extended_ok",
      optOut: true,
    }).reason,
    "opt-out",
  );
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: true,
      replyReason: "extended_ok",
      doNotContact: true,
    }).reason,
    "do_not_contact",
  );
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: true,
      replyReason: "extended_ok",
      doNotContact: true,
      needsNewConsent: true,
    }).reason,
    "harness_reply_ok",
  );
  assertEquals(
    harnessAllowsInboundBrain({
      replyAllowed: true,
      replyReason: "extended_ok",
      waitPackage: true,
    }).reason,
    "mouth1_in_flight",
  );
});
