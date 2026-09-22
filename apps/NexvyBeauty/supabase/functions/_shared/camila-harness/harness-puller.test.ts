// deno test --no-check supabase/functions/_shared/camila-harness/harness-puller.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FIXTURE } from "./attendance-window.ts";
import {
  buildHarnessJob,
  claimJob,
  completeJob,
  dropMouth1ExitEnvelopes,
  g7MayWriteFunnel,
  housekeepMayMoveToPool,
  mouth1OutboundMetadata,
  pickNextReadyJob,
  promoteHeldJobs,
  runPullerPass,
  type HarnessJobRecord,
  type PullerInvoke,
} from "./harness-puller.ts";
import { emptyOutboundQueue } from "./outbound-queue.ts";
import { runHarnessPilotTick } from "./harness-pilot-tick.ts";
import { createMemoryPilotQueueStore } from "./pilot-queue-store.ts";
import { HARNESS_LOCKED_PRODUCT_ID } from "./harness-product.ts";
import type { PackageLeadSnapshot } from "./harness-package-tick.ts";
import { PACKAGE_LIMIT_MS } from "./porta-juiz.ts";

const FLAGS = {
  pending_inbound_id: "in-1",
  needs_new_consent: false,
  spoke_during_package: true,
  wake_reason: "pending_inbound" as const,
};

function heldJob(over: Partial<HarnessJobRecord> = {}): HarnessJobRecord {
  return {
    ...buildHarnessJob({
      conversationId: "conv-1",
      inboundId: "in-1",
      reason: "job_held_window",
      flags: FLAGS,
      createdAt: "2026-09-20T14:00:00.000Z",
    }),
    ...over,
  };
}

Deno.test("held + domingo → 0 invoke", async () => {
  const invoked: PullerInvoke[] = [];
  const r = await runPullerPass({
    now: FIXTURE.sun1100,
    jobs: [heldJob()],
    onInvoke: async (p) => {
      invoked.push(p);
    },
  });
  assertEquals(invoked.length, 0);
  assertEquals(r.invoked.length, 0);
  assertEquals(r.jobs[0].status, "held");
});

Deno.test("held + terça 10h → 1 invoke com harness_job_id", async () => {
  const invoked: PullerInvoke[] = [];
  const r = await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [heldJob()],
    onInvoke: async (p) => {
      invoked.push(p);
    },
  });
  assertEquals(invoked.length, 1);
  assertEquals(invoked[0].harness_job_id, "job:conv-1:in-1");
  assertEquals(invoked[0].conversation_id, "conv-1");
  assertEquals(r.jobs.find((j) => j.id === invoked[0].harness_job_id)?.status, "failed");
});

Deno.test("ready duas vezes no mesmo tick → 1 claim", async () => {
  const invoked: PullerInvoke[] = [];
  const a = heldJob({
    status: "ready",
    reason: "job_ready",
    created_at: "2026-09-21T12:00:00.000Z",
  });
  const b = heldJob({
    id: "job:conv-2:in-2",
    conversationId: "conv-2",
    inbound_id: "in-2",
    status: "ready",
    reason: "job_ready",
    created_at: "2026-09-21T12:01:00.000Z",
  });
  await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [a, b],
    onInvoke: async (p) => {
      invoked.push(p);
    },
  });
  assertEquals(invoked.length, 1);
  assertEquals(invoked[0].harness_job_id, a.id);
});

Deno.test("já tem wamid do cérebro → done, 0 invoke", async () => {
  const invoked: PullerInvoke[] = [];
  const job = heldJob({ status: "ready", reason: "job_ready" });
  const r = await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [job],
    brainWamidByJobId: { [job.id]: true },
    onInvoke: async (p) => {
      invoked.push(p);
    },
  });
  assertEquals(invoked.length, 0);
  assertEquals(r.jobs[0].status, "done");
});

Deno.test("humano → 0 invoke", async () => {
  const invoked: PullerInvoke[] = [];
  await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [heldJob({ status: "ready", reason: "job_ready" })],
    conversationStatusById: { "conv-1": "human_active" },
    onInvoke: async (p) => {
      invoked.push(p);
    },
  });
  assertEquals(invoked.length, 0);
});

Deno.test("create job NÃO chama cérebro (onHarnessJob morto)", async () => {
  const invoked: PullerInvoke[] = [];
  const snap: PackageLeadSnapshot = {
    phone: "5519992020426",
    conversationId: "a485fafd-1daf-4f33-b863-7955a3fa7c77",
    conversationStatus: "closed",
    firstBubbleAtMs: Date.parse("2026-09-18T12:00:00.000Z"),
    bubbles: ([1, 2, 3, 4] as const).map((index) => ({
      index,
      wamid: `w${index}`,
      attempted: true,
    })),
    pendingInboundId: "in-andressa",
    spokeDuringPackage: true,
    dncOrHard: false,
    brainAlreadyRepliedWamid: false,
    windowAllowsReply: true,
    mouth1Tracked: false,
    packageAlreadyClosed: true,
    existingJobId: null,
    harnessProduct: true,
  };
  const r = await runHarnessPilotTick({
    productId: HARNESS_LOCKED_PRODUCT_ID,
    goId: "GO-TEST",
    store: createMemoryPilotQueueStore(),
    forceDry: true,
    previewWindow: true,
    envGet: () => undefined,
    seedIfEmpty: false,
    overrideRoster: [],
    overridePackageSnapshots: [snap],
    onHarnessJob: async () => {
      invoked.push({
        conversation_id: "x",
        harness_job_id: "x",
        harness_wake_flags: FLAGS,
      });
    },
  });
  assertEquals(r.jobs_created.length, 1);
  assertEquals(r.puller_invokes, 0);
  assertEquals(invoked.length, 0);
});

Deno.test("claim/complete no-op em in_flight/done", () => {
  const ready = heldJob({ status: "ready", reason: "job_ready" });
  const claimed = claimJob(ready, "t1");
  assertEquals(claimed.status, "in_flight");
  assertEquals(claimJob(claimed, "t2").status, "in_flight");
  assertEquals(completeJob(claimed, "t3").status, "done");
});

Deno.test("pickNextReadyJob ignora held", () => {
  assertEquals(pickNextReadyJob([heldJob()]), null);
  const promoted = promoteHeldJobs([heldJob()], true);
  assertEquals(pickNextReadyJob(promoted)?.status, "ready");
});

Deno.test("C: tick sem exit_message boca 1 + G7 wamid + housekeep pending", () => {
  let q = emptyOutboundQueue();
  q = {
    ...q,
    pending: [
      { kind: "exit_message", leadId: "1" } as typeof q.pending[0],
      { kind: "continue_bubble", leadId: "1" } as typeof q.pending[0],
    ],
  };
  const dropped = dropMouth1ExitEnvelopes(q);
  assertEquals(dropped.pending.map((e) => e.kind), ["continue_bubble"]);
  assertEquals(g7MayWriteFunnel(null), false);
  assertEquals(g7MayWriteFunnel("wamid-1"), true);
  assertEquals(
    housekeepMayMoveToPool({
      pendingInbound: true,
      jobStatus: null,
      silence24hDue: true,
    }),
    false,
  );
  assertEquals(
    housekeepMayMoveToPool({
      pendingInbound: false,
      jobStatus: "ready",
      silence24hDue: true,
    }),
    false,
  );
  assertEquals(
    housekeepMayMoveToPool({
      pendingInbound: false,
      jobStatus: "done",
      silence24hDue: true,
    }),
    true,
  );
  const meta = mouth1OutboundMetadata("pilot:x:b1", "w1");
  assertEquals(meta.harness_mouth, 1);
  assertEquals(meta.wamid, "w1");
  assertEquals(PACKAGE_LIMIT_MS, 180_000);
});
