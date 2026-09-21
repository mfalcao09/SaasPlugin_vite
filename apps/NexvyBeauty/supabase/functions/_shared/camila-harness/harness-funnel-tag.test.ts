// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-funnel-tag.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  impliedStageFromChatTags,
  planFunnelTagSync,
  resolveFunnelTagIds,
} from "./harness-funnel-tag.ts";
import { zapiChatTagWritePath } from "../zapi-client.ts";

const CATALOG = [
  { id: "1", name: "Não lidas" },
  { id: "3", name: "Contatado" },
  { id: "4", name: "Remarketing" },
  { id: "5", name: "Não Contatar - HARD OPT-OUT" },
  { id: "6", name: "Em Atendimento" },
];

Deno.test("resolve tag ids by stable name, not by color", () => {
  const ids = resolveFunnelTagIds(CATALOG);
  assertEquals(ids.remarketingId, "4");
  assertEquals(ids.hardId, "5");
  assertEquals(ids.contactedId, "3");
  assertEquals(ids.serviceId, "6");
});

Deno.test("HARD tag wins over remarketing on the same chat", () => {
  const ids = resolveFunnelTagIds(CATALOG);
  assertEquals(impliedStageFromChatTags(["4", "5"], ids), "do_not_contact");
  assertEquals(impliedStageFromChatTags(["4"], ids), "remarketing_pool");
  assertEquals(impliedStageFromChatTags(["6"], ids), "service");
  assertEquals(impliedStageFromChatTags(["3"], ids), "contacted");
  assertEquals(impliedStageFromChatTags([], ids), null);
});

Deno.test("contacted pinta Contatado e tira Remarketing", () => {
  const p = planFunnelTagSync({
    crmStage: "contacted",
    chatTagIds: ["4"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, ["3"]);
  assertEquals(p.paintRemove, ["4"]);
});

Deno.test("service pinta Em Atendimento e tira Remarketing+Contatado", () => {
  const p = planFunnelTagSync({
    crmStage: "service",
    chatTagIds: ["3", "4"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, ["6"]);
  assertEquals(p.paintRemove.includes("4"), true);
  assertEquals(p.paintRemove.includes("3"), true);
});

Deno.test("CAS DNC paints HARD and removes remarketing", () => {
  const p = planFunnelTagSync({
    crmStage: "do_not_contact",
    chatTagIds: ["4"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, ["5"]);
  assertEquals(p.paintRemove, ["4"]);
});

Deno.test("removing tags on the phone does not un-DNC (CRM re-paints)", () => {
  const p = planFunnelTagSync({
    crmStage: "do_not_contact",
    chatTagIds: [],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, ["5"]);
  assertEquals(p.paintRemove, []);
});

Deno.test("contacted sem tag ganha Contatado", () => {
  const p = planFunnelTagSync({
    crmStage: "contacted",
    chatTagIds: [],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, ["3"]);
  assertEquals(p.paintRemove, []);
});

Deno.test("funnel→lista usa PUT /chats/{phone}/tags/{id}/add|remove", () => {
  assertEquals(
    zapiChatTagWritePath("+5585997315603", "4", "add"),
    "/chats/5585997315603/tags/4/add",
  );
  assertEquals(
    zapiChatTagWritePath("5585997315603", "5", "remove"),
    "/chats/5585997315603/tags/5/remove",
  );
});
