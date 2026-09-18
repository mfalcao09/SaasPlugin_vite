// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/pilot-deliver.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  planPilotQueue,
  dryRunPilotUntilIdle,
  createDryWireTransport,
  RENATA_PHONE,
  RENATA_RESUME_TEXT,
  pilotManualList,
  runPilotTick,
  canDispatchNow,
  absorbPreselectedIntoQueue,
} from "./pilot-deliver.ts";
import { emptyOutboundQueue } from "./outbound-queue.ts";
import { seedPilotRosterFixture } from "./harness-roster-db.ts";
import { FIXTURE } from "./attendance-window.ts";

const ROSTER = seedPilotRosterFixture();

Deno.test("sem GO → fila bloqueada, 0 sends", () => {
  const p = planPilotQueue({
    goId: null,
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1000,
    roster: ROSTER,
  });
  assertEquals(p.allowed, false);
  assertEquals(p.reason, "supervised_requires_go_id");
  assertEquals(p.realSends, 0);
  assertEquals(p.envelopesQueued, 0);
});

Deno.test("plan: Renata 1ª = retomada aprovada; lista = 10 phones", () => {
  const p = planPilotQueue({
    goId: "GO-PILOT-BUILD",
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1000,
    roster: ROSTER,
  });
  assertEquals(p.allowed, true);
  assertEquals(p.manualList.length, 10);
  assertEquals(p.manualList[0], RENATA_PHONE);
  assertEquals(p.envelopesQueued, 10); // só 1ª por lead
  assertEquals(p.renataResumeText, RENATA_RESUME_TEXT);
  const first = p.queue.pending[0];
  assertEquals(first.leadId, RENATA_PHONE);
  assertEquals(first.kind, "resume");
  assertEquals(first.text, RENATA_RESUME_TEXT);
  assertEquals(p.realSends, 0);
  assertEquals(p.dryRun, true);
});

Deno.test("dryRun Renata only: resume + 3 bolhas, 0 real, texto não troca", async () => {
  const r = await dryRunPilotUntilIdle({
    goId: "GO-PILOT-BUILD",
    now: FIXTURE.tue1000,
    roster: ROSTER,
    onlyPhones: [RENATA_PHONE],
    rng: () => 0,
    advanceMs: 5_000,
  });
  assertEquals(r.plan.allowed, true);
  assertEquals(r.realSends, 0);
  assertEquals(r.delivered.length, 4); // resume + 2+3+4
  assertEquals(r.delivered[0].text, RENATA_RESUME_TEXT);
  assertEquals(r.delivered[0].leadId, RENATA_PHONE);
  for (const d of r.delivered) {
    assertEquals(d.leadId, RENATA_PHONE);
  }
  assertEquals(r.finalQueue.pending.length, 0);
});

Deno.test("dryRun 2 leads: spacing impede B antes do not_before; 0 real", async () => {
  const phones = [RENATA_PHONE, ROSTER[1].phone];
  const r = await dryRunPilotUntilIdle({
    goId: "GO-PILOT-BUILD",
    now: FIXTURE.tue1000,
    roster: ROSTER,
    onlyPhones: phones,
    rng: () => 0, // 42s
    advanceMs: 1_000,
    maxTicks: 800,
  });
  assertEquals(r.realSends, 0);
  assertEquals(r.delivered.length >= 5, true); // Renata 4 + Aliny ≥1
  const renataMsgs = r.delivered.filter((d) => d.leadId === RENATA_PHONE);
  const alinyMsgs = r.delivered.filter((d) => d.leadId === phones[1]);
  assertEquals(renataMsgs.length, 4);
  assertEquals(alinyMsgs.length >= 1, true);
  assertEquals(alinyMsgs.every((d) => d.leadId === phones[1]), true);
  const idxR0 = r.delivered.findIndex((d) => d.leadId === RENATA_PHONE);
  const idxA0 = r.delivered.findIndex((d) => d.leadId === phones[1]);
  assertEquals(idxA0 > idxR0, true);
});

Deno.test("dry transport never allowReal", () => {
  const t = createDryWireTransport();
  assertEquals(t.allowReal, false);
});

Deno.test("pilotManualList mirrors roster fixture", () => {
  assertEquals(pilotManualList(ROSTER).length, 10);
  assertEquals(pilotManualList(ROSTER)[0], "5581993552037");
});

Deno.test("fora da comercial: abertura nova bloqueia Aliny", () => {
  const p = planPilotQueue({
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1805, // após 18h — open bloqueia; resume Renata ok na estendida
    roster: ROSTER,
    onlyPhones: [ROSTER[1].phone],
  });
  assertEquals(p.allowed, false);
  assertEquals(p.reason.includes("outside_commercial_window"), true);
  assertEquals(p.realSends, 0);
});

Deno.test("tick fora da comercial não entrega abertura mesmo se notBefore já passou", async () => {
  const plan = planPilotQueue({
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1000,
    roster: ROSTER,
    onlyPhones: [ROSTER[1].phone],
  });
  const tick = await runPilotTick({
    queue: plan.queue,
    now: FIXTURE.tue1805,
    transport: createDryWireTransport(),
    roster: ROSTER,
    goId: "GO-X",
  });
  assertEquals(tick.delivered, null);
  assertEquals(tick.realSends, 0);
  assertEquals(tick.reason, "outside_commercial_window");
  assertEquals(tick.queue.pending.length, plan.queue.pending.length);
});

Deno.test("posso disparar? lead que saiu da lista não abre; pacote em curso segue", () => {
  const plan = planPilotQueue({
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1000,
    roster: ROSTER,
    onlyPhones: [ROSTER[1].phone],
  });
  const env = plan.queue.pending[0];
  const gone = canDispatchNow({
    envelope: env,
    now: FIXTURE.tue1000,
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    roster: [],
  });
  assertEquals(gone.allowed, false);
  assertEquals(gone.reason, "lead_not_on_manual_list");

  const ok = canDispatchNow({
    envelope: env,
    now: FIXTURE.tue1000,
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    roster: ROSTER,
  });
  assertEquals(ok.allowed, true);

  const tampered = { ...env, text: "texto trocado" };
  const bad = canDispatchNow({
    envelope: tampered,
    now: FIXTURE.tue1000,
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    roster: ROSTER,
  });
  assertEquals(bad.allowed, false);
  assertEquals(bad.reason, "text_mismatch");

  const dup = canDispatchNow({
    envelope: env,
    now: FIXTURE.tue1000,
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    roster: ROSTER,
    alreadySent: true,
  });
  assertEquals(dup.reason, "already_sent_outside_queue");

  const noChip = canDispatchNow({
    envelope: env,
    now: FIXTURE.tue1000,
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    roster: ROSTER,
    realIntent: true,
    pilotLive: true,
    chipConnected: false,
  });
  assertEquals(noChip.reason, "chip_not_connected");
});

Deno.test("lead nova entra no fim, sem reordenar quem já estava", () => {
  const kept = ROSTER[0];
  const newbie = ROSTER[1];
  let q = emptyOutboundQueue();
  q = {
    ...q,
    pending: [{
      id: `pilot:${kept.phone}:resume`,
      leadId: kept.phone,
      conversationId: `pilot-conv:${kept.phone}`,
      kind: "resume",
      bubbleIndex: null,
      text: "ja na fila",
      notBeforeIso: FIXTURE.tue1000.toISOString(),
      idempotencyKey: `pilot:${kept.phone}:resume`,
    }],
  };
  const out = absorbPreselectedIntoQueue(q, [kept, newbie], FIXTURE.tue1000);
  assertEquals(out.added, 1);
  assertEquals(out.queue.pending[0].leadId, kept.phone);
  assertEquals(out.queue.pending[1].leadId, newbie.phone);
  assertEquals(out.queue.pending[0].text, "ja na fila");
});

Deno.test("roster vazio → no_preselected_leads_in_db", () => {
  const p = planPilotQueue({
    goId: "GO-X",
    voice: "TEST",
    killOn: true,
    now: FIXTURE.tue1000,
    roster: [],
  });
  assertEquals(p.allowed, false);
  assertEquals(p.reason, "no_preselected_leads_in_db");
});
