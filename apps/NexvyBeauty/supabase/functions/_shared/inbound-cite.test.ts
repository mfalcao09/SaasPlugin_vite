import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  pickAssertiveInbound,
  scoreInboundCite,
  selectAssertiveCite,
} from "./inbound-cite.ts";

Deno.test("Andressa: E vc? vence Tudo bem (afirmação) e os cumprimentos", () => {
  assertEquals(
    selectAssertiveCite(["Oiii", "Bom dia", "Tudo bem", "E vc?"]),
    "E vc?",
  );
});

Deno.test("pergunta à Camila vence 'tudo bem' sem interrogação", () => {
  assertEquals(
    scoreInboundCite("E vc?") > scoreInboundCite("Tudo bem"),
    true,
  );
  assertEquals(selectAssertiveCite(["Tudo bem", "E vc?"]), "E vc?");
  assertEquals(selectAssertiveCite(["E vc?", "como você está?"]), "como você está?");
});

Deno.test("sem pergunta clara, fica a última", () => {
  assertEquals(selectAssertiveCite(["Certo", "Beleza"]), "Beleza");
});

Deno.test("pickAssertiveInbound ignora outbound depois da rajada", () => {
  const historyDesc = [
    { direction: "outbound", sender_type: "agent", content: "bolha 4" },
    { direction: "outbound", sender_type: "agent", content: "bolha 3" },
    { direction: "inbound", sender_type: "visitor", content: "E vc?" },
    { direction: "inbound", sender_type: "visitor", content: "Tudo bem" },
    { direction: "inbound", sender_type: "visitor", content: "Bom dia" },
    { direction: "inbound", sender_type: "visitor", content: "Oiii" },
    { direction: "outbound", sender_type: "agent", content: "bolha 2" },
  ];
  const picked = pickAssertiveInbound(historyDesc);
  assertEquals(picked?.content, "E vc?");
});
