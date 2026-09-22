import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLD_HOW_ARE_YOU_REPLY,
  burstAsksCamilaHowSheIs,
  goldHowAreYouReply,
  goldReplyFromHistory,
  isStandaloneAskCamila,
  pendingTicketText,
  pickAssertiveInbound,
  scoreInboundCite,
  selectAssertiveCite,
} from "./inbound-cite.ts";

Deno.test("Andressa: E vc? vence Tudo bem e os cumprimentos", () => {
  assertEquals(
    selectAssertiveCite(["Oiii", "Bom dia", "Tudo bem", "E vc?"]),
    "E vc?",
  );
});

Deno.test("E você / E vc sem interrogação também é pergunta à Camila", () => {
  assertEquals(isStandaloneAskCamila("E vc"), true);
  assertEquals(isStandaloneAskCamila("E você"), true);
  assertEquals(isStandaloneAskCamila("e voce"), true);
  assertEquals(isStandaloneAskCamila("E vc?"), true);
  assertEquals(
    selectAssertiveCite(["Oiii", "Bom dia", "Tudo bem", "E vc"]),
    "E vc",
  );
});

Deno.test("contexto da rajada: Tudo bem + E vc (sem ?) pede o ouro", () => {
  const burst = ["Oiii", "Bom dia", "Tudo bem", "E vc"];
  assertEquals(burstAsksCamilaHowSheIs(burst), true);
  assertEquals(goldHowAreYouReply(burst), GOLD_HOW_ARE_YOU_REPLY);
  assertEquals(
    GOLD_HOW_ARE_YOU_REPLY,
    "Estou bem, também. Obrigada por perguntar 🥰",
  );
});

Deno.test("mesma bolha: E você, tudo bem? / E vc tb ainda é ouro", () => {
  assertEquals(isStandaloneAskCamila("E você, tudo bem?"), true);
  assertEquals(isStandaloneAskCamila("E vc tb"), true);
  assertEquals(goldHowAreYouReply(["E você, tudo bem?"]), GOLD_HOW_ARE_YOU_REPLY);
});

Deno.test("e você tem agenda? NÃO é ouro — é outra pergunta", () => {
  assertEquals(isStandaloneAskCamila("e você tem agenda?"), false);
  assertEquals(goldHowAreYouReply(["e você tem agenda?"]), null);
  assertEquals(
    scoreInboundCite("e você tem agenda?") < scoreInboundCite("E vc"),
    true,
  );
});

Deno.test("pergunta à Camila vence 'tudo bem' sem interrogação", () => {
  assertEquals(scoreInboundCite("E vc?") > scoreInboundCite("Tudo bem"), true);
  assertEquals(selectAssertiveCite(["Tudo bem", "E vc?"]), "E vc?");
  assertEquals(selectAssertiveCite(["E vc?", "como você está?"]), "como você está?");
});

Deno.test("sem pergunta clara, fica a última", () => {
  assertEquals(selectAssertiveCite(["Certo", "Beleza"]), "Beleza");
});

Deno.test("ouro olha a fala deste bilhete, não o e vc antigo", () => {
  const historyDesc = [
    { id: "now", direction: "inbound", sender_type: "visitor", content: "Como funciona?" },
    { direction: "outbound", sender_type: "agent", content: "Oi" },
    { id: "old", direction: "inbound", sender_type: "visitor", content: "E vc?" },
  ];
  assertEquals(pendingTicketText({
    messages: historyDesc,
    pendingInboundId: "now",
    fallback: "E vc?",
  }), "Como funciona?");
  assertEquals(goldReplyFromHistory(historyDesc, "Como funciona?"), null);
  assertEquals(goldReplyFromHistory(historyDesc, "E vc?"), GOLD_HOW_ARE_YOU_REPLY);
});

Deno.test("pickAssertiveInbound ignora outbound depois da rajada", () => {
  const historyDesc = [
    { direction: "outbound", sender_type: "agent", content: "bolha 4" },
    { direction: "outbound", sender_type: "agent", content: "bolha 3" },
    { direction: "inbound", sender_type: "visitor", content: "E vc" },
    { direction: "inbound", sender_type: "visitor", content: "Tudo bem" },
    { direction: "inbound", sender_type: "visitor", content: "Bom dia" },
    { direction: "inbound", sender_type: "visitor", content: "Oiii" },
    { direction: "outbound", sender_type: "agent", content: "bolha 2" },
  ];
  const picked = pickAssertiveInbound(historyDesc);
  assertEquals(picked?.content, "E vc");
});
