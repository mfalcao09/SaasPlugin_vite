import { assertEquals } from "jsr:@std/assert@1";
import {
  buildAgentActionIdempotencyKey,
  reserveAgentAction,
  runReservedAgentAction,
} from "./agent-action-ledger.ts";

const input = {
  productId: "product-1",
  leadId: "lead-1",
  conversationId: "conversation-1",
  agentId: "agent-1",
  instanceId: "instance-1",
  channel: "whatsapp_qr",
  actionType: "reply" as const,
  proactive: false,
  bubbleCount: 1,
  content: "Olá",
  sourceEventId: "message-1",
};

Deno.test("action ledger: idempotency key is deterministic and action-scoped", () => {
  const a = buildAgentActionIdempotencyKey(input);
  const b = buildAgentActionIdempotencyKey(input);
  assertEquals(a, b);
  assertEquals(
    a === buildAgentActionIdempotencyKey({ ...input, actionType: "resume" }),
    false,
  );
});

Deno.test("action ledger: malformed or errored RPC fails closed", async () => {
  const rpcError = await reserveAgentAction(
    {
      rpc: async () => ({ data: null, error: { message: "offline" } }),
    },
    input,
  );
  assertEquals(rpcError.allowed, false);
  assertEquals(rpcError.reason, "ledger_unavailable");

  const malformed = await reserveAgentAction(
    {
      rpc: async () => ({ data: { ok: true }, error: null }),
    },
    input,
  );
  assertEquals(malformed.allowed, false);
  assertEquals(malformed.reason, "ledger_malformed");
});

Deno.test("action ledger: content hash is stable and changes with content", async () => {
  const hashes: string[] = [];
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      hashes.push(String(args.p_content_hash));
      return {
        data: {
          ok: true,
          allowed: false,
          status: "denied",
          reason: "release_off",
          action_id: "action-1",
        },
        error: null,
      };
    },
  };
  await reserveAgentAction(client, input);
  await reserveAgentAction(client, input);
  await reserveAgentAction(client, { ...input, content: "Outro texto" });
  assertEquals(hashes[0], hashes[1]);
  assertEquals(hashes[0] === hashes[2], false);
  assertEquals(hashes[0].length, 64);
});

Deno.test("action ledger: denied reservation never calls provider", async () => {
  let providerCalls = 0;
  const result = await runReservedAgentAction(
    {
      rpc: async (name: string) =>
        name === "pcrm_authorize_and_reserve_agent_action"
          ? {
            data: {
              ok: true,
              allowed: false,
              status: "denied",
              reason: "release_off",
              action_id: "action-1",
            },
            error: null,
          }
          : { data: null, error: null },
    },
    input,
    async () => {
      providerCalls++;
      return { ok: true, providerMessageId: "wamid" };
    },
  );
  assertEquals(providerCalls, 0);
  assertEquals(result.ok, false);
  assertEquals(result.reason, "release_off");
});

Deno.test("action ledger: reserved action transitions accepted or failed", async () => {
  const transitions: Array<Record<string, unknown>> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "pcrm_authorize_and_reserve_agent_action") {
        return {
          data: {
            ok: true,
            allowed: true,
            status: "reserved",
            reason: null,
            action_id: "action-1",
          },
          error: null,
        };
      }
      transitions.push(args);
      return { data: { ok: true, status: args.p_next_status }, error: null };
    },
  };

  const success = await runReservedAgentAction(client, input, async () => ({
    ok: true,
    providerMessageId: "wamid-1",
  }));
  assertEquals(success.ok, true);
  assertEquals(transitions[0]?.p_next_status, "accepted");

  transitions.length = 0;
  const failed = await runReservedAgentAction(client, {
    ...input,
    sourceEventId: "message-2",
  }, async () => ({ ok: false, error: "provider_down" }));
  assertEquals(failed.ok, false);
  assertEquals(transitions[0]?.p_next_status, "failed");
});

Deno.test("action ledger: provider success is never reported retryable after transition failure", async () => {
  let providerCalls = 0;
  const result = await runReservedAgentAction(
    {
      rpc: async (name: string) =>
        name === "pcrm_authorize_and_reserve_agent_action"
          ? {
            data: {
              ok: true,
              allowed: true,
              status: "reserved",
              reason: null,
              action_id: "action-1",
            },
            error: null,
          }
          : { data: null, error: { message: "transition offline" } },
    },
    input,
    async () => {
      providerCalls++;
      return { ok: true, providerMessageId: "wamid-1" };
    },
  );
  assertEquals(providerCalls, 1);
  assertEquals(result.ok, true);
  assertEquals(result.reason, "ledger_transition_failed");
  assertEquals(result.ledgerTransitioned, false);
});
