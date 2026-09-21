// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-ui-stage.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  UI_STAGE_CONTACTED,
  UI_STAGE_IN_SERVICE,
  UI_STAGE_DNC,
  UI_STAGE_LEADS_IN_DB,
  UI_STAGE_PRESELECTED,
  UI_STAGE_REMARKETING,
  uiStageNameForDerived,
} from "./harness-ui-stage.ts";

Deno.test("ui stage map: harness → coluna do Kanban", () => {
  assertEquals(uiStageNameForDerived("preselected"), UI_STAGE_PRESELECTED);
  assertEquals(uiStageNameForDerived("contacted"), UI_STAGE_CONTACTED);
  assertEquals(uiStageNameForDerived("service"), UI_STAGE_IN_SERVICE);
  assertEquals(uiStageNameForDerived("remarketing_pool"), UI_STAGE_REMARKETING);
  assertEquals(uiStageNameForDerived("do_not_contact"), UI_STAGE_DNC);
  assertEquals(uiStageNameForDerived("db"), UI_STAGE_LEADS_IN_DB);
  assertEquals(uiStageNameForDerived(null), UI_STAGE_LEADS_IN_DB);
  assertEquals(uiStageNameForDerived("unknown"), UI_STAGE_LEADS_IN_DB);
});
