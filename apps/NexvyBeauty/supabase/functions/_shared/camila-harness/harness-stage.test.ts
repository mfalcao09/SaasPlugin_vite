// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-stage.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  nextStageAfterFirstOutbound,
  nextStageAfterSoftExit,
  nextStageAfterHardExit,
  parseHarnessFacts,
  buildHarnessFactsPatch,
  PILOT_COHORT_ID,
} from "./harness-stage.ts";
import {
  seedPilotRosterFixture,
  SEED_PILOT_PHONES,
} from "./harness-roster-db.ts";

Deno.test("transitions: preselected → contacted after first bubble", () => {
  assertEquals(nextStageAfterFirstOutbound("preselected"), "contacted");
  assertEquals(nextStageAfterFirstOutbound("db"), "contacted");
  assertEquals(nextStageAfterFirstOutbound(null), "contacted");
  assertEquals(nextStageAfterFirstOutbound("service"), "service");
});

Deno.test("transitions: soft → remarketing_pool; hard → do_not_contact", () => {
  assertEquals(nextStageAfterSoftExit("contacted"), "remarketing_pool");
  assertEquals(nextStageAfterSoftExit("service"), "remarketing_pool");
  assertEquals(nextStageAfterHardExit("contacted"), "do_not_contact");
});

Deno.test("facts round-trip + seed fixture = 10 phones Renata first", () => {
  const patch = buildHarnessFactsPatch({
    greeting: "Renata",
    instagram_handle: "renatanaildesingner",
    resume_exception: true,
    pilot_order: 1,
    cohort: PILOT_COHORT_ID,
  });
  const parsed = parseHarnessFacts(patch);
  assertEquals(parsed?.greeting, "Renata");
  assertEquals(parsed?.resume_exception, true);
  assertEquals(SEED_PILOT_PHONES.length, 10);
  const roster = seedPilotRosterFixture();
  assertEquals(roster.length, 10);
  assertEquals(roster[0].phone, "5581993552037");
  assertEquals(roster[0].resumeException, true);
});
