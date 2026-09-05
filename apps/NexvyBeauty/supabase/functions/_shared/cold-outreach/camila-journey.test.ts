// deno test — F5 jornada + F6 fecho (0 WA).
//   deno test --allow-env supabase/functions/_shared/cold-outreach/camila-journey.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  camilaCloseGuard,
  extractCamilaJourneyFacts,
  formatCamilaJourneyBlock,
} from "./camila-journey.ts";
import { assessConversationTrail, type TrailMessage } from "./conversation-trail.ts";
import { sellsB2bWithCheckout } from "../agent-routing.ts";

const jeissianeLike: TrailMessage[] = [
  {
    direction: "outbound",
    sender_type: "bot",
    content: "Oi! Sou a Camila da NexvyBeauty…",
    created_at: "2026-09-02T03:00:00.000Z",
  },
  {
    direction: "inbound",
    sender_type: "visitor",
    content: "Bom dia! Tenho espaço próprio sim, atendo sozinha.",
    created_at: "2026-09-02T12:00:00.000Z",
  },
  {
    direction: "outbound",
    sender_type: "bot",
    content:
      "Que legal ter o espaço próprio! E aí, você usa algum sistema pra agenda hoje, ou é tudo no caderno e no WhatsApp?",
    created_at: "2026-09-02T12:01:00.000Z",
  },
];

Deno.test("F5: Jeissiane-like → espaco_proprio + atende_sozinha", () => {
  const facts = extractCamilaJourneyFacts(jeissianeLike);
  assertEquals(facts.includes("espaco_proprio"), true);
  assertEquals(facts.includes("atende_sozinha"), true);
  const block = formatCamilaJourneyBlock(facts);
  assertEquals(block.includes("PROIBIDO perguntar de novo"), true);
  assertEquals(block.includes("espaço/sala própria"), true);
});

Deno.test("F5: negação NÃO vira fato", () => {
  const msgs: TrailMessage[] = [
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Não tenho espaço próprio, atendo na casa da cliente",
    },
  ];
  assertEquals(extractCamilaJourneyFacts(msgs).includes("espaco_proprio"), false);
});

Deno.test("F5: outbound da Camila NÃO conta como fato da lead", () => {
  const msgs: TrailMessage[] = [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Você tem espaço próprio ou atende como autônoma?",
    },
  ];
  assertEquals(extractCamilaJourneyFacts(msgs).length, 0);
});

Deno.test("F6: após diagnóstico, forbidColdR1 (não volta ao R1 frio)", () => {
  const trail = assessConversationTrail(jeissianeLike);
  assertEquals(trail.nextAction, "bridge_diagnostic_to_value");
  const g = camilaCloseGuard({
    nextAction: trail.nextAction,
    lastInboundText: "",
  });
  assertEquals(g.forbidColdR1, true);
});

Deno.test("F6: 'quero ver' → expectDemoIntent + forbidColdR1", () => {
  const g = camilaCloseGuard({
    nextAction: "advance_next_beat",
    lastInboundText: "quero ver como funciona",
  });
  assertEquals(g.expectDemoIntent, true);
  assertEquals(g.forbidColdR1, true);
  assertEquals(g.expectCheckoutIntent, false);
});

Deno.test("F6: 'quero contratar' → expectCheckoutIntent", () => {
  const g = camilaCloseGuard({
    nextAction: "describe_product_after_yes",
    lastInboundText: "quero contratar, manda o link",
  });
  assertEquals(g.expectCheckoutIntent, true);
  assertEquals(g.forbidColdR1, true);
});

Deno.test("F6: prospector vende/fecha no brain (sellsB2bWithCheckout)", () => {
  assertEquals(
    sellsB2bWithCheckout({
      id: "c",
      name: "Camila · Prospecção",
      agent_type: "prospector",
    }),
    true,
  );
});
