import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { visitorDigitsFromWaQrId, waQrVisitorId, waQrVisitorIdsForLookup } from "./platform-wa-qr-identity.ts";
import {
  buildWaQrConversationIdentity,
  outboundConversationInsertAllowed,
  pickCanonicalWaQrConversation,
  planWaQrOutboundBind,
  waQrCanonicalVisitorId,
  waQrCanonicalVisitorPhone,
  waQrVisitorIdsForPhoneVariants,
} from "./wa-qr-conversation-resolve.ts";

Deno.test("fromMe do aparelho tem de usar as MESMAS variantes do inbound", () => {
  // 2026-09-18: inbound já chamava waQrVisitorIdsForPhoneVariants;
  // fromMe usava só waQrVisitorIdsForLookup (exato) → thread errada ou drop.
  const inbound = waQrVisitorIdsForPhoneVariants("551992020426");
  assertEquals(inbound.some((x) => x === "wa_qr:5519992020426"), true);
});

Deno.test("visitorDigitsFromWaQrId lê wa_qr e wa_evo", () => {
  assertEquals(visitorDigitsFromWaQrId("wa_qr:5519992020426"), "5519992020426");
  assertEquals(visitorDigitsFromWaQrId("wa_evo:5519992020426"), "5519992020426");
  assertEquals(visitorDigitsFromWaQrId("wa:5519992020426"), "");
});

Deno.test("visitor ids incluem variante com e sem 9º dígito", () => {
  const ids = waQrVisitorIdsForPhoneVariants("556899576171"); // sem 9
  assertEquals(ids.some((x) => x.includes("5568999576171")), true);
  assertEquals(ids.some((x) => x.includes("556899576171")), true);
  assertEquals(ids.some((x) => x.startsWith("wa_qr:")), true);
});

Deno.test("canonical phone força 9º dígito mobile", () => {
  assertEquals(waQrCanonicalVisitorPhone("556899576171"), "+5568999576171");
  assertEquals(waQrCanonicalVisitorPhone("+5568999576171"), "+5568999576171");
});

Deno.test("Jeissiane: prefere canônica aberta com 9º, não duplicata closed-merge", () => {
  const canon = {
    id: "db870f09-54d1-4e1b-a221-6af8fb24788f",
    status: "bot_active",
    visitor_phone: "+5568999576171",
    current_agent_id: "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7",
    created_at: "2026-09-02T03:00:00Z",
    metadata: { wa_lid: "21140013584515" },
  };
  const dup = {
    id: "7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1",
    status: "closed",
    visitor_phone: "+556899576171",
    current_agent_id: null,
    created_at: "2026-09-02T04:00:00Z",
    metadata: {
      merged_into: "db870f09-54d1-4e1b-a221-6af8fb24788f",
      merge_reason: "F5",
    },
  };
  const picked = pickCanonicalWaQrConversation([dup, canon]);
  assertEquals(picked?.id, canon.id);
});

Deno.test("só duplicata com merged_into → segue ponteiro se alvo no batch", () => {
  const canon = {
    id: "aaaa",
    status: "bot_active",
    visitor_phone: "+5568999576171",
    created_at: "2026-09-01T00:00:00Z",
    metadata: {},
  };
  const dup = {
    id: "bbbb",
    status: "bot_active",
    visitor_phone: "+556899576171",
    created_at: "2026-09-03T00:00:00Z",
    metadata: { merged_into: "aaaa" },
  };
  assertEquals(pickCanonicalWaQrConversation([dup, canon])?.id, "aaaa");
});

// ── Edna Nails Designer (2026-08-18) — 9º dígito parte a thread ─────────────
// Lead gravado +554884472819; WhatsApp entregou 5548984472819.
// persistOpeningInInbox usava waQrVisitorId(dígitos crus) + waQrVisitorIdsForLookup
// (sem variantes). O unique (visitor_id, channel, instance) aceitava as DUAS rows.

const EDNA_QUEUE_PHONE = "+554884472819"; // sem 9º — como na fila / lead
const EDNA_INBOUND_PHONE = "5548984472819"; // com 9º — como o JID do WhatsApp

Deno.test("Edna: identidade de INSERT do disparo = identidade do inbound", () => {
  const outbound = buildWaQrConversationIdentity(EDNA_QUEUE_PHONE);
  const inbound = buildWaQrConversationIdentity(EDNA_INBOUND_PHONE);
  assertEquals(outbound.visitorPhone, "+5548984472819");
  assertEquals(outbound.visitorId, inbound.visitorId);
  assertEquals(outbound.visitorPhone, inbound.visitorPhone);
  assertEquals(outbound.visitorId, waQrCanonicalVisitorId(EDNA_INBOUND_PHONE));
});

Deno.test("Edna: lookup do inbound ACHA a row gravada pelo disparo", () => {
  const outbound = buildWaQrConversationIdentity(EDNA_QUEUE_PHONE);
  const inbound = buildWaQrConversationIdentity(EDNA_INBOUND_PHONE);
  assertEquals(inbound.visitorIds.includes(outbound.visitorId), true);
  assertEquals(inbound.phoneVariants.includes(outbound.visitorPhone), true);
});

Deno.test("Edna: o lookup EXATO (bug antigo) NÃO acha a conversa do fromMe", () => {
  // Reproduz o furo de persistOpeningInInbox: ForLookup(fila sem 9) vs
  // visitor_id canônico do webhook (com 9). Unique index deixa nascer 2 rows.
  const fromMeVisitorId = waQrCanonicalVisitorId(EDNA_INBOUND_PHONE);
  const oldLookup = waQrVisitorIdsForLookup(EDNA_QUEUE_PHONE.replace(/\D/g, ""));
  assertEquals(fromMeVisitorId, "wa_qr:5548984472819");
  assertEquals(oldLookup.includes(fromMeVisitorId), false);
  assertEquals(waQrVisitorId("554884472819"), "wa_qr:554884472819");
});

Deno.test("disparo outbound recusa INSERT sem lead_id", () => {
  assertEquals(outboundConversationInsertAllowed(""), false);
  assertEquals(outboundConversationInsertAllowed(null), false);
  assertEquals(outboundConversationInsertAllowed("   "), false);
  assertEquals(outboundConversationInsertAllowed("lead-edna"), true);
});

Deno.test("Edna: bind reusa a fromMe canônica em vez de inserir segunda row", () => {
  const plan = planWaQrOutboundBind({
    identity: buildWaQrConversationIdentity(EDNA_QUEUE_PHONE),
    leadId: "lead-edna",
    candidates: [{
      id: "43975405-01ff-4c70-8f6f-9e8e5fe32683",
      status: "bot_active",
      visitor_phone: "+5548984472819",
      lead_id: null,
      created_at: "2026-08-18T15:43:21Z",
    }],
  });
  assertEquals(plan.action, "reuse");
  if (plan.action === "reuse") {
    assertEquals(plan.conversationId, "43975405-01ff-4c70-8f6f-9e8e5fe32683");
    assertEquals(plan.patchLeadId, true);
  }
});

Deno.test("bind recusa inserir conversa de disparo sem lead_id", () => {
  const plan = planWaQrOutboundBind({
    identity: buildWaQrConversationIdentity(EDNA_QUEUE_PHONE),
    leadId: null,
    candidates: [],
  });
  assertEquals(plan.action, "refuse");
});
