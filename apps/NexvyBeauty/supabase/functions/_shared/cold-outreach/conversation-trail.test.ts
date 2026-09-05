import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  assessConversationTrail,
  formatTrailConductorBlock,
  isAgendaDiagnostic,
  type TrailMessage,
} from "./conversation-trail.ts";

/** Jeissiane-like: qualificação feita + pergunta agenda OUT sem resposta humana nova */
const JEISSIANE_MSGS: TrailMessage[] = [
  {
    direction: "outbound",
    sender_type: "agent",
    content: "Oi, Jeissiane! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
    created_at: "2026-09-02T03:06:00Z",
  },
  {
    direction: "inbound",
    sender_type: "visitor",
    content: "Oi Camila, tudo bem. Atendo no meu espaço, só eu.",
    created_at: "2026-09-02T14:00:00Z",
  },
  {
    direction: "outbound",
    sender_type: "agent",
    content:
      "Que legal ter o espaço próprio! E aí, você usa algum sistema pra agenda hoje, ou é tudo no caderno e no WhatsApp?",
    created_at: "2026-09-02T14:01:00Z",
  },
];

Deno.test("Jeissiane-like → bridge_diagnostic_to_value (não wait)", () => {
  const a = assessConversationTrail(JEISSIANE_MSGS);
  assertEquals(a.nextAction, "bridge_diagnostic_to_value");
  assertEquals(a.lastBeat, "diagnostic_agenda");
  assertEquals(a.recommendPassiveWait, false);
  assertStringIncludes(a.hint.toLowerCase(), "perguntei porque");
  assertStringIncludes(a.hint.toLowerCase(), "faz sentido");
});

Deno.test("silence after opening → mode_a_r1_r2", () => {
  const msgs: TrailMessage[] = [
    {
      direction: "outbound",
      sender_type: "agent",
      content: "Oi, Expert! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:06:00Z",
    },
  ];
  const a = assessConversationTrail(msgs);
  assertEquals(a.nextAction, "mode_a_r1_r2");
  assertEquals(a.lastBeat, "opening");
  assertEquals(a.recommendPassiveWait, false);
});

Deno.test("greeting before R1 → mode_b_eco_r1_r2", () => {
  const msgs: TrailMessage[] = [
    {
      direction: "outbound",
      sender_type: "agent",
      content: "Oi, Deise! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:06:00Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Bom dia! Tudo bem sim e com você?",
      created_at: "2026-09-02T13:51:00Z",
    },
  ];
  const a = assessConversationTrail(msgs);
  assertEquals(a.nextAction, "mode_b_eco_r1_r2");
  assertEquals(a.recommendPassiveWait, false);
});

Deno.test("isAgendaDiagnostic reconhece caderno/WhatsApp", () => {
  assertEquals(
    isAgendaDiagnostic("usa algum sistema pra agenda hoje, ou é tudo no caderno e no WhatsApp?"),
    true,
  );
  assertEquals(isAgendaDiagnostic("Posso te contar rapidinho?"), false);
});

Deno.test("formatTrailConductorBlock menciona CONDUTOR", () => {
  const a = assessConversationTrail(JEISSIANE_MSGS);
  const block = formatTrailConductorBlock(a);
  assertStringIncludes(block, "CONDUTOR DA TRILHA");
  assertStringIncludes(block, "bridge_diagnostic_to_value");
});

Deno.test("msgs em ordem desc (como loadMessages) ainda detectam ponte", () => {
  const desc = [...JEISSIANE_MSGS].reverse();
  const a = assessConversationTrail(desc);
  assertEquals(a.nextAction, "bridge_diagnostic_to_value");
});
