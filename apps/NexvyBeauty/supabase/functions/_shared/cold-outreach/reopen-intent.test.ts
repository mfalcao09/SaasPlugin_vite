// deno test supabase/functions/_shared/cold-outreach/reopen-intent.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CLASSIFIER_VERSION,
  FAREWELL_WINDOW_HOURS,
  classifyReopenIntent,
} from "./reopen-intent.ts";

const CORPUS_PATH =
  new URL(
    "../../../../tasks/camila-autonomy/evidence/PRD-09/path-a-loop/corpus-v1.json",
    import.meta.url,
  );

Deno.test("classifier version + window constant", () => {
  assertEquals(CLASSIFIER_VERSION, "reopen-intent@1.0.0");
  assertEquals(FAREWELL_WINDOW_HOURS, 48);
});

Deno.test("corpus-v1 critical cases", async () => {
  const corpus = JSON.parse(await Deno.readTextFile(CORPUS_PATH));
  let hardOk = 0;
  let hardN = 0;
  let farewellOk = 0;
  let farewellN = 0;
  let falseReopen = 0;

  for (const c of corpus.cases) {
    if (c.context === "active_not_closed") continue; // reopen classifier only for closed soft
    const hours = c.hours_since_r2;
    const r = classifyReopenIntent({
      text: c.text,
      hoursSinceR2: hours,
      applicable: true,
    });
    if (c.critical && c.expected === "opt_out_again" && c.hard) {
      hardN++;
      if (r.class === "opt_out_again") hardOk++;
    }
    if (c.critical && c.expected === "farewell_ack") {
      farewellN++;
      if (r.class === "farewell_ack") farewellOk++;
    }
    if (
      c.critical &&
      c.expected !== "reopen_intent" &&
      r.class === "reopen_intent"
    ) {
      falseReopen++;
    }
    assertEquals(
      r.class,
      c.expected,
      `${c.id}: got ${r.class} reason=${r.reason_code}`,
    );
  }

  assertEquals(hardN > 0 && hardOk === hardN, true, "hard recall");
  assertEquals(farewellN > 0 && farewellOk === farewellN, true, "farewell recall");
  assertEquals(falseReopen, 0, "false reopen critical");
});

Deno.test("metamorphic: farewell + quero ver → reopen", () => {
  const r = classifyReopenIntent({
    text: "obrigada quero ver",
    hoursSinceR2: 2,
  });
  assertEquals(r.class, "reopen_intent");
});

Deno.test("metamorphic: courtesy + pare → opt_out", () => {
  const r = classifyReopenIntent({
    text: "obrigada, mas pare",
    hoursSinceR2: 1,
  });
  assertEquals(r.class, "opt_out_again");
});

Deno.test("outside 48h: obrigada → ambiguous not farewell", () => {
  const r = classifyReopenIntent({
    text: "obrigada",
    hoursSinceR2: 72,
  });
  assertEquals(r.class, "ambiguous");
});

Deno.test("not applicable", () => {
  const r = classifyReopenIntent({
    text: "quero ver",
    hoursSinceR2: 1,
    applicable: false,
  });
  assertEquals(r.class, "not_applicable");
});
