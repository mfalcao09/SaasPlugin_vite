import { assertEquals } from "jsr:@std/assert@1";

const shared = new URL("../", import.meta.url);
const brain = await Deno.readTextFile(
  new URL("platform-sales-brain/index.ts", shared),
);
const cold = await Deno.readTextFile(
  new URL("platform-cold-outreach/index.ts", shared),
);
const webhook = await Deno.readTextFile(
  new URL("platform-whatsapp-qr-webhook/index.ts", shared),
);

Deno.test("Action Ledger wiring: brain reserves before bubble delivery", () => {
  const reserve = brain.indexOf("const reservation = await reserveAgentAction");
  const loop = brain.indexOf("for (let i = 0; i < total; i++)");
  const deliver = brain.indexOf("await deliver(", loop);
  assertEquals(reserve >= 0, true);
  assertEquals(reserve < loop, true);
  assertEquals(loop < deliver, true);
  assertEquals(brain.includes("transitionAgentAction("), true);
  assertEquals(brain.includes("prospector_requires_qr_channel"), true);
});

Deno.test("Action Ledger wiring: every real cold WhatsApp delivery uses wrapper", () => {
  const provider = cold.indexOf(
    'sb.functions.invoke("platform-whatsapp-qr-send"',
  );
  const wrapper = cold.lastIndexOf("runReservedAgentAction", provider);
  assertEquals(provider >= 0, true);
  assertEquals(wrapper >= 0, true);
  assertEquals(wrapper < provider, true);
  assertEquals(cold.includes("safety_reservation_input_missing"), true);
});

Deno.test("Action Ledger wiring: inbound cancellation precedes memory and brain", () => {
  const cancel = webhook.indexOf("pcrm_cancel_pending_agent_actions");
  const memory = webhook.indexOf("appendCanonicalLeadMemory", cancel);
  const brainDispatch = webhook.indexOf("await dispatchSalesBrain", memory);
  assertEquals(cancel >= 0, true);
  assertEquals(cancel < memory, true);
  assertEquals(memory < brainDispatch, true);
});
