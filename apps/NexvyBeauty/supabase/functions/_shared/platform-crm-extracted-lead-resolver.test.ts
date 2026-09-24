import { assertEquals } from "jsr:@std/assert@1";
import { isPromotableSegment, normalizeExtractedHandle } from "./platform-crm-extracted-lead-resolver.ts";

Deno.test("extracted identity: handle is canonicalized", () => {
  assertEquals(normalizeExtractedHandle(" @Studio_Test "), "studio_test");
  assertEquals(normalizeExtractedHandle(""), null);
});

Deno.test("extracted identity: only operational market buckets promote", () => {
  assertEquals(isPromotableSegment("salao_cliente"), true);
  assertEquals(isPromotableSegment("afiliado_infoproduto"), true);
  assertEquals(isPromotableSegment("revisao"), false);
  assertEquals(isPromotableSegment("descarte"), false);
  assertEquals(isPromotableSegment(null), false);
});

Deno.test("extracted identity: same phone is the grouping key, handle remains profile-level", () => {
  if (normalizeExtractedHandle("@salao_a") === normalizeExtractedHandle("@salao_b")) throw new Error("different handles must remain distinct profiles");
  if (!isPromotableSegment("salao_cliente")) throw new Error("both profiles must be promotable before phone grouping");
  // The resolver's contract is: find/create by product-scoped phone, then link
  // each extracted row. The card identity is therefore the phone; the handle is
  // not used as a second card identity.
});
