import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  serializePilotQueue,
  deserializePilotQueue,
  createMemoryPilotQueueStore,
} from "./pilot-queue-store.ts";
import { emptyOutboundQueue, enqueue, makeOpenBubble1Envelope } from "./outbound-queue.ts";
import { runHarnessPilotTick } from "./harness-pilot-tick.ts";
import { enqueueReactiveFromInbound } from "./reactive-enqueue.ts";
import { createZapiWireTransport } from "./wire-transport-zapi.ts";
import { createDryWireTransport } from "./wire-transport.ts";
import { legacyCamilaSendersEnabled, pathARuntimeAllowed } from "./legacy-cutover.ts";
import { authorizeWireSend } from "./wire-gates.ts";
import { FIXTURE } from "./attendance-window.ts";
import { RENATA_PHONE } from "./pilot-roster.ts";
import { seedPilotRosterFixture } from "./harness-roster-db.ts";
import { makeMensagemDeSaidaEnvelopes } from "./exit-message.ts";

Deno.test("queue serialize round-trip", () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeOpenBubble1Envelope({
      id: "e1",
      leadId: "5511999999999",
      conversationId: "c1",
      text: "oi",
      notBefore: new Date("2026-09-18T12:00:00Z"),
    }),
  );
  const ser = serializePilotQueue(q, "GO-1");
  const back = deserializePilotQueue(ser);
  assertExists(back);
  assertEquals(back.goId, "GO-1");
  assertEquals(back.queue.pending.length, 1);
  assertEquals(back.queue.pending[0].text, "oi");
});

Deno.test("queue serialize preserva sendAs+linkPreview da saída", () => {
  let q = emptyOutboundQueue();
  for (const env of makeMensagemDeSaidaEnvelopes({
    phone: "5585996074889",
    conversationId: "c1",
    greetingName: "Victória",
    now: new Date("2026-09-18T15:00:00.000Z"),
    triage: "soft",
  })) {
    q = enqueue(q, env);
  }
  const back = deserializePilotQueue(serializePilotQueue(q, "GO-1"));
  assertExists(back);
  assertEquals(back.queue.pending[0].bubbleIndex, 1);
  assertEquals(back.queue.pending[1].sendAs, "link");
  assertEquals(
    back.queue.pending[1].linkPreview?.linkUrl.includes("nexvybeauty.com.br"),
    true,
  );
});

Deno.test("legacy cutover default off", () => {
  assertEquals(legacyCamilaSendersEnabled(() => undefined), false);
  assertEquals(pathARuntimeAllowed(() => undefined), false);
  assertEquals(
    legacyCamilaSendersEnabled((k) => k === "LEGACY_CAMILA_SENDERS" ? "1" : undefined),
    true,
  );
});

Deno.test("gate: pilotLive unlocks supervised real", () => {
  const blocked = authorizeWireSend({
    kind: "supervised",
    goId: "GO-1",
    leadId: "x",
    manualList: ["x"],
    voice: "TEST",
    killOn: true,
    dryRun: false,
    allowRealWhatsapp: true,
    pilotLive: false,
    now: FIXTURE.tue1000,
  });
  assertEquals(blocked.reason, "l2_real_whatsapp_forbidden");

  const ok = authorizeWireSend({
    kind: "supervised",
    goId: "GO-1",
    leadId: "x",
    manualList: ["x"],
    voice: "TEST",
    killOn: true,
    dryRun: false,
    allowRealWhatsapp: true,
    pilotLive: true,
    now: FIXTURE.tue1000,
  });
  assertEquals(ok.allowed, true);
  assertEquals(ok.reason, "supervised_real_ok");
});

Deno.test("zapi transport dry without live flags", async () => {
  let called = 0;
  const t = createZapiWireTransport({
    envGet: () => undefined,
    sendText: async () => {
      called++;
      return { ok: true };
    },
  });
  assertEquals(t.allowReal, false);
  await t.send({
    id: "1",
    leadId: "1",
    conversationId: "c",
    kind: "reply",
    bubbleIndex: null,
    text: "x",
    notBeforeIso: new Date().toISOString(),
    idempotencyKey: "k",
  });
  assertEquals(called, 0);
});

Deno.test("harness-pilot-tick forceDry seeds Renata, 0 real", async () => {
  const store = createMemoryPilotQueueStore();
  const roster = seedPilotRosterFixture();
  const r = await runHarnessPilotTick({
    productId: "00000000-0000-0000-0000-000000000001",
    goId: "GO-BUILD-PRD12",
    store,
    forceDry: true,
    previewWindow: true,
    envGet: () => undefined,
    seedIfEmpty: true,
    overrideRoster: roster,
  });
  assertEquals(r.ok, true);
  assertEquals(r.real_whatsapp_sends, 0);
  assertEquals(r.dry, true);
  assertEquals(r.preselected_count, 10);
  // first tick may deliver resume/open
  if (r.delivered) {
    assertEquals(r.delivered.leadId, RENATA_PHONE);
  }
});

Deno.test("reactive: soft → exit; interest → wake_brain (sem stub)", () => {
  const phone = RENATA_PHONE;
  const manualList = [phone];
  let q = emptyOutboundQueue();
  q = { ...q, inFlightLeadId: phone };
  const defer = enqueueReactiveFromInbound({
    queue: q,
    phone,
    text: "Bom dia , no momento não me interesso",
    conversationId: "c1",
    now: FIXTURE.tue1000,
    manualList,
  });
  assertEquals(defer.enqueued?.kind, "exit_message");

  q = emptyOutboundQueue();
  const exit = enqueueReactiveFromInbound({
    queue: q,
    phone,
    text: "Bom dia , no momento não me interesso",
    conversationId: "c1",
    now: FIXTURE.tue1000,
    manualList,
    greetingName: "Renata",
  });
  assertEquals(exit.enqueued?.kind, "exit_message");
  assertEquals(exit.enqueued?.bubbleIndex, 1);
  assertEquals(exit.queue.pending.length, 2);
  assertEquals(exit.queue.pending[0].bubbleIndex, 1);
  assertEquals(exit.queue.pending[0].text.includes("Sem problemas"), true);
  assertEquals(exit.queue.pending[1].bubbleIndex, 2);
  assertEquals(exit.queue.pending[1].sendAs, "link");
  assertEquals(Boolean(exit.queue.pending[1].linkPreview?.linkUrl), true);

  const reply = enqueueReactiveFromInbound({
    queue: emptyOutboundQueue(),
    phone,
    text: "quero saber como funciona",
    conversationId: "c1",
    now: FIXTURE.tue1000,
    manualList,
  });
  assertEquals(reply.enqueued, null);
  assertEquals(reply.reason, "wake_brain");
  assertEquals(reply.cite, "quero saber como funciona");
});

Deno.test("reactive: rajada Andressa cita E vc? e não enfileira stub", () => {
  const phone = RENATA_PHONE;
  const r = enqueueReactiveFromInbound({
    queue: emptyOutboundQueue(),
    phone,
    text: "E vc?",
    recentTexts: ["Oiii", "Bom dia", "Tudo bem", "E vc?"],
    conversationId: "c1",
    now: FIXTURE.tue1000,
    manualList: [phone],
  });
  assertEquals(r.reason, "wake_brain");
  assertEquals(r.cite, "E vc?");
  assertEquals(r.enqueued, null);
});

Deno.test("dry transport singleton", () => {
  assertEquals(createDryWireTransport().allowReal, false);
});
