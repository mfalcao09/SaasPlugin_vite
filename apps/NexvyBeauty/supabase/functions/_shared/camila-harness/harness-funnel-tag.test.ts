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
  { id: "4", name: "Remarketing" },
  { id: "5", name: "Não Contatar - HARD OPT-OUT" },
];

Deno.test("resolve tag ids by stable name, not by color", () => {
  const ids = resolveFunnelTagIds(CATALOG);
  assertEquals(ids.remarketingId, "4");
  assertEquals(ids.hardId, "5");
});

Deno.test("HARD tag wins over remarketing on the same chat", () => {
  const ids = resolveFunnelTagIds(CATALOG);
  assertEquals(impliedStageFromChatTags(["4", "5"], ids), "do_not_contact");
  assertEquals(impliedStageFromChatTags(["4"], ids), "remarketing_pool");
  assertEquals(impliedStageFromChatTags([], ids), null);
});

Deno.test("lista no celular NÃO escreve funil: contacted + HARD → sem CAS", () => {
  const p = planFunnelTagSync({
    crmStage: "contacted",
    chatTagIds: ["5"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, []);
  assertEquals(p.paintRemove, []);
});

Deno.test("lista no celular NÃO escreve funil: contacted + REMARKETING → sem CAS", () => {
  const p = planFunnelTagSync({
    crmStage: "contacted",
    chatTagIds: ["4"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
});

Deno.test("service + tag REMARKETING no celular → sem CAS (conversa ao vivo)", () => {
  const p = planFunnelTagSync({
    crmStage: "service",
    chatTagIds: ["4"],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, []);
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

Deno.test("contacted without funnel tags does not wipe the phone", () => {
  const p = planFunnelTagSync({
    crmStage: "contacted",
    chatTagIds: [],
    catalog: CATALOG,
  });
  assertEquals(p.casStage, null);
  assertEquals(p.paintAdd, []);
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
