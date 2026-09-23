import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateWatch } from "./watch-rules.ts";

Deno.test("evaluateWatch ok when healthy", () => {
  const v = evaluateWatch({
    evolution_open: true,
    opt_outs_last_hour: 0,
    send_failures_last_hour: 0,
    queue_depth: 2,
    hours_since_pilot_start: 3,
  });
  assertEquals(v.severity, "ok");
});

Deno.test("evaluateWatch kill_recommend on channel down", () => {
  const v = evaluateWatch({
    evolution_open: false,
    opt_outs_last_hour: 0,
    send_failures_last_hour: 0,
    queue_depth: 0,
    hours_since_pilot_start: 1,
  });
  assertEquals(v.severity, "kill_recommend");
});
