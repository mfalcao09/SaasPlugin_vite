// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/attendance-window.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideAttendance,
  attendanceActionForPackage,
  FIXTURE,
  isClosedDay,
  withinWindow,
  COMMERCIAL_WINDOW,
  EXTENDED_WINDOW,
} from "./attendance-window.ts";

const HOLIDAYS = new Set(["2026-09-07"]);

Deno.test("comercial: terça 10h → open OK", () => {
  const v = decideAttendance({ now: FIXTURE.tue1000, action: "open_new_package" });
  assertEquals(v.allowed, true);
  assertEquals(v.canOut, true);
  assertEquals(v.window, "commercial");
});

Deno.test("comercial: terça 17:59 → open OK; 18:00 → block", () => {
  assertEquals(
    decideAttendance({ now: FIXTURE.tue1759, action: "open_new_package" }).allowed,
    true,
  );
  const blocked = decideAttendance({
    now: FIXTURE.tue1800,
    action: "open_new_package",
  });
  assertEquals(blocked.allowed, false);
  assertEquals(blocked.reason, "outside_commercial_window");
});

Deno.test("estendida: após 18h continue/reply OK até 21:59; 22:00 block", () => {
  assertEquals(
    decideAttendance({ now: FIXTURE.tue1805, action: "continue_package" }).allowed,
    true,
  );
  assertEquals(
    decideAttendance({ now: FIXTURE.tue1805, action: "reply" }).canIn,
    true,
  );
  assertEquals(
    decideAttendance({ now: FIXTURE.tue2159, action: "exit_message" }).allowed,
    true,
  );
  const late = decideAttendance({
    now: FIXTURE.tue2200,
    action: "reply",
  });
  assertEquals(late.allowed, false);
  assertEquals(late.canOut, false);
  assertEquals(late.canIn, false);
  assertEquals(late.reason, "outside_extended_window");
});

Deno.test("sábado: open block; reply OK", () => {
  assertEquals(
    decideAttendance({ now: FIXTURE.sat1500, action: "open_new_package" }).allowed,
    false,
  );
  const reply = decideAttendance({ now: FIXTURE.sat1500, action: "reply" });
  assertEquals(reply.allowed, true);
  assertEquals(reply.canIn, true);
  assertEquals(reply.window, "extended");
});

Deno.test("domingo: zero OUT e IN", () => {
  const v = decideAttendance({ now: FIXTURE.sun1100, action: "reply" });
  assertEquals(v.allowed, false);
  assertEquals(v.canOut, false);
  assertEquals(v.canIn, false);
  assertEquals(v.reason, "closed_sunday");
  assertEquals(isClosedDay(FIXTURE.sun1100).closed, true);
});

Deno.test("feriado nacional: zero OUT e IN", () => {
  const v = decideAttendance({
    now: FIXTURE.holiday1100,
    action: "open_new_package",
    holidayDates: HOLIDAYS,
  });
  assertEquals(v.allowed, false);
  assertEquals(v.reason, "closed_national_holiday");
});

Deno.test("retomada usa estendida (não exige comercial)", () => {
  const v = decideAttendance({
    now: FIXTURE.tue1805,
    action: "resume_package",
  });
  assertEquals(v.allowed, true);
  assertEquals(v.window, "extended");
});

Deno.test("attendanceActionForPackage: bolha1 vs resto vs resume", () => {
  assertEquals(
    attendanceActionForPackage({ packageStarted: false, nextBubbleIndex: 1 }),
    "open_new_package",
  );
  assertEquals(
    attendanceActionForPackage({ packageStarted: true, nextBubbleIndex: 2 }),
    "continue_package",
  );
  assertEquals(
    attendanceActionForPackage({
      packageStarted: true,
      resumeUsed: true,
      nextBubbleIndex: 3,
    }),
    "resume_package",
  );
});

Deno.test("withinWindow mirrors commercial/extended defs", () => {
  assertEquals(withinWindow(FIXTURE.tue1000, COMMERCIAL_WINDOW), true);
  assertEquals(withinWindow(FIXTURE.tue1800, COMMERCIAL_WINDOW), false);
  assertEquals(withinWindow(FIXTURE.sat1500, EXTENDED_WINDOW), true);
  assertEquals(withinWindow(FIXTURE.sat1500, COMMERCIAL_WINDOW), false);
});
