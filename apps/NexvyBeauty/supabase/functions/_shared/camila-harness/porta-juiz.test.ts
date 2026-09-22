// deno test --no-check supabase/functions/_shared/camila-harness/porta-juiz.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONSENT_QUESTION_DRAFT,
  CONSENT_QUESTION_TEMPLATE,
  PACKAGE_LIMIT_MS,
  decideActivation,
  extractWamid,
  isBrainDebt,
  isBrainOutboundWamid,
  juizPrimeiroAto,
  renderConsentQuestion,
  reviewFirstContactPackage,
  type ActivationInput,
  type PackageBubble,
} from "./porta-juiz.ts";

const four = (
  wamids: [string | null, string | null, string | null, string | null],
): PackageBubble[] =>
  ([1, 2, 3, 4] as const).map((index, i) => ({
    index,
    wamid: wamids[i],
  }));

function base(over: Partial<ActivationInput> = {}): ActivationInput {
  return {
    harnessProduct: true,
    status: "bot_active",
    dncOrHard: false,
    packageInFlight: false,
    pendingInboundId: "in-1",
    spokeDuringPackage: false,
    brainAlreadyRepliedWamid: false,
    windowAllowsReply: true,
    ...over,
  };
}

Deno.test("G5 Andressa: service + inbound pendente + pacote fechado → job", () => {
  const d = decideActivation(base());
  assertEquals(d.action, "job");
  assertEquals(d.reason, "job_ready");
  assertEquals(d.flags.pending_inbound_id, "in-1");
  assertEquals(d.flags.wake_reason, "pending_inbound");
  assertEquals(d.flags.needs_new_consent, false);
});

Deno.test("G5#3 fala no meio das 4 → espera; inbound não some", () => {
  const d = decideActivation(base({ packageInFlight: true }));
  assertEquals(d.action, "wait_package");
  assertEquals(d.reason, "mouth1_in_flight");
});

Deno.test("G5#1 humano → não acorda", () => {
  assertEquals(
    decideActivation(base({ status: "human_active" })).action,
    "stop",
  );
  assertEquals(
    decideActivation(base({ status: "waiting_human" })).reason,
    "human_in_loop",
  );
});

Deno.test("G5#2 DNC não trava: job + needs_new_consent", () => {
  const d = decideActivation(base({ dncOrHard: true }));
  assertEquals(d.action, "job");
  assertEquals(d.flags.needs_new_consent, true);
});

Deno.test("G5#4 sem inbound pendente → stop", () => {
  const d = decideActivation(base({ pendingInboundId: null }));
  assertEquals(d.action, "stop");
  assertEquals(d.reason, "no_pending_inbound");
});

Deno.test("G5#5 cérebro já respondeu (wamid) → stop", () => {
  const d = decideActivation(base({ brainAlreadyRepliedWamid: true }));
  assertEquals(d.reason, "brain_already_replied");
});

Deno.test("G5#6 janela fechada → job_held (não fala agora)", () => {
  const d = decideActivation(base({ windowAllowsReply: false }));
  assertEquals(d.action, "job");
  assertEquals(d.reason, "job_held_window");
});

Deno.test("G1: bolha 1–4 depois da inbound NÃO apaga dívida", () => {
  assertEquals(
    isBrainDebt({
      hasVisitorInbound: true,
      brainOutboundWamidAfterInbound: false,
    }),
    true,
  );
  assertEquals(
    isBrainDebt({
      hasVisitorInbound: true,
      brainOutboundWamidAfterInbound: true,
    }),
    false,
  );
});

Deno.test("G4b: aberto → resend dos que não têm wamid", () => {
  const r = reviewFirstContactPackage({
    firstBubbleAtMs: 1_000,
    nowMs: 1_000 + 60_000,
    bubbles: four(["w1", null, null, null]),
  });
  assertEquals(r.closed, false);
  assertEquals(r.reason, "open");
  assertEquals(r.resendIndexes, [2, 3, 4]);
});

Deno.test("G4c: 4 wamids → fecha; falou? pode acordar", () => {
  const r = reviewFirstContactPackage({
    firstBubbleAtMs: 1_000,
    nowMs: 1_000 + 90_000,
    bubbles: four(["a", "b", "c", "d"]),
  });
  assertEquals(r.closed, true);
  assertEquals(r.reason, "four_wamids");
  assertEquals(r.resendIndexes, []);
});

Deno.test("G4c: 180s após a 1ª fecha mesmo com 2 wamids", () => {
  const r = reviewFirstContactPackage({
    firstBubbleAtMs: 1_000,
    nowMs: 1_000 + PACKAGE_LIMIT_MS,
    bubbles: four(["a", "b", null, null]),
  });
  assertEquals(r.closed, true);
  assertEquals(r.reason, "deadline_180s");
  assertEquals(r.resendIndexes, []);
});

Deno.test("G6+G8 juiz: como funciona? → attend; vazio → silence", () => {
  const a = juizPrimeiroAto({ needsNewConsent: false, text: "Como funciona?" });
  assertEquals(a.speak, "attend");
  assertEquals(a.verdict, "attend");
  const n = juizPrimeiroAto({ needsNewConsent: false, text: "" });
  assertEquals(n.speak, "silence");
  assertEquals(n.verdict, "noise");
});

Deno.test("G6 juiz: não quero → exit (cérebro, não tick)", () => {
  const a = juizPrimeiroAto({
    needsNewConsent: false,
    text: "não tenho interesse",
  });
  assertEquals(a.speak, "exit");
  assertEquals(a.verdict, "exit");
});

Deno.test("G5#2 consentimento: como funciona? após DNC → pergunta, não demo", () => {
  const a = juizPrimeiroAto({
    needsNewConsent: true,
    text: "Como funciona?",
  });
  assertEquals(a.speak, "consent_question");
  assertEquals(a.verdict, "consent_asked");
  assertEquals(CONSENT_QUESTION_TEMPLATE.includes("parar o atendimento"), true);
  assertEquals(CONSENT_QUESTION_TEMPLATE.includes("{nome}"), true);
  assertEquals(CONSENT_QUESTION_TEMPLATE.includes('"Sim"'), true);
  assertEquals(CONSENT_QUESTION_DRAFT, CONSENT_QUESTION_TEMPLATE);
  assertEquals(
    renderConsentQuestion("Andressa Silva"),
    CONSENT_QUESTION_TEMPLATE.replace("{nome}", "Andressa"),
  );
  assertEquals(renderConsentQuestion(null).startsWith("Olá."), true);
  assertEquals(renderConsentQuestion("+5511999").startsWith("Olá."), true);
});

Deno.test("consentimento sim → attend; não → silence + consent_no", () => {
  assertEquals(
    juizPrimeiroAto({ needsNewConsent: true, text: "sim" }).verdict,
    "consent_yes",
  );
  assertEquals(
    juizPrimeiroAto({ needsNewConsent: true, text: "não" }).verdict,
    "consent_no",
  );
});

Deno.test("G5#4 ficha: spoke_during_package viaja no job", () => {
  const d = decideActivation(base({ spokeDuringPackage: true }));
  assertEquals(d.flags.spoke_during_package, true);
  assertEquals(d.flags.pending_inbound_id, "in-1");
});

Deno.test("G4b: bolha ainda não tentada não entra no resend", () => {
  const r = reviewFirstContactPackage({
    firstBubbleAtMs: 1_000,
    nowMs: 1_000 + 60_000,
    bubbles: [
      { index: 1, wamid: "w1", attempted: true },
      { index: 2, wamid: null, attempted: false },
      { index: 3, wamid: null, attempted: false },
      { index: 4, wamid: null, attempted: false },
    ],
  });
  assertEquals(r.closed, false);
  assertEquals(r.resendIndexes, []);
});

Deno.test("extractWamid + G1: eco do chip não é dívida paga", () => {
  assertEquals(extractWamid({ evolution_message_id: "w-eco" }), "w-eco");
  assertEquals(
    isBrainOutboundWamid({
      direction: "outbound",
      senderType: "agent",
      metadata: { wamid: "w-chip", source: "external_device" },
    }),
    false,
  );
  assertEquals(
    isBrainOutboundWamid({
      direction: "outbound",
      senderType: "bot",
      metadata: { wamid: "w-brain", agent_id: "camila" },
    }),
    true,
  );
  assertEquals(
    isBrainOutboundWamid({
      direction: "outbound",
      senderType: "bot",
      metadata: { wamid: "w1", agent_id: "camila", harness_mouth: 1 },
    }),
    false,
  );
});
