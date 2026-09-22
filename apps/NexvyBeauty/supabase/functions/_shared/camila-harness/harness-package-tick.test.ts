// deno test --no-check supabase/functions/_shared/camila-harness/harness-package-tick.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PACKAGE_LIMIT_MS } from "./porta-juiz.ts";
import {
  applyPackageTickToQueue,
  collectMouth1Phones,
  decidePackageTick,
  jobIdFor,
  packageMetaPatch,
  resendEnvelopesFor,
  runPackageTickPass,
  snapshotFromRows,
  type PackageLeadSnapshot,
} from "./harness-package-tick.ts";
import {
  emptyOutboundQueue,
  enqueue,
  makeContinueEnvelope,
  makeOpenBubble1Envelope,
} from "./outbound-queue.ts";
import { FIXTURE } from "./attendance-window.ts";
import { runHarnessPilotTick } from "./harness-pilot-tick.ts";
import { createMemoryPilotQueueStore } from "./pilot-queue-store.ts";

const T0 = Date.parse("2026-09-21T12:00:00.000Z");

function four(
  wamids: [string | null, string | null, string | null, string | null],
  attempted: [boolean, boolean, boolean, boolean] = [true, true, true, true],
): PackageLeadSnapshot["bubbles"] {
  return ([1, 2, 3, 4] as const).map((index, i) => ({
    index,
    wamid: wamids[i],
    attempted: attempted[i],
  }));
}

function snap(over: Partial<PackageLeadSnapshot> = {}): PackageLeadSnapshot {
  return {
    phone: "5511999999999",
    conversationId: "conv-1",
    conversationStatus: "bot_active",
    firstBubbleAtMs: T0,
    bubbles: four(["w1", null, null, null], [true, false, false, false]),
    pendingInboundId: "in-1",
    spokeDuringPackage: true,
    dncOrHard: false,
    brainAlreadyRepliedWamid: false,
    windowAllowsReply: true,
    mouth1Tracked: true,
    packageAlreadyClosed: false,
    existingJobId: null,
    harnessProduct: true,
    ...over,
  };
}

Deno.test("G4b: aberto + bolha 2 tentada sem wamid → resend só 2", () => {
  const d = decidePackageTick(
    snap({
      bubbles: four(["w1", null, null, null], [true, true, false, false]),
      pendingInboundId: "in-1",
    }),
    T0 + 60_000,
  );
  assertEquals(d.closePackage, false);
  assertEquals(d.createJob, false);
  assertEquals(d.resendIndexes, [2]);
});

Deno.test("G4c: 4 wamids + inbound no meio → fecha e cria job", () => {
  const d = decidePackageTick(
    snap({ bubbles: four(["a", "b", "c", "d"]) }),
    T0 + 90_000,
  );
  assertEquals(d.closePackage, true);
  assertEquals(d.createJob, true);
  assertEquals(d.job?.id, jobIdFor("conv-1", "in-1"));
  assertEquals(d.job?.flags.spoke_during_package, true);
  assertEquals(d.activation?.reason, "job_ready");
  assertEquals(d.resendIndexes, []);
});

Deno.test("G4c: 180s com 2 wamids fecha e não reenvia 3–4", () => {
  const d = decidePackageTick(
    snap({
      bubbles: four(["a", "b", null, null], [true, true, false, false]),
    }),
    T0 + PACKAGE_LIMIT_MS,
  );
  assertEquals(d.closePackage, true);
  assertEquals(d.review?.reason, "deadline_180s");
  assertEquals(d.resendIndexes, []);
  assertEquals(d.createJob, true);
});

Deno.test("Andressa: boca 1 morta + inbound pendente → job, zero resend", () => {
  const d = decidePackageTick(
    snap({
      mouth1Tracked: false,
      packageAlreadyClosed: true,
      firstBubbleAtMs: T0 - 86_400_000,
      bubbles: four(["a", "b", "c", "d"]),
    }),
    T0,
  );
  assertEquals(d.closePackage, false);
  assertEquals(d.resendIndexes, []);
  assertEquals(d.createJob, true);
  assertEquals(d.activation?.reason, "job_ready");
});

Deno.test("job existente não duplica; humano não cria", () => {
  assertEquals(
    decidePackageTick(snap({ existingJobId: "job:already" }), T0 + PACKAGE_LIMIT_MS)
      .createJob,
    false,
  );
  assertEquals(
    decidePackageTick(
      snap({ mouth1Tracked: false, conversationStatus: "human_active" }),
      T0,
    ).createJob,
    false,
  );
});

Deno.test("janela fechada: job_held ainda grava o job", () => {
  const d = decidePackageTick(
    snap({
      mouth1Tracked: false,
      packageAlreadyClosed: true,
      windowAllowsReply: false,
    }),
    T0,
  );
  assertEquals(d.createJob, true);
  assertEquals(d.activation?.reason, "job_held_window");
});

Deno.test("fila: fecha boca 1 e some continue; resend reenfileira", () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeContinueEnvelope({
      id: "pilot:5511999999999:b3",
      leadId: "5511999999999",
      conversationId: "conv-1",
      bubbleIndex: 3,
      text: "x",
      notBefore: new Date(T0),
    }),
  );
  q = { ...q, inFlightLeadId: "5511999999999" };
  const closed = applyPackageTickToQueue(
    q,
    decidePackageTick(snap({ bubbles: four(["a", "b", "c", "d"]) }), T0 + 90_000),
    [],
  );
  assertEquals(closed.pending.length, 0);
  assertEquals(closed.inFlightLeadId, null);

  const open = decidePackageTick(
    snap({
      bubbles: four(["w1", null, null, null], [true, true, false, false]),
      pendingInboundId: null,
    }),
    T0 + 30_000,
  );
  const withResend = applyPackageTickToQueue(
    emptyOutboundQueue(),
    open,
    resendEnvelopesFor(snap(), open.resendIndexes, new Date(T0)),
  );
  assertEquals(withResend.pending.length, 1);
  assertEquals(withResend.pending[0].bubbleIndex, 2);
});

Deno.test("snapshot: inbound no meio + eco chip não apaga dívida", () => {
  const s = snapshotFromRows({
    phone: "5511999999999",
    conversationId: "conv-1",
    conversationStatus: "bot_active",
    metadata: {},
    greeting: "Ana",
    handle: "ana",
    mouth1Tracked: true,
    windowAllowsReply: true,
    messages: [
      {
        id: "o1",
        direction: "outbound",
        sender_type: "agent",
        content: "Oi, Ana! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
        created_at: "2026-09-21T12:00:00.000Z",
        metadata: { evolution_message_id: "w1", source: "external_device" },
      },
      {
        id: "in-1",
        direction: "inbound",
        sender_type: "visitor",
        content: "Como funciona?",
        created_at: "2026-09-21T12:01:00.000Z",
        metadata: {},
      },
    ],
  });
  assertEquals(s.bubbles[0].wamid, "w1");
  assertEquals(s.bubbles[0].attempted, true);
  assertEquals(s.bubbles[1].attempted, false);
  assertEquals(s.pendingInboundId, "in-1");
  assertEquals(s.spokeDuringPackage, true);
  assertEquals(s.brainAlreadyRepliedWamid, false);
});

Deno.test("metadata do job + wake bot_active", () => {
  const d = decidePackageTick(
    snap({ mouth1Tracked: false, packageAlreadyClosed: true }),
    T0,
    "2026-09-21T12:00:00.000Z",
  );
  const patch = packageMetaPatch({ remarketing: true }, d, "2026-09-21T12:00:00.000Z");
  assertEquals(patch.status, "bot_active");
  assertEquals((patch.metadata.harness_job as { id: string }).id, d.job?.id);
  assertEquals(patch.metadata.harness_state, "service");
});

Deno.test("collectMouth1Phones lê inFlight + pending FC", () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeOpenBubble1Envelope({
      id: "e1",
      leadId: "5511999999999",
      conversationId: "c",
      text: "oi",
      notBefore: new Date(T0),
    }),
  );
  q = { ...q, inFlightLeadId: "5581993552037" };
  const phones = collectMouth1Phones(q);
  assertEquals(phones.includes("5511999999999"), true);
  assertEquals(phones.includes("5581993552037"), true);
});

Deno.test("tick: snapshot Andressa cria job sem WhatsApp", async () => {
  const store = createMemoryPilotQueueStore();
  const andressa = snap({
    mouth1Tracked: false,
    packageAlreadyClosed: true,
    phone: "5519992020426",
    conversationId: "a485fafd-1daf-4f33-b863-7955a3fa7c77",
  });
  const r = await runHarnessPilotTick({
    productId: "806b5975-e268-402e-a65c-9e9503271041",
    goId: "GO-TEST",
    store,
    forceDry: true,
    previewWindow: true,
    envGet: () => undefined,
    seedIfEmpty: false,
    overrideRoster: [],
    overridePackageSnapshots: [andressa],
  });
  assertEquals(r.ok, true);
  assertEquals(r.real_whatsapp_sends, 0);
  assertEquals(r.jobs_created.length, 1);
  assertEquals(r.jobs_created[0].includes("job:"), true);
});

Deno.test("runPackageTickPass: 180s tira continue da fila", async () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeContinueEnvelope({
      id: "pilot:5511999999999:b3",
      leadId: "5511999999999",
      conversationId: "conv-1",
      bubbleIndex: 3,
      text: "x",
      notBefore: FIXTURE.tue1000,
    }),
  );
  q = { ...q, inFlightLeadId: "5511999999999" };
  const pass = await runPackageTickPass({
    productId: "p",
    queue: q,
    now: new Date(T0 + PACKAGE_LIMIT_MS),
    snapshots: [
      snap({
        bubbles: four(["a", "b", null, null], [true, true, false, false]),
      }),
    ],
  });
  assertEquals(pass.queue.pending.length, 0);
  assertEquals(pass.jobs.length, 1);
});
