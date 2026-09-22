// platform-crm-lead-context.test.ts — PRD-03 lead state/context helpers
//
// TDD RED phase: written BEFORE the implementation file exists.
//   deno test supabase/functions/_shared/platform-crm-lead-context.test.ts
//
// Coverage targets:
//   ✓ Generic names detection (reuses camila-display-name, product-scoped)
//   ✓ Fail-closed missing state (assertContextReady throws)
//   ✓ CAS version contract (verifyCasVersion rejects mismatch)
//   ✓ Idempotency key determinism and uniqueness
//   ✓ Context isolation: different product_ids never bleed
//   ✓ parseLeadState shape validation (rejects malformed, accepts valid)
//   ✓ buildLeadContextFromState fail-closed sentinel
//   ✓ buildLeadName: generic push-name falls back to phone
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  appendCanonicalLeadMemory,
  assertContextReady,
  buildLeadContextFromState,
  buildLeadName,
  ensureCanonicalLeadState,
  FAIL_CLOSED_CONTEXT,
  formatCanonicalLeadContext,
  isContextReady,
  type LeadStateRow,
  loadCanonicalLeadContext,
  makeIdempotencyKey,
  parseLeadState,
  verifyCasVersion,
} from "./platform-crm-lead-context.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PRODUCT_A = "11111111-0000-0000-0000-000000000001";
const PRODUCT_B = "22222222-0000-0000-0000-000000000002";
const LEAD_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const CONV_ID = "cccccccc-0000-0000-0000-000000000001";
const MSG_ID = "mmmmmmmm-0000-0000-0000-000000000001";

function makeState(overrides: Partial<LeadStateRow> = {}): LeadStateRow {
  return {
    id: "ssssssss-0000-0000-0000-000000000001",
    lead_id: LEAD_ID,
    product_id: PRODUCT_A,
    version: 0,
    summary: null,
    derived_stage: null,
    next_action: null,
    facts: {},
    objections: [],
    commitments: [],
    consents: {},
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

// ── Generic names ─────────────────────────────────────────────────────────────

Deno.test("buildLeadName: generic push-name uses phone fallback", () => {
  // "Studio", "Nail", "Lashes" are business category words — not person names
  assertEquals(
    buildLeadName("Studio", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
  assertEquals(
    buildLeadName("Lash Expert", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
  assertEquals(
    buildLeadName("nail nails", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
  assertEquals(
    buildLeadName("Sobrancelha Designer", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
});

Deno.test("buildLeadName: person-like push-name passes through", () => {
  assertEquals(buildLeadName("Karolyna", "+5511999887766"), "Karolyna");
  assertEquals(
    buildLeadName("Deise Oliveira", "+5511999887766"),
    "Deise Oliveira",
  );
  assertEquals(
    buildLeadName("Jeissiane Castro Nail", "+5511999887766"),
    "Jeissiane Castro Nail",
  );
});

Deno.test("buildLeadName: null/empty push-name uses phone", () => {
  assertEquals(
    buildLeadName(null, "+5511999887766"),
    "WhatsApp +5511999887766",
  );
  assertEquals(buildLeadName("", "+5511999887766"), "WhatsApp +5511999887766");
  assertEquals(
    buildLeadName("  ", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
});

Deno.test("buildLeadName: phone-looking chat name uses phone fallback", () => {
  // visitor chat name that IS a phone number should not become the lead name
  assertEquals(
    buildLeadName("5511999887766", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
  assertEquals(
    buildLeadName("+5511999887766", "+5511999887766"),
    "WhatsApp +5511999887766",
  );
});

// ── Fail-closed readiness ─────────────────────────────────────────────────────

Deno.test("isContextReady: null state → false (fail closed)", () => {
  assertEquals(isContextReady(null), false);
});

Deno.test("isContextReady: valid state → true", () => {
  assertEquals(isContextReady(makeState()), true);
});

Deno.test("assertContextReady: throws when state is null", () => {
  assertThrows(
    () => assertContextReady(null),
    Error,
    "lead_state not found",
  );
});

Deno.test("assertContextReady: does not throw when state is valid", () => {
  // no throw
  assertContextReady(makeState());
});

Deno.test("FAIL_CLOSED_CONTEXT: isReady is false, state is null", () => {
  assertEquals(FAIL_CLOSED_CONTEXT.isReady, false);
  assertEquals(FAIL_CLOSED_CONTEXT.state, null);
});

// ── Context isolation ─────────────────────────────────────────────────────────

Deno.test("context isolation: state for product A is not ready for product B", () => {
  const stateA = makeState({ product_id: PRODUCT_A });
  const stateB = makeState({ product_id: PRODUCT_B });
  // Both have their own state — they are isolated by product_id.
  assertEquals(stateA.product_id, PRODUCT_A);
  assertEquals(stateB.product_id, PRODUCT_B);
  // Context built from stateA should not be returned for product B queries
  const ctxA = buildLeadContextFromState(stateA, LEAD_ID, PRODUCT_A);
  const ctxB = buildLeadContextFromState(null, LEAD_ID, PRODUCT_B);
  assertEquals(ctxA.isReady, true);
  assertEquals(ctxA.productId, PRODUCT_A);
  assertEquals(ctxB.isReady, false);
  assertEquals(ctxB.productId, PRODUCT_B);
  // Product IDs never cross-contaminate
  assertEquals(ctxA.productId === ctxB.productId, false);
});

Deno.test("buildLeadContextFromState: null state produces fail-closed sentinel", () => {
  const ctx = buildLeadContextFromState(null, LEAD_ID, PRODUCT_A);
  assertEquals(ctx.isReady, false);
  assertEquals(ctx.state, null);
  assertEquals(ctx.leadId, LEAD_ID);
  assertEquals(ctx.productId, PRODUCT_A);
});

Deno.test("buildLeadContextFromState: rejects a non-null state from another product", () => {
  const ctx = buildLeadContextFromState(
    makeState({ product_id: PRODUCT_A }),
    LEAD_ID,
    PRODUCT_B,
  );
  assertEquals(ctx.isReady, false);
  assertEquals(ctx.state, null);
});

Deno.test("buildLeadContextFromState: valid state produces ready context", () => {
  const state = makeState({ summary: "lead interessada" });
  const ctx = buildLeadContextFromState(state, LEAD_ID, PRODUCT_A);
  assertEquals(ctx.isReady, true);
  assertEquals(ctx.state?.summary, "lead interessada");
});

// ── CAS version contract ──────────────────────────────────────────────────────

Deno.test("verifyCasVersion: accepts matching version", () => {
  verifyCasVersion(3, 3); // no throw
});

Deno.test("verifyCasVersion: rejects stale (expected < current)", () => {
  assertThrows(
    () => verifyCasVersion(3, 1),
    Error,
    "version mismatch",
  );
});

Deno.test("verifyCasVersion: rejects future (expected > current)", () => {
  assertThrows(
    () => verifyCasVersion(1, 5),
    Error,
    "version mismatch",
  );
});

Deno.test("verifyCasVersion: version=0 is valid initial state", () => {
  verifyCasVersion(0, 0); // no throw
});

// ── Idempotency key ──────────────────────────────────────────────────────────

Deno.test("makeIdempotencyKey: deterministic for same inputs", () => {
  const k1 = makeIdempotencyKey(CONV_ID, MSG_ID);
  const k2 = makeIdempotencyKey(CONV_ID, MSG_ID);
  assertEquals(k1, k2);
});

Deno.test("makeIdempotencyKey: different conversation_id → different key", () => {
  const k1 = makeIdempotencyKey(CONV_ID, MSG_ID);
  const k2 = makeIdempotencyKey("cccccccc-0000-0000-0000-000000000002", MSG_ID);
  assertEquals(k1 !== k2, true);
});

Deno.test("makeIdempotencyKey: different message_id → different key", () => {
  const k1 = makeIdempotencyKey(CONV_ID, MSG_ID);
  const k2 = makeIdempotencyKey(
    CONV_ID,
    "mmmmmmmm-0000-0000-0000-000000000002",
  );
  assertEquals(k1 !== k2, true);
});

Deno.test("makeIdempotencyKey: output is non-empty string", () => {
  const k = makeIdempotencyKey(CONV_ID, MSG_ID);
  assertEquals(typeof k, "string");
  assertEquals(k.length > 0, true);
});

// ── parseLeadState ────────────────────────────────────────────────────────────

Deno.test("parseLeadState: returns null for null/undefined input", () => {
  assertEquals(parseLeadState(null), null);
  assertEquals(parseLeadState(undefined), null);
});

Deno.test("parseLeadState: returns null for non-object", () => {
  assertEquals(parseLeadState("string"), null);
  assertEquals(parseLeadState(42), null);
  assertEquals(parseLeadState([]), null);
});

Deno.test("parseLeadState: returns null when required fields missing", () => {
  assertEquals(parseLeadState({}), null);
  assertEquals(parseLeadState({ id: "x" }), null);
  assertEquals(parseLeadState({ id: "x", lead_id: "y" }), null);
});

Deno.test("parseLeadState: returns typed row for valid shape", () => {
  const raw = makeState();
  const parsed = parseLeadState(raw);
  assertEquals(parsed !== null, true);
  assertEquals(parsed?.lead_id, LEAD_ID);
  assertEquals(parsed?.product_id, PRODUCT_A);
  assertEquals(parsed?.version, 0);
});

Deno.test("parseLeadState: coerces missing arrays to empty arrays", () => {
  const raw = { ...makeState(), objections: null, commitments: undefined };
  const parsed = parseLeadState(raw);
  assertEquals(Array.isArray(parsed?.objections), true);
  assertEquals(Array.isArray(parsed?.commitments), true);
});

Deno.test("parseLeadState: consents is an object, never an array", () => {
  const parsed = parseLeadState({ ...makeState(), consents: ["bad"] });
  assertEquals(parsed?.consents, {});
});

Deno.test("parseLeadState: coerces missing facts object to empty object", () => {
  const raw = { ...makeState(), facts: null };
  const parsed = parseLeadState(raw);
  assertEquals(
    typeof parsed?.facts === "object" && !Array.isArray(parsed.facts),
    true,
  );
});

Deno.test("formatCanonicalLeadContext: includes state and only active same-lead memories", () => {
  const block = formatCanonicalLeadContext({
    state: makeState({
      summary: "Atende sozinha e usa agenda no WhatsApp.",
      derived_stage: "diagnostico",
      next_action: "explicar valor",
      facts: { carteira: 60 },
      objections: ["pix"],
      commitments: ["mostrar raio-x"],
      consents: { commercial_contact: true },
    }),
    leadId: LEAD_ID,
    productId: PRODUCT_A,
    memories: [
      {
        lead_id: LEAD_ID,
        product_id: PRODUCT_A,
        content: "Pediu ajuda com sinal de agendamento.",
        memory_type: "objection",
        is_active: true,
        confidence: 0.9,
      },
      {
        lead_id: "other-lead",
        product_id: PRODUCT_A,
        content: "SEGREDO DE OUTRA LEAD",
        memory_type: "fact",
        is_active: true,
        confidence: 1,
      },
      {
        lead_id: LEAD_ID,
        product_id: PRODUCT_A,
        content: "Fato supersedido",
        memory_type: "fact",
        is_active: false,
        confidence: 1,
      },
    ],
  });
  assertEquals(block.includes("Atende sozinha"), true);
  assertEquals(block.includes("Pediu ajuda com sinal"), true);
  assertEquals(block.includes("SEGREDO DE OUTRA LEAD"), false);
  assertEquals(block.includes("Fato supersedido"), false);
});

Deno.test("formatCanonicalLeadContext: Instagram e interno do piloto não entram no prompt", () => {
  const block = formatCanonicalLeadContext({
    state: makeState({
      facts: {
        harness: {
          greeting: "Andressa",
          instagram_handle: "espaco_andressamanoel",
          cohort: "pilot-v1-shortlist-d3",
          pilot_order: 10,
          resume_exception: false,
        },
      },
    }),
    leadId: LEAD_ID,
    productId: PRODUCT_A,
    memories: [],
  });
  assertEquals(block.includes("espaco_andressamanoel"), false);
  assertEquals(block.includes("pilot-v1"), false);
  assertEquals(block.includes("Andressa"), true);
});

Deno.test("ensureCanonicalLeadState: accepts create and existing-state conflict", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const created = await ensureCanonicalLeadState(
    {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: { ok: true, version: 1, created: true }, error: null };
      },
    },
    LEAD_ID,
    PRODUCT_A,
  );
  assertEquals(created, true);
  assertEquals(calls[0]?.p_expected_version, 0);

  const existing = await ensureCanonicalLeadState(
    {
      rpc: async () => ({
        data: { ok: false, conflict: true, current_version: 3 },
        error: null,
      }),
    },
    LEAD_ID,
    PRODUCT_A,
  );
  assertEquals(existing, true);
});

Deno.test("ensureCanonicalLeadState: fails closed on RPC error", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const ready = await ensureCanonicalLeadState(
      {
        rpc: async () => ({
          data: null,
          error: { message: "rpc unavailable" },
        }),
      },
      LEAD_ID,
      PRODUCT_A,
    );
    assertEquals(ready, false);
  } finally {
    console.error = originalError;
  }
});

Deno.test("loadCanonicalLeadContext: returns formatted ready snapshot", async () => {
  const loaded = await loadCanonicalLeadContext(
    {
      rpc: async () => ({
        data: {
          state: makeState({ summary: "Agenda no WhatsApp." }),
          memories: [
            {
              lead_id: LEAD_ID,
              product_id: PRODUCT_A,
              content: "Atende sozinha.",
              memory_type: "fact",
              is_active: true,
              confidence: 1,
            },
          ],
        },
        error: null,
      }),
    },
    LEAD_ID,
    PRODUCT_A,
  );
  assertEquals(loaded.isReady, true);
  assertEquals(loaded.prompt.includes("Agenda no WhatsApp"), true);
  assertEquals(loaded.prompt.includes("Atende sozinha"), true);
});

Deno.test("loadCanonicalLeadContext: missing state fails closed", async () => {
  const loaded = await loadCanonicalLeadContext(
    {
      rpc: async () => ({
        data: { state: null, memories: [] },
        error: null,
      }),
    },
    LEAD_ID,
    PRODUCT_A,
  );
  assertEquals(loaded.isReady, false);
  assertEquals(loaded.prompt, "");
});

Deno.test("appendCanonicalLeadMemory: uses deterministic message provenance", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const ok = await appendCanonicalLeadMemory(
    {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: { ok: true, created: true }, error: null };
      },
    },
    {
      leadId: LEAD_ID,
      productId: PRODUCT_A,
      conversationId: CONV_ID,
      messageId: MSG_ID,
      content: "Atendo sozinha.",
    },
  );
  assertEquals(ok, true);
  assertEquals(
    calls[0]?.p_idempotency_key,
    `msg:${CONV_ID}:${MSG_ID}`,
  );
  assertEquals(calls[0]?.p_source_type, "message");
});

Deno.test("appendCanonicalLeadMemory: empty content fails closed without RPC", async () => {
  let called = false;
  const ok = await appendCanonicalLeadMemory(
    {
      rpc: async () => {
        called = true;
        return { data: { ok: true }, error: null };
      },
    },
    {
      leadId: LEAD_ID,
      productId: PRODUCT_A,
      conversationId: CONV_ID,
      messageId: MSG_ID,
      content: "   ",
    },
  );
  assertEquals(ok, false);
  assertEquals(called, false);
});
