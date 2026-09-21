// deno test --no-check supabase/functions/_shared/camila-harness/harness-job-gate.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  coldShouldClassifyText,
  harnessBrainJobGate,
  shouldDispatchSalesBrainFromWebhook,
} from "./harness-job-gate.ts";
import { buildHarnessJob } from "./harness-puller.ts";
import { HARNESS_LOCKED_PRODUCT_ID } from "./harness-product.ts";
import { harnessLedgerAllowsReserve } from "./harness-brain-gate.ts";
import { FIXTURE } from "./attendance-window.ts";
import { nextStageAfterInboundWake } from "./harness-stage.ts";
import { juizPrimeiroAto } from "./porta-juiz.ts";

const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const job = buildHarnessJob({
  conversationId: "conv-1",
  inboundId: "in-1",
  reason: "job_ready",
  flags: {
    pending_inbound_id: "in-1",
    needs_new_consent: false,
    spoke_during_package: false,
    wake_reason: "pending_inbound",
  },
  createdAt: "2026-09-21T12:00:00.000Z",
});

Deno.test("B: inbound harness → 0 dispatch", () => {
  assertEquals(
    shouldDispatchSalesBrainFromWebhook({
      productId: HARNESS_LOCKED_PRODUCT_ID,
    }).dispatch,
    false,
  );
  assertEquals(
    shouldDispatchSalesBrainFromWebhook({ productId: OTHER }).dispatch,
    true,
  );
});

Deno.test("B: POST brain sem job neste product → skip", () => {
  const g = harnessBrainJobGate({
    productId: HARNESS_LOCKED_PRODUCT_ID,
    bodyJobId: null,
    storedJob: null,
  });
  assertEquals(g.allowed, false);
  assertEquals(g.reason, "harness_job_required");
});

Deno.test("B: POST com job in_flight → passa", () => {
  const g = harnessBrainJobGate({
    productId: HARNESS_LOCKED_PRODUCT_ID,
    bodyJobId: job.id,
    storedJob: { ...job, status: "in_flight" },
  });
  assertEquals(g.allowed, true);
  assertEquals(g.reason, "harness_job_ok");
});

Deno.test("B: outro product_id sem job → comportamento antigo", () => {
  const g = harnessBrainJobGate({
    productId: OTHER,
    bodyJobId: null,
    storedJob: null,
  });
  assertEquals(g.allowed, true);
  assertEquals(g.reason, "not_harness_product");
});

Deno.test("B: hand-back leva o mesmo id", () => {
  const g = harnessBrainJobGate({
    productId: HARNESS_LOCKED_PRODUCT_ID,
    bodyJobId: null,
    storedJob: { ...job, status: "in_flight" },
    continuation: true,
  });
  assertEquals(g.allowed, true);
  assertEquals(g.reason, "harness_job_continuation");
});

Deno.test("C: cold deste produto não classifica texto", () => {
  assertEquals(coldShouldClassifyText(HARNESS_LOCKED_PRODUCT_ID), false);
  assertEquals(coldShouldClassifyText(OTHER), true);
});

Deno.test("D: DNC + inbound → service + consent_question", () => {
  assertEquals(nextStageAfterInboundWake("do_not_contact"), "service");
  const ato = juizPrimeiroAto({
    needsNewConsent: true,
    text: "como funciona?",
  });
  assertEquals(ato.speak, "consent_question");
});

Deno.test("D: ledger = janela harness no reply", () => {
  assertEquals(
    harnessLedgerAllowsReserve({
      productId: HARNESS_LOCKED_PRODUCT_ID,
      now: FIXTURE.sun1100,
    }).allowed,
    false,
  );
  assertEquals(
    harnessLedgerAllowsReserve({
      productId: HARNESS_LOCKED_PRODUCT_ID,
      now: FIXTURE.sat1500,
    }).allowed,
    true,
  );
  assertEquals(
    harnessLedgerAllowsReserve({
      productId: OTHER,
      now: FIXTURE.sun1100,
    }).reason,
    "not_harness_product",
  );
});
