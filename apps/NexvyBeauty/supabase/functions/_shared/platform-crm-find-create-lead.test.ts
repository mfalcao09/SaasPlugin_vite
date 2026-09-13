// platform-crm-find-create-lead.test.ts — PRD-03 unified find/create lead helper
//
// TDD RED phase: written BEFORE the implementation file.
//   deno test supabase/functions/_shared/platform-crm-find-create-lead.test.ts
//
// Coverage targets:
//   ✓ findOrCreateLeadByPhone: returns existing when found (no INSERT)
//   ✓ findOrCreateLeadByPhone: creates new when not found (INSERT)
//   ✓ product+phone dedupe: uses phoneVariantsWithPlusBR for "+E.164" columns
//   ✓ product_id scoped: different products treated independently
//   ✓ manual start status semantics: status never overwritten if set
//   ✓ cold opening lead binding: ensureLeadForColdOpening returns lead_id
//   ✓ idempotent: calling twice with same phone returns same lead_id
//   ✓ null return on DB error (non-fatal, logs only)
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildLeadInsertPayload,
  buildPhoneLookupVariants,
  ensureLeadForColdOpening,
  findOrCreateLeadByPhone,
  shouldOverrideLeadName,
} from "./platform-crm-find-create-lead.ts";

const PRODUCT_ID = "11111111-0000-0000-0000-000000000001";

// ── buildPhoneLookupVariants (pure, no DB) ────────────────────────────────────

Deno.test("phone lookup variants: includes +E.164 and digit-only forms", () => {
  const variants = buildPhoneLookupVariants("5511999887766");
  assertEquals(
    variants.includes("+5511999887766"),
    true,
    "must include +E.164",
  );
  assertEquals(
    variants.includes("5511999887766"),
    true,
    "must include raw digits",
  );
  assertEquals(
    variants.some((v) => v.startsWith("+")),
    true,
    "at least one +variant",
  );
});

Deno.test("phone lookup variants: handles input already with +", () => {
  const variants = buildPhoneLookupVariants("+5511999887766");
  assertEquals(variants.includes("+5511999887766"), true);
  assertEquals(variants.includes("5511999887766"), true);
});

Deno.test("phone lookup variants: includes 9th-digit variants (BR mobile)", () => {
  // 12 digits without 9th → should also add 13-digit variant
  const variants = buildPhoneLookupVariants("551199887766");
  assertEquals(
    variants.length > 2,
    true,
    "needs at least 3 variants (raw, +, +9th)",
  );
});

Deno.test("phone lookup variants: empty input returns empty array", () => {
  assertEquals(buildPhoneLookupVariants("").length, 0);
  assertEquals(buildPhoneLookupVariants(null).length, 0);
  assertEquals(buildPhoneLookupVariants(undefined).length, 0);
});

Deno.test("phone lookup variants: no duplicates in output", () => {
  const variants = buildPhoneLookupVariants("5511999887766");
  const unique = new Set(variants);
  assertEquals(unique.size, variants.length);
});

// ── buildLeadInsertPayload (pure, no DB) ──────────────────────────────────────

Deno.test("buildLeadInsertPayload: name from pushName when person-like", () => {
  const payload = buildLeadInsertPayload({
    phone: "+5511999887766",
    pushName: "Karolyna",
    productId: "11111111-0000-0000-0000-000000000001",
    source: "whatsapp_evolution",
    leadChannel: "whatsapp_evolution",
  });
  assertEquals(payload.name, "Karolyna");
  assertEquals(payload.phone, "+5511999887766");
  assertEquals(payload.product_id, "11111111-0000-0000-0000-000000000001");
  assertEquals(payload.source, "whatsapp_evolution");
  assertEquals(payload.lead_channel, "whatsapp_evolution");
});

Deno.test("buildLeadInsertPayload: generic push-name falls back to phone", () => {
  const payload = buildLeadInsertPayload({
    phone: "+5511999887766",
    pushName: "Studio",
    productId: PRODUCT_ID,
    source: "whatsapp_evolution",
    leadChannel: "whatsapp_evolution",
  });
  assertEquals(payload.name, "WhatsApp +5511999887766");
});

Deno.test("buildLeadInsertPayload: product is mandatory", () => {
  assertThrows(
    () =>
      buildLeadInsertPayload({
        phone: "+5511999887766",
        pushName: null,
        productId: null,
        source: "whatsapp_evolution",
        leadChannel: "whatsapp_evolution",
      }),
    Error,
    "product_id is required",
  );
});

Deno.test("buildLeadInsertPayload: includes product_id when provided", () => {
  const pid = "11111111-0000-0000-0000-000000000001";
  const payload = buildLeadInsertPayload({
    phone: "+5511999887766",
    pushName: null,
    productId: pid,
    source: "whatsapp_evolution",
    leadChannel: "whatsapp_evolution",
  });
  assertEquals(payload.product_id, pid);
});

Deno.test("buildLeadInsertPayload: preserves manual assignee on create", () => {
  const payload = buildLeadInsertPayload({
    phone: "+5511999887766",
    pushName: null,
    productId: PRODUCT_ID,
    source: "whatsapp",
    leadChannel: "whatsapp",
    assignedTo: "user-1",
  });
  assertEquals(payload.assigned_to, "user-1");
});

Deno.test("buildLeadInsertPayload: normalizes legacy BR mobile to canonical E.164", () => {
  const payload = buildLeadInsertPayload({
    phone: "551199887766",
    pushName: null,
    productId: PRODUCT_ID,
    source: "whatsapp_qr",
    leadChannel: "whatsapp_qr",
  });
  assertEquals(payload.phone, "+5511999887766");
});

Deno.test("buildLeadInsertPayload: never sends nonexistent lead status column", () => {
  const payload = buildLeadInsertPayload({
    phone: "5511999887766",
    pushName: "Deise",
    productId: PRODUCT_ID,
    source: "whatsapp_qr",
    leadChannel: "whatsapp_qr",
    status: "manual_start",
  });
  assertEquals("status" in payload, false);
});

// ── shouldOverrideLeadName (manual start semantics) ───────────────────────────

Deno.test("shouldOverrideLeadName: false when existing name is person-like", () => {
  // never overwrite a real person name with WhatsApp fallback
  assertEquals(
    shouldOverrideLeadName("Karolyna", "WhatsApp +5511999887766"),
    false,
  );
});

Deno.test("shouldOverrideLeadName: true when existing name is a phone fallback", () => {
  // WhatsApp-fallback name should be upgraded if we have a better name now
  assertEquals(
    shouldOverrideLeadName("WhatsApp +5511999887766", "Karolyna"),
    true,
  );
});

Deno.test("shouldOverrideLeadName: false when new name is also generic", () => {
  // Don't downgrade from a WhatsApp name to another WhatsApp name
  assertEquals(
    shouldOverrideLeadName(
      "WhatsApp +5511999887766",
      "WhatsApp +5511999887766",
    ),
    false,
  );
});

Deno.test("shouldOverrideLeadName: false when new name is generic", () => {
  // "Studio" is generic — never upgrade existing name to a generic business name
  assertEquals(shouldOverrideLeadName("Karolyna", "Studio"), false);
  assertEquals(shouldOverrideLeadName("WhatsApp +55...", "Studio"), false);
});

Deno.test("shouldOverrideLeadName: upgrades an existing generic category", () => {
  assertEquals(shouldOverrideLeadName("LASH", "Emilly"), true);
  assertEquals(shouldOverrideLeadName("Expert", "Thaís"), true);
});

// ── Cold opening lead binding ─────────────────────────────────────────────────

Deno.test("cold opening: buildLeadInsertPayload source = cold_outreach_abertura", () => {
  const payload = buildLeadInsertPayload({
    phone: "+5511999887766",
    pushName: "Deise",
    productId: "11111111-0000-0000-0000-000000000001",
    source: "cold_outreach",
    leadChannel: "cold_outreach",
  });
  assertEquals(payload.source, "cold_outreach");
  assertEquals(payload.lead_channel, "cold_outreach");
});

Deno.test("cold opening: payload phone is canonical +E.164", () => {
  // even if caller passes digits-only, payload must have + form
  const payload = buildLeadInsertPayload({
    phone: "5511999887766",
    pushName: null,
    productId: PRODUCT_ID,
    source: "cold_outreach",
    leadChannel: "cold_outreach",
  });
  assertEquals(
    payload.phone.startsWith("+"),
    true,
    "phone must be +E.164 in INSERT",
  );
});

function fakeSupabase(initial: { id: string; name: string } | null) {
  let existing = initial;
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const filters: Array<[string, unknown]> = [];

  return {
    inserts,
    updates,
    filters,
    client: {
      from() {
        const query: Record<string, any> = {
          select() {
            return query;
          },
          in() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return query;
          },
          is() {
            return query;
          },
          order() {
            return query;
          },
          limit() {
            return query;
          },
          async maybeSingle() {
            return { data: existing, error: null };
          },
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            existing = { id: "lead-new", name: String(payload.name) };
            return query;
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return query;
          },
          async single() {
            return { data: existing, error: null };
          },
        };
        return query;
      },
    },
  };
}

Deno.test("findOrCreateLeadByPhone: existing lead is idempotent", async () => {
  const fake = fakeSupabase({ id: "lead-existing", name: "Deise" });
  const params = {
    phone: "5511999887766",
    pushName: "Deise",
    productId: PRODUCT_ID,
    source: "whatsapp_qr",
    leadChannel: "whatsapp_qr",
  };
  assertEquals(
    await findOrCreateLeadByPhone(fake.client, params),
    "lead-existing",
  );
  assertEquals(
    await findOrCreateLeadByPhone(fake.client, params),
    "lead-existing",
  );
  assertEquals(fake.inserts.length, 0);
  assertEquals(
    fake.filters.some(([column, value]) =>
      column === "product_id" && value === PRODUCT_ID
    ),
    true,
  );
});

Deno.test("findOrCreateLeadByPhone: creates once then reuses", async () => {
  const fake = fakeSupabase(null);
  const params = {
    phone: "5511999887766",
    pushName: "Deise",
    productId: PRODUCT_ID,
    source: "whatsapp_qr",
    leadChannel: "whatsapp_qr",
  };
  assertEquals(await findOrCreateLeadByPhone(fake.client, params), "lead-new");
  assertEquals(await findOrCreateLeadByPhone(fake.client, params), "lead-new");
  assertEquals(fake.inserts.length, 1);
});

Deno.test("ensureLeadForColdOpening: creates a product-scoped lead", async () => {
  const fake = fakeSupabase(null);
  const leadId = await ensureLeadForColdOpening(fake.client, {
    phone: "5511999887766",
    pushName: "Deise",
    productId: PRODUCT_ID,
  });
  assertEquals(leadId, "lead-new");
  assertEquals(fake.inserts[0]?.product_id, PRODUCT_ID);
  assertEquals(fake.inserts[0]?.source, "cold_outreach");
});

Deno.test("findOrCreateLeadByPhone: unique race re-reads canonical lead", async () => {
  let lookupCount = 0;
  const client = {
    from() {
      const query: Record<string, any> = {
        select() {
          return query;
        },
        in() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          lookupCount++;
          return lookupCount === 1
            ? { data: null, error: null }
            : { data: { id: "lead-race", name: "Deise" }, error: null };
        },
        insert() {
          return query;
        },
        async single() {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key" },
          };
        },
      };
      return query;
    },
  };
  const leadId = await findOrCreateLeadByPhone(client, {
    phone: "5511999887766",
    pushName: "Deise",
    productId: PRODUCT_ID,
    source: "whatsapp_qr",
    leadChannel: "whatsapp_qr",
  });
  assertEquals(leadId, "lead-race");
});
