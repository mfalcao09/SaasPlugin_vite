import { assertEquals } from "jsr:@std/assert@1";
import { evaluateChannelOwnership } from "./agent-channel-ownership.ts";

const bound = {
  instanceId: "inst-camila",
  conversationInstanceId: "inst-camila",
  boundAgentId: "agent-camila",
  speakingAgentId: "agent-camila",
  agentActive: true,
  agentActiveInWhatsapp: true,
  stampWriteOk: true,
};

Deno.test("PRD-05: Camila speaks only on her bound active instance", () => {
  const ok = evaluateChannelOwnership(bound);
  assertEquals(ok.allowed, true);
  assertEquals(ok.reason, null);
});

Deno.test("PRD-05: Duda cannot speak on Camila's bound chip", () => {
  const denied = evaluateChannelOwnership({
    ...bound,
    speakingAgentId: "agent-duda",
  });
  assertEquals(denied.allowed, false);
  assertEquals(denied.reason, "owner_mismatch");
});

Deno.test("PRD-05: inactive or WhatsApp-disabled owner fails closed", () => {
  const inactive = evaluateChannelOwnership({ ...bound, agentActive: false });
  assertEquals(inactive.allowed, false);
  assertEquals(inactive.reason, "agent_inactive");

  const noWa = evaluateChannelOwnership({
    ...bound,
    agentActiveInWhatsapp: false,
  });
  assertEquals(noWa.allowed, false);
  assertEquals(noWa.reason, "agent_inactive");
});

Deno.test("PRD-05: channel stamp write failure is fatal", () => {
  const stamp = evaluateChannelOwnership({ ...bound, stampWriteOk: false });
  assertEquals(stamp.allowed, false);
  assertEquals(stamp.reason, "channel_stamp_failed");
});

Deno.test("PRD-05: missing or mismatched instance fails closed", () => {
  assertEquals(
    evaluateChannelOwnership({ ...bound, instanceId: null }).reason,
    "no_instance",
  );
  assertEquals(
    evaluateChannelOwnership({
      ...bound,
      conversationInstanceId: "inst-other",
    }).reason,
    "instance_mismatch",
  );
  assertEquals(
    evaluateChannelOwnership({ ...bound, boundAgentId: null }).reason,
    "unbound_instance",
  );
});
