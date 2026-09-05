import { assertEquals } from "jsr:@std/assert@1";
import {
  decideCamilaWake,
  INCIDENT_ALLOWLIST,
  type CamilaWakeInput,
} from "./camila-conductor-policy.ts";
import type { TrailMessage } from "./conversation-trail.ts";

/** Quarta 2026-09-02 16:00 BRT = 19:00 UTC */
const NOW_16BRT = new Date("2026-09-02T19:00:00.000Z");
/** Quarta 03:00 BRT = 06:00 UTC */
const NOW_03BRT = new Date("2026-09-02T06:00:00.000Z");

const DEISE_ID = "7e427cd4-5181-445d-9eb1-f05906b8f42d";
const EXPERT_ID = "e882518f-5ebd-457d-8c3c-dc33f400a7a1";
const JEISSIANE_ID = "db870f09-54d1-4e1b-a221-6af8fb24788f";
const ELLAS_ID = "01385b74-29ab-4044-bf10-3a2bcc26928c";
const EMILLY_ID = "db7991a9-df6c-4665-8d9b-481b1cc48d53";

function deiseMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Oi, Deise! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:05:58.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Bom dia! Tudo bem sim e com você?",
      created_at: "2026-09-02T13:51:19.000Z",
    },
  ];
}

function ellasMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Oi, Ellas! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:06:01.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Bom dia",
      created_at: "2026-09-02T13:34:36.000Z",
    },
  ];
}

function expertMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Oi, Expert! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:06:01.000Z",
    },
  ];
}

function emillyMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Oi, LASH! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️",
      created_at: "2026-09-02T03:06:08.000Z",
    },
  ];
}

function jeissianeMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Oi, Studio! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty",
      created_at: "2026-09-02T03:06:05.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Bom dia,tudo sim e com você?",
      created_at: "2026-09-02T11:54:05.000Z",
    },
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Tenho uma sala onde atendo — só você?",
      created_at: "2026-09-02T11:55:00.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Só eu mesma",
      created_at: "2026-09-02T11:56:17.000Z",
    },
    {
      direction: "outbound",
      sender_type: "bot",
      content:
        "Hoje você usa algum sistema pra agenda, ou é mais caderno e WhatsApp mesmo?",
      created_at: "2026-09-02T11:56:41.000Z",
    },
  ];
}

function decide(partial: Partial<CamilaWakeInput> & Pick<CamilaWakeInput, "conversationId" | "messages" | "now">) {
  return decideCamilaWake({
    lastWakeAtMs: null,
    wakesInLastHour: 0,
    ...partial,
  });
}

Deno.test("allowlist tem exatamente as 5 do incidente", () => {
  assertEquals(INCIDENT_ALLOWLIST.size, 5);
  assertEquals(INCIDENT_ALLOWLIST.has(DEISE_ID), true);
  assertEquals(INCIDENT_ALLOWLIST.has(EMILLY_ID), true);
});

Deno.test("Deise 16h BRT → debt due (Mode B)", () => {
  const d = decide({ conversationId: DEISE_ID, messages: deiseMsgs(), now: NOW_16BRT });
  assertEquals(d.kind, "debt");
  assertEquals(d.due, true);
  assertEquals(d.nextAction, "mode_b_eco_r1_r2");
});

Deno.test("Ellas 16h BRT → debt due", () => {
  const d = decide({ conversationId: ELLAS_ID, messages: ellasMsgs(), now: NOW_16BRT });
  assertEquals(d.kind, "debt");
  assertEquals(d.due, true);
});

Deno.test("Jeissiane 16h BRT → conduct due (ponte)", () => {
  const d = decide({ conversationId: JEISSIANE_ID, messages: jeissianeMsgs(), now: NOW_16BRT });
  assertEquals(d.kind, "conduct");
  assertEquals(d.due, true);
  assertEquals(d.nextAction, "bridge_diagnostic_to_value");
});

Deno.test("Expert 16h BRT → cold_resume due", () => {
  const d = decide({ conversationId: EXPERT_ID, messages: expertMsgs(), now: NOW_16BRT });
  assertEquals(d.kind, "cold_resume");
  assertEquals(d.due, true);
  assertEquals(d.nextAction, "mode_a_r1_r2");
});

Deno.test("Emilly 16h BRT → cold_resume due", () => {
  const d = decide({ conversationId: EMILLY_ID, messages: emillyMsgs(), now: NOW_16BRT });
  assertEquals(d.kind, "cold_resume");
  assertEquals(d.due, true);
});

Deno.test("Expert 03h BRT → outside_window", () => {
  const d = decide({ conversationId: EXPERT_ID, messages: expertMsgs(), now: NOW_03BRT });
  assertEquals(d.kind, "noop");
  assertEquals(d.due, false);
  assertEquals(d.reason, "outside_window");
});

Deno.test("uuid fora da allowlist → scope_v1", () => {
  const d = decide({
    conversationId: "00000000-0000-0000-0000-000000000000",
    messages: expertMsgs(),
    now: NOW_16BRT,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.reason, "scope_v1");
});

Deno.test("cooldown 2h bloqueia debt", () => {
  const d = decide({
    conversationId: DEISE_ID,
    messages: deiseMsgs(),
    now: NOW_16BRT,
    lastWakeAtMs: NOW_16BRT.getTime() - 30 * 60 * 1000,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.reason, "cooldown_2h");
});

/** Quinta 18:05 BRT = 21:05 UTC — fora da janela comercial 9–18, dentro da dívida ativa 8–22 */
const NOW_1805BRT = new Date("2026-09-03T21:05:00.000Z");
/** Quinta 20:00 BRT = 23:00 UTC */
const NOW_20BRT = new Date("2026-09-03T23:00:00.000Z");
/** Quinta 23:00 BRT = 02:00 UTC+1 → 2026-09-04T02:00Z */
const NOW_23BRT = new Date("2026-09-04T02:00:00.000Z");

function jeissianeDebtMsgs(): TrailMessage[] {
  return [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Consegue ver na prática… ficou alguma dúvida?",
      created_at: "2026-09-03T20:55:35.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content: "Mais fazer envio do pix tbm que trabalho com tava de agendamento",
      created_at: "2026-09-03T20:57:45.000Z",
    },
  ];
}

Deno.test("dívida ativa 18:05 BRT → due (janela prorrogada, não outside_window)", () => {
  const d = decide({
    conversationId: JEISSIANE_ID,
    messages: jeissianeDebtMsgs(),
    now: NOW_1805BRT,
  });
  assertEquals(d.kind, "debt");
  assertEquals(d.due, true);
  assertEquals(d.reason, "inbound_unanswered");
});

Deno.test("dívida ativa 20:00 BRT → still due", () => {
  const d = decide({
    conversationId: JEISSIANE_ID,
    messages: jeissianeDebtMsgs(),
    now: NOW_20BRT,
  });
  assertEquals(d.kind, "debt");
  assertEquals(d.due, true);
});

Deno.test("dívida ativa 23:00 BRT → fora da janela estendida", () => {
  const d = decide({
    conversationId: JEISSIANE_ID,
    messages: jeissianeDebtMsgs(),
    now: NOW_23BRT,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.due, false);
  assertEquals(d.reason, "outside_active_debt_window");
});

Deno.test("cold_resume 18:05 BRT → ainda outside_window (não prorroga frio)", () => {
  const d = decide({
    conversationId: EXPERT_ID,
    messages: expertMsgs(),
    now: NOW_1805BRT,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.reason, "outside_window");
});

Deno.test("Expert 09:30 BRT loja fechada → cold noop lead_closed (dívida não mexe)", () => {
  const fri0930 = new Date("2026-09-04T12:30:00.000Z");
  const cold = decide({
    conversationId: EXPERT_ID,
    messages: expertMsgs(),
    now: fri0930,
    leadAcceptingOutbound: false,
  });
  assertEquals(cold.kind, "noop");
  assertEquals(cold.due, false);
  assertEquals(cold.reason, "lead_closed");

  const debt = decide({
    conversationId: DEISE_ID,
    messages: deiseMsgs(),
    now: NOW_16BRT,
    leadAcceptingOutbound: false,
  });
  assertEquals(debt.kind, "debt");
  assertEquals(debt.due, true);
});

Deno.test("sábado 11h BRT → cold fora (CAMILA_WINDOW é seg–sex)", () => {
  const sat1100 = new Date("2026-09-05T14:00:00.000Z");
  const d = decide({
    conversationId: EXPERT_ID,
    messages: expertMsgs(),
    now: sat1100,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.due, false);
  assertEquals(d.reason, "outside_window");
});

Deno.test("domingo 15h BRT → dívida fora (janela ativa é seg–sáb, não domingo)", () => {
  const sun1500 = new Date("2026-09-06T18:00:00.000Z");
  const d = decide({
    conversationId: DEISE_ID,
    messages: deiseMsgs(),
    now: sun1500,
  });
  assertEquals(d.kind, "noop");
  assertEquals(d.due, false);
  assertEquals(d.reason, "outside_active_debt_window");
});

Deno.test("feriado 7/set/2026 11h BRT (Independência, segunda) → cold AINDA due (sem calendário de feriado)", () => {
  const independia1100 = new Date("2026-09-07T14:00:00.000Z");
  const d = decide({
    conversationId: EXPERT_ID,
    messages: expertMsgs(),
    now: independia1100,
  });
  assertEquals(d.kind, "cold_resume");
  assertEquals(d.due, true);
});

Deno.test("Expert 11:00 BRT loja aberta → cold_resume due", () => {
  const fri1100 = new Date("2026-09-04T14:00:00.000Z");
  const d = decide({
    conversationId: EXPERT_ID,
    messages: expertMsgs(),
    now: fri1100,
    leadAcceptingOutbound: true,
  });
  assertEquals(d.kind, "cold_resume");
  assertEquals(d.due, true);
});

Deno.test("auto-reply inbound após OUT → noop (não acorda brain)", () => {
  const msgs: TrailMessage[] = [
    {
      direction: "outbound",
      sender_type: "bot",
      content: "Não entendi muito bem, me explica melhor?",
      created_at: "2026-09-04T11:28:35.000Z",
    },
    {
      direction: "inbound",
      sender_type: "visitor",
      content:
        "Jeissiane Castro Nails agradece seu contato!! No momento estamos fora do horário de atendimento. Atendemos de segunda a sábado.",
      created_at: "2026-09-04T11:28:41.000Z",
    },
  ];
  const d = decide({
    conversationId: JEISSIANE_ID,
    messages: msgs,
    now: NOW_1805BRT,
  });
  assertEquals(d.due, false);
  assertEquals(d.reason, "auto_reply_inbound");
});
