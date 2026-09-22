import { assertEquals } from "jsr:@std/assert@1";
import {
  OPAQUE_CLARIFY,
  PRODUCT_EXPLAIN_NO_PRICE,
  allowlistFromPlans,
  bubblesAfterCommercialTruth,
  enforceBubbleBudget,
  isOpaqueInbound,
  looksTruncated,
  validateCommercialTruth,
} from "./commercial-truth.ts";

const plans = [
  {
    name: "Essencial",
    price_monthly: 275,
    list_price_monthly: 450,
    checkout_url: "https://pay.example/essencial",
  },
];

Deno.test("PRD-06: allowlist includes price and seller-tagged checkout", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  assertEquals(allow.prices.includes(275), true);
  assertEquals(allow.prices.includes(450), true);
  assertEquals(allow.urls.some((u) => u.includes("pay.example/essencial")), true);
  assertEquals(allow.urls.some((u) => u.includes("src=camila")), true);
});

Deno.test("PRD-06: real price and checkout pass", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  const r = validateCommercialTruth([
    "Hoje sai por R$275: https://pay.example/essencial?src=camila",
  ], allow);
  assertEquals(r.ok, true);
  assertEquals(r.bubbles.length, 1);
});

Deno.test("PRD-06: invented price fails closed", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  const r = validateCommercialTruth(["Fica R$99 por mês"], allow);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "invented_price");
  assertEquals(r.bubbles, [OPAQUE_CLARIFY]);
});

Deno.test("PRD-06: invented URL is stripped and marked", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  const r = validateCommercialTruth([
    "Segue https://evil.example/pay e te ajudo",
  ], allow);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "invented_url");
  assertEquals(r.bubbles[0].includes("evil.example"), false);
});

Deno.test("PRD-06: opaque inbound detection", () => {
  assertEquals(isOpaqueInbound("pix taxa"), true);
  assertEquals(isOpaqueInbound("e o..."), true);
  assertEquals(isOpaqueInbound("[áudio]"), true);
  assertEquals(isOpaqueInbound("quero contratar"), false);
  assertEquals(isOpaqueInbound("quanto custa?"), false);
  assertEquals(isOpaqueInbound("é robô?"), false);
});

Deno.test("PRD-06: bubble budget max 2 and drops truncated", () => {
  assertEquals(looksTruncated("quero ver o produto..."), true);
  const capped = enforceBubbleBudget([
    "Primeira bolha ok.",
    "Segunda bolha ok.",
    "Terceira sobra.",
    "Texto truncado...",
  ]);
  assertEquals(capped.length, 2);
  assertEquals(capped[0], "Primeira bolha ok.");
  assertEquals(capped[1], "Segunda bolha ok.");
});

Deno.test("PRD-06: raiox /implantacao URL is allowed without being a checkout", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  const r = validateCommercialTruth([
    "Segue o link: https://app.nexvybeauty.com.br/implantacao/demo-1",
  ], allow);
  assertEquals(r.ok, true);
  assertEquals(r.bubbles[0].includes("implantacao"), true);
});

Deno.test("PRD-06: non-Nexvy /implantacao/ URL is rejected", () => {
  const allow = allowlistFromPlans(plans, "Camila");
  const r = validateCommercialTruth([
    "Segue https://evil.com/implantacao/phish",
  ], allow);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "invented_url");
  assertEquals(r.bubbles[0].includes("evil.com"), false);
});

Deno.test("PRD-06: filtro vazio vira explicação do produto, sem preço", () => {
  const filled = bubblesAfterCommercialTruth({
    ok: true,
    reason: null,
    bubbles: ["Já te explico."],
    inventedPrices: [],
    inventedUrls: [],
  });
  assertEquals(filled, ["Já te explico."]);

  const empty = bubblesAfterCommercialTruth({
    ok: false,
    reason: "invented_url",
    bubbles: [],
    inventedPrices: [],
    inventedUrls: ["https://evil.com"],
  });
  assertEquals(empty, [PRODUCT_EXPLAIN_NO_PRICE]);
  assertEquals(empty[0].includes("R$"), false);
  assertEquals(empty[0].toLowerCase().includes("http"), false);
});
