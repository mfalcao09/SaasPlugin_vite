// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-wake-brain.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { triageInbound } from "./triage.ts";
import {
  harnessWakeConversationPatch,
  shouldApplyHarnessWakeBrain,
} from "./harness-wake-brain.ts";

const NOW = "2026-09-19T23:53:19.000Z";

Deno.test("Como funciona? é interest (caso Andressa)", () => {
  assertEquals(triageInbound("Como funciona?").class, "interest");
});

Deno.test("wake_brain + remarketing fechada → reabre bot_active e limpa flag", () => {
  assertEquals(
    shouldApplyHarnessWakeBrain({ reason: "wake_brain", doNotContact: false }),
    true,
  );
  const patch = harnessWakeConversationPatch(
    {
      status: "closed",
      metadata: {
        remarketing: true,
        do_not_contact: false,
        harness_state: "remarketing_pool",
      },
    },
    NOW,
  );
  assertEquals(patch.status, "bot_active");
  assertEquals(patch.metadata.remarketing, false);
  assertEquals(patch.metadata.harness_state, "service");
  assertEquals(patch.metadata.harness_service_origin, "remarketing");
  assertEquals(patch.metadata.harness_wake_at, NOW);
});

Deno.test("DNC sem flag não reabre; com needsNewConsent reabre", () => {
  assertEquals(
    shouldApplyHarnessWakeBrain({ reason: "wake_brain", doNotContact: true }),
    false,
  );
  assertEquals(
    shouldApplyHarnessWakeBrain({
      reason: "inbound_recorded",
      doNotContact: true,
      needsNewConsent: true,
    }),
    true,
  );
});

Deno.test("inbound_recorded reabre (porta; juiz é o cérebro)", () => {
  assertEquals(
    shouldApplyHarnessWakeBrain({
      reason: "inbound_recorded",
      doNotContact: false,
    }),
    true,
  );
});

Deno.test("exit/noise não reabre", () => {
  assertEquals(
    shouldApplyHarnessWakeBrain({ reason: "enqueued_exit_soft" }),
    false,
  );
  assertEquals(
    shouldApplyHarnessWakeBrain({ reason: "triage_noise_no_enqueue" }),
    false,
  );
});
