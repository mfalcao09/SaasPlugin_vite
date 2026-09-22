import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decidePathAClosedInbound,
  pathAColdOpeningGate,
} from "./path-a-reopen-decision.ts";

const SOFT_CLOSED = {
  status: "closed" as const,
  id: "conv-test",
  metadata: {
    do_not_contact: true,
    do_not_contact_reason: "opt_out_remarketing",
    remarketing: true,
    last_r2_delivered_at: "2026-09-16T01:00:00.000Z",
  },
};

const NOW = "2026-09-16T03:00:00.000Z"; // 2h after R2

Deno.test("B2 farewell → stay_closed, shadow sends=0, agree_hold vs emergency", () => {
  const d = decidePathAClosedInbound({
    text: "Pode deixar",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
    inboundMessageId: "msg-b2",
  });
  assertEquals(d.class, "farewell_ack");
  assertEquals(d.path_a_desired, "stay_closed");
  assertEquals(d.apply_mutation, false);
  assertEquals(d.path_a_sends, 0);
  assertEquals(d.allow_send, false);
  assertEquals(d.emergency_would_reopen, false);
  assertEquals(d.divergence, "agree_hold");
});

Deno.test("B3 reopen_intent → path_a_would_reopen but shadow no mutate/send", () => {
  const d = decidePathAClosedInbound({
    text: "Obrigada, mudei de ideia, quero ver como funciona",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
  });
  assertEquals(d.class, "reopen_intent");
  assertEquals(d.path_a_desired, "reopen_soft");
  assertEquals(d.apply_mutation, false);
  assertEquals(d.path_a_sends, 0);
  assertEquals(d.divergence, "path_a_would_reopen");
  assertEquals(d.effects?.coldSuppressed, false);
  assertEquals(d.effects?.queueMustNotBeQueued, true);
});

Deno.test("B4 ambiguous clarify desired; shadow still sends=0", () => {
  const d = decidePathAClosedInbound({
    text: "oi",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
    clarifyCapAvailable: true,
  });
  assertEquals(d.class, "ambiguous");
  assertEquals(d.path_a_desired, "clarify");
  assertEquals(d.path_a_sends, 0);
  assertEquals(d.apply_mutation, false);
});

Deno.test("B4 second ambiguous cap spent → stay_closed", () => {
  const d = decidePathAClosedInbound({
    text: "oi",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
    clarifyCapAvailable: false,
  });
  assertEquals(d.path_a_desired, "stay_closed");
  assertEquals(d.path_a_sends, 0);
});

Deno.test("B5 hard opt_out_again → harden_dnc", () => {
  const d = decidePathAClosedInbound({
    text: "pare de me mandar mensagem",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
  });
  assertEquals(d.class, "opt_out_again");
  assertEquals(d.path_a_desired, "harden_dnc");
  assertEquals(d.path_a_sends, 0);
  assertEquals(d.cold_opening_allowed, false);
});

Deno.test("B6 mode off → noop containment", () => {
  const d = decidePathAClosedInbound({
    text: "quero ver",
    conversation: SOFT_CLOSED,
    mode: "off",
    nowIso: NOW,
  });
  assertEquals(d.path_a_desired, "noop");
  assertEquals(d.apply_mutation, false);
  assertEquals(d.path_a_sends, 0);
});

Deno.test("B6 enforce without allowlist → no mutate", () => {
  const d = decidePathAClosedInbound({
    text: "quero ver",
    conversation: SOFT_CLOSED,
    mode: "enforce",
    phoneDigits: "5511999999999",
    allowlistRaw: "5511945760964",
    nowIso: NOW,
  });
  assertEquals(d.path_a_desired, "reopen_soft");
  assertEquals(d.apply_mutation, false);
});

Deno.test("B6 enforce + allowlist → apply_mutation only (still sends=0 until grant)", () => {
  const d = decidePathAClosedInbound({
    text: "quero ver",
    conversation: SOFT_CLOSED,
    mode: "enforce",
    phoneDigits: "5511945760964",
    allowlistRaw: "5511945760964",
    nowIso: NOW,
  });
  assertEquals(d.apply_mutation, true);
  assertEquals(d.path_a_sends, 0);
});

Deno.test("B7 cold opening denied while suppressed", () => {
  const g = pathAColdOpeningGate({
    dncHard: false,
    coldSuppressed: true,
    softOptOutActive: true,
    conversationStatus: "closed",
  });
  assertEquals(g.allowed, false);
});

Deno.test("B7 cold opening denied during cold_not_before hold after reopen", () => {
  const g = pathAColdOpeningGate({
    dncHard: false,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "bot_active",
    coldNotBeforeIso: "2026-09-17T03:00:00.000Z",
    nowIso: NOW,
  });
  assertEquals(g.allowed, false);
});

Deno.test("B1 soft-closed state: farewell keeps hold (R2 flag not exercised here)", () => {
  const d = decidePathAClosedInbound({
    text: "Obrigada",
    conversation: SOFT_CLOSED,
    mode: "shadow",
    nowIso: NOW,
  });
  assertEquals(d.emergency_would_reopen, false);
  assertEquals(d.apply_mutation, false);
  assertEquals(d.path_a_sends, 0);
});
