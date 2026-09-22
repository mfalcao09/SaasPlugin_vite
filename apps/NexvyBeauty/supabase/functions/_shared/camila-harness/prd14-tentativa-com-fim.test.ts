// PRD-14 §8. Sem WhatsApp e sem invoke de produção.
//   deno test --no-check supabase/functions/_shared/camila-harness/prd14-tentativa-com-fim.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FIXTURE } from "./attendance-window.ts";
import {
  bubblesWithinLedgerCap,
  buildHarnessJob,
  runPullerPass,
  type PullerInvoke,
} from "./harness-puller.ts";
import { snapshotFromRows } from "./harness-package-tick.ts";
import { staleRedeliveryApplies } from "./porta-juiz.ts";

const FLAGS = {
  pending_inbound_id: "in-1",
  needs_new_consent: false,
  spoke_during_package: true,
  wake_reason: "pending_inbound" as const,
};

function readyJob() {
  return buildHarnessJob({
    conversationId: "conv-1",
    inboundId: "in-1",
    reason: "job_ready",
    flags: FLAGS,
    createdAt: "2026-09-21T11:00:00.000Z",
  });
}

const FICHA = {
  httpStatus: 200,
  body: { skipped: "ficha_missing", reason: "canonical_state_not_ready" },
};

Deno.test("ensaio A — não avaliei libera o minuto seguinte", async () => {
  const order: string[] = [];
  const invoked: PullerInvoke[] = [];
  const first = await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [{ ...readyJob(), status: "ready" }],
    onClaimed: async (job) => {
      order.push(job.status);
    },
    onInvoke: async (payload) => {
      order.push("invoke");
      invoked.push(payload);
      return FICHA;
    },
  });
  const job = first.jobs.find((j) => j.id === "job:conv-1:in-1");
  assertEquals(order, ["in_flight", "invoke"]);
  assertEquals(invoked.length, 1);
  assertEquals(job?.status, "failed");
  assertEquals(job?.attempt_outcome, "not_judged");
  assertEquals(job?.attempt_reason, "canonical_state_not_ready");
  assertEquals(first.verdicts, []);

  const second = await runPullerPass({
    now: new Date(FIXTURE.tue1000.getTime() + 60_000),
    jobs: first.jobs,
    onInvoke: async (payload) => {
      invoked.push(payload);
      return FICHA;
    },
  });
  assertEquals(second.invoked.length, 1);
  assertEquals(second.invoked[0].harness_job_id, "job:conv-1:in-1");
  assertEquals(second.verdicts, []);
});

Deno.test("ensaio B — comprovante encerra e o minuto seguinte não chama", async () => {
  const job = { ...readyJob(), status: "ready" as const };
  const invoked: PullerInvoke[] = [];
  const first = await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [job],
    brainWamidByJobId: { [job.id]: true },
    onInvoke: async (payload) => {
      invoked.push(payload);
      return FICHA;
    },
  });
  assertEquals(invoked.length, 0);
  assertEquals(first.jobs[0].status, "done");

  const second = await runPullerPass({
    now: new Date(FIXTURE.tue1000.getTime() + 60_000),
    jobs: first.jobs,
    onInvoke: async (payload) => {
      invoked.push(payload);
      return FICHA;
    },
  });
  assertEquals(second.invoked.length, 0);
  assertEquals(invoked.length, 0);
});

Deno.test("segunda fala zera já respondi", () => {
  const snap = snapshotFromRows({
    phone: "5511999999999",
    conversationId: "conv-1",
    conversationStatus: "bot_active",
    metadata: {},
    mouth1Tracked: false,
    windowAllowsReply: true,
    messages: [
      {
        id: "in-1",
        direction: "inbound",
        sender_type: "visitor",
        content: "Como funciona?",
        created_at: "2026-09-21T12:00:00.000Z",
        metadata: {},
      },
      {
        id: "out-b",
        direction: "outbound",
        sender_type: "bot",
        content: "Te explico.",
        created_at: "2026-09-21T12:05:00.000Z",
        metadata: { wamid: "WAMID1", agent_id: "camila" },
      },
      {
        id: "in-2",
        direction: "inbound",
        sender_type: "visitor",
        content: "E o preço?",
        created_at: "2026-09-21T12:10:00.000Z",
        metadata: {},
      },
    ],
  });
  assertEquals(snap.pendingInboundId, "in-2");
  assertEquals(snap.brainAlreadyRepliedWamid, false);
});

Deno.test("sucesso com comprovante encerra e o minuto seguinte não chama", async () => {
  const job = { ...readyJob(), status: "ready" as const };
  const invoked: string[] = [];
  const first = await runPullerPass({
    now: FIXTURE.tue1000,
    jobs: [job],
    onInvoke: async (payload) => {
      invoked.push(payload.harness_job_id);
      return { httpStatus: 200, body: { success: true, wamid: "WAMID-OK" } };
    },
  });
  assertEquals(first.jobs[0].status, "done");
  assertEquals(first.jobs[0].attempt_outcome, "judged");
  assertEquals(first.verdicts[0]?.verdict, "attend");

  const second = await runPullerPass({
    now: new Date(FIXTURE.tue1000.getTime() + 60_000),
    jobs: first.jobs,
    onInvoke: async (payload) => {
      invoked.push(payload.harness_job_id);
      return { httpStatus: 200, body: { success: true, wamid: "WAMID-2" } };
    },
  });
  assertEquals(second.invoked.length, 0);
  assertEquals(invoked, ["job:conv-1:in-1"]);
});

Deno.test("5 bolhas não viram um pedido de 5", () => {
  const capped = bubblesWithinLedgerCap(["a", "b", "c", "d", "e"]);
  assertEquals(capped, ["a", "b", "c", "d"]);
  assertEquals(capped.length <= 4, true);
  assertEquals(bubblesWithinLedgerCap(["a", "b", "c"]), ["a", "b", "c"]);
  assertEquals(bubblesWithinLedgerCap(["só uma"]), ["só uma"]);
});

Deno.test("puxador não cai no relógio de 10 minutos", () => {
  assertEquals(
    staleRedeliveryApplies({
      inactivityMode: false,
      conductorWake: false,
      harnessJobId: "job:conv-1:in-1",
    }),
    false,
  );
  assertEquals(
    staleRedeliveryApplies({
      inactivityMode: false,
      conductorWake: false,
      harnessJobId: null,
    }),
    true,
  );
});
