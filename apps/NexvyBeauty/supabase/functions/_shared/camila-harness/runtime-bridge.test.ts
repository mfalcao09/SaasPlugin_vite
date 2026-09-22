// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/runtime-bridge.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  harnessAllowsRealWhatsapp,
  harnessPlanAutomaticBlocked,
  harnessPlanSupervised,
  harnessInboundMetaPatch,
  parseAttendanceAction,
  HARNESS_RUNTIME_VERSION,
} from "./runtime-bridge.ts";
import { FIXTURE } from "./attendance-window.ts";

function envMap(m: Record<string, string>) {
  return { get: (k: string) => m[k] };
}

Deno.test("runtime: real WA default false", () => {
  assertEquals(harnessAllowsRealWhatsapp(envMap({})), false);
  assertEquals(
    harnessAllowsRealWhatsapp(envMap({ HARNESS_PILOT_LIVE: "1" })),
    false,
  );
  assertEquals(
    harnessAllowsRealWhatsapp(
      envMap({ HARNESS_PILOT_LIVE: "1", HARNESS_ALLOW_REAL_WHATSAPP: "1" }),
    ),
    true,
  );
});

Deno.test("runtime: supervised plan dry-run only, realSends=0", () => {
  const r = harnessPlanSupervised({
    goId: "GO-INT-1",
    leadId: "5511999999999",
    manualList: ["5511999999999"],
    env: envMap({ CAMILA_VOICE_GATE: "OFF", CAMILA_KILL_SWITCH: "1" }),
  });
  assertEquals(r.gate.allowed, true);
  assertEquals(r.plannedBubbles.length, 4);
  assertEquals(r.realSends, 0);
  assertEquals(r.dryRunForced, true);
  assertEquals(r.runtimeVersion, HARNESS_RUNTIME_VERSION);
});

Deno.test("runtime: no go blocked", () => {
  const r = harnessPlanSupervised({
    goId: null,
    leadId: "5511999999999",
    manualList: ["5511999999999"],
    env: envMap({}),
  });
  assertEquals(r.gate.allowed, false);
  assertEquals(r.realSends, 0);
});

Deno.test("runtime: automatic blocked by kill", () => {
  const g = harnessPlanAutomaticBlocked({
    leadId: "5511999999999",
    manualList: ["5511999999999"],
    env: envMap({ CAMILA_KILL_SWITCH: "1" }),
  });
  assertEquals(g.allowed, false);
  assertEquals(g.reason, "kill_blocks_automatic");
});

Deno.test("runtime: inbound meta patch → service on interest + reply gate", () => {
  const p = harnessInboundMetaPatch(
    { harness_state: "remarketing_pool" },
    "Tenho interesse, como funciona?",
    { now: new Date("2026-09-15T13:00:00.000Z") },
  );
  assertEquals(p.metadata.harness_state, "service");
  assertEquals(p.cite, true);
  assertEquals(p.metadata.harness_real_whatsapp, false);
  assertEquals(p.replyAllowed, true);
  assertEquals(p.metadata.harness_reply_allowed, true);
});

Deno.test("runtime: feriado nacional bloqueia abertura supervisionada", () => {
  const r = harnessPlanSupervised({
    goId: "GO-INT-1",
    leadId: "5511999999999",
    manualList: ["5511999999999"],
    env: envMap({ CAMILA_VOICE_GATE: "TEST" }),
    now: FIXTURE.holiday1100,
    attendanceAction: "open_new_package",
    holidayDates: new Set(["2026-09-07"]),
  });
  assertEquals(r.gate.allowed, false);
  assertEquals(r.gate.reason, "closed_national_holiday");
  assertEquals(r.plannedBubbles.length, 0);
  assertEquals(r.realSends, 0);
});

Deno.test("parseAttendanceAction: desconhecido volta para abertura", () => {
  assertEquals(parseAttendanceAction("exit_message"), "exit_message");
  assertEquals(parseAttendanceAction("nope"), "open_new_package");
});

Deno.test("runtime: inbound domingo → triage ok, reply blocked", () => {
  const p = harnessInboundMetaPatch(
    { harness_state: "contacted" },
    "Oi",
    { now: new Date("2026-09-20T14:00:00.000Z") },
  );
  assertEquals(p.replyAllowed, false);
  assertEquals(p.replyReason, "closed_sunday");
  assertEquals(p.metadata.harness_reply_allowed, false);
});
