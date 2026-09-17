import { assertEquals } from "jsr:@std/assert@1";
import {
  applyMessageAck,
  applyQrDeliveryAck,
  ledgerTransitionsForAck,
  reconcileMissingAck,
} from "./agent-delivery-ack.ts";

Deno.test("PRD-05 path: reserved→accepted is a provider step; ACK then reaches delivered", () => {
  const afterAccept = applyMessageAck(null, "accepted");
  assertEquals(afterAccept.apply, true);
  assertEquals(afterAccept.next, "accepted");
  assertEquals(afterAccept.countsDelivered, false);
  assertEquals(afterAccept.countsExperimentExposure, false);

  const afterDelivered = applyMessageAck("accepted", "delivered");
  assertEquals(afterDelivered.apply, true);
  assertEquals(afterDelivered.next, "delivered");
  assertEquals(afterDelivered.countsDelivered, true);
  assertEquals(afterDelivered.countsExperimentExposure, true);

  assertEquals(ledgerTransitionsForAck("reserved", "accepted"), [
    { expected: "reserved", next: "accepted" },
  ]);
  assertEquals(ledgerTransitionsForAck("accepted", "delivered"), [
    { expected: "accepted", next: "delivered" },
  ]);
});

Deno.test("PRD-05: sent is not delivered and does not expose experiments", () => {
  const sent = applyMessageAck("accepted", "sent");
  assertEquals(sent.apply, true);
  assertEquals(sent.next, "sent");
  assertEquals(sent.countsDelivered, false);
  assertEquals(sent.countsExperimentExposure, false);
  assertEquals(ledgerTransitionsForAck("accepted", "sent"), []);
});

Deno.test("PRD-05: read after sent implies first delivery and exposure", () => {
  const read = applyMessageAck("sent", "read");
  assertEquals(read.apply, true);
  assertEquals(read.next, "read");
  assertEquals(read.countsDelivered, true);
  assertEquals(read.countsExperimentExposure, true);
  assertEquals(ledgerTransitionsForAck("accepted", "read"), [
    { expected: "accepted", next: "delivered" },
    { expected: "delivered", next: "read" },
  ]);
});

Deno.test("PRD-05: duplicate ACK is a no-op", () => {
  const dup = applyMessageAck("delivered", "delivered");
  assertEquals(dup.apply, false);
  assertEquals(dup.reason, "duplicate");
  assertEquals(dup.countsDelivered, false);
  assertEquals(ledgerTransitionsForAck("delivered", "delivered"), []);
});

Deno.test("PRD-05: late or out-of-order ACK cannot downgrade", () => {
  const lateFail = applyMessageAck("delivered", "failed");
  assertEquals(lateFail.apply, false);
  assertEquals(lateFail.reason, "late_failure");

  const outOfOrder = applyMessageAck("delivered", "sent");
  assertEquals(outOfOrder.apply, false);
  assertEquals(outOfOrder.reason, "out_of_order");

  const afterFail = applyMessageAck("failed", "delivered");
  assertEquals(afterFail.apply, false);
  assertEquals(afterFail.reason, "already_failed");
});

Deno.test("PRD-05: failed after accepted/sent is allowed", () => {
  const fromAccepted = applyMessageAck("accepted", "failed");
  assertEquals(fromAccepted.apply, true);
  assertEquals(fromAccepted.next, "failed");
  assertEquals(ledgerTransitionsForAck("accepted", "failed"), [
    { expected: "accepted", next: "failed" },
  ]);
});

Deno.test("PRD-05: missing ACK is marked pending, not auto-failed", () => {
  const fresh = reconcileMissingAck("sent", 10 * 60 * 1000);
  assertEquals(fresh.action, "none");

  const stale = reconcileMissingAck("sent", 3 * 60 * 60 * 1000);
  assertEquals(stale.action, "mark_pending");
  assertEquals(stale.reason, "ack_missing");

  const delivered = reconcileMissingAck("delivered", 9 * 60 * 60 * 1000);
  assertEquals(delivered.action, "none");
});

Deno.test("PRD-05: applyQrDeliveryAck upgrades message and ledger without campaign_id", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const rpcs: Array<Record<string, unknown>> = [];
  const supabase = {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    rpc(_name: string, args: Record<string, unknown>) {
      rpcs.push(args);
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  };

  const first = await applyQrDeliveryAck(supabase, {
    message: {
      id: "msg-1",
      metadata: {
        connection_id: "inst-1",
        action_id: "11111111-1111-1111-1111-111111111111",
        delivery_status: "accepted",
        wamid: "wamid-1",
      },
    },
    instanceId: "inst-1",
    wamid: "wamid-1",
    outcome: "delivered",
  });

  assertEquals(first.applied, true);
  assertEquals(first.countsDelivered, true);
  assertEquals(first.persisted, true);
  assertEquals(first.ledgerTransitioned, true);
  assertEquals(first.meta.delivery_status, "delivered");
  assertEquals(typeof first.meta.delivered_at, "string");
  assertEquals(typeof first.meta.experiment_exposed_at, "string");
  assertEquals(updates.length, 1);
  assertEquals(rpcs[0]?.p_expected_status, "accepted");
  assertEquals(rpcs[0]?.p_next_status, "delivered");

  const dup = await applyQrDeliveryAck(supabase, {
    message: {
      id: "msg-1",
      metadata: first.meta,
    },
    instanceId: "inst-1",
    wamid: "wamid-1",
    outcome: "delivered",
  });
  assertEquals(dup.applied, false);
  assertEquals(dup.countsDelivered, false);
  assertEquals(updates.length, 1);
});

Deno.test("PRD-05: persist failure does not count as delivered", async () => {
  const result = await applyQrDeliveryAck({
    from() {
      return {
        update() {
          return {
            eq() {
              return Promise.resolve({ error: { message: "offline" } });
            },
          };
        },
      };
    },
    rpc: async () => ({ data: { ok: true }, error: null }),
  }, {
    message: {
      id: "msg-2",
      metadata: {
        connection_id: "inst-1",
        action_id: "11111111-1111-1111-1111-111111111111",
        delivery_status: "accepted",
      },
    },
    instanceId: "inst-1",
    wamid: "wamid-2",
    outcome: "delivered",
  });
  assertEquals(result.applied, false);
  assertEquals(result.persisted, false);
  assertEquals(result.countsDelivered, false);
  assertEquals(result.meta.delivery_status, "accepted");
});
