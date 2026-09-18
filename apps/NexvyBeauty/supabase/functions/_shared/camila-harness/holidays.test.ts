// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/holidays.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { holidayDateSetFromRows, loadHarnessHolidayDates } from "./holidays.ts";
import { decideAttendance, FIXTURE } from "./attendance-window.ts";

Deno.test("holidayDateSetFromRows normalizes", () => {
  const s = holidayDateSetFromRows([
    { date: "2026-09-07" },
    { date: "2026-12-25T00:00:00Z" },
    { date: "bad" },
  ]);
  assertEquals(s.has("2026-09-07"), true);
  assertEquals(s.has("2026-12-25"), true);
  assertEquals(s.size, 2);
});

Deno.test("loadHarnessHolidayDates: empty on error", async () => {
  const sb = {
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: async () => ({ data: null, error: { message: "x" } }),
        }),
      }),
    }),
  };
  const set = await loadHarnessHolidayDates(sb, FIXTURE.holiday1100);
  assertEquals(set.size, 0);
});

Deno.test("loadHarnessHolidayDates → attendance blocks holiday", async () => {
  const sb = {
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: async () => ({
            data: [{ date: "2026-09-07" }],
            error: null,
          }),
        }),
      }),
    }),
  };
  const set = await loadHarnessHolidayDates(sb, FIXTURE.holiday1100);
  const v = decideAttendance({
    now: FIXTURE.holiday1100,
    action: "reply",
    holidayDates: set,
  });
  assertEquals(v.allowed, false);
  assertEquals(v.reason, "closed_national_holiday");
});
