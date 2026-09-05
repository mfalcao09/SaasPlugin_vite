import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  pickCanonicalWaQrConversation,
  waQrCanonicalVisitorPhone,
  waQrVisitorIdsForPhoneVariants,
} from "./wa-qr-conversation-resolve.ts";

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
