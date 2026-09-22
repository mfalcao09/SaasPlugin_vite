// National holidays for Camila Harness attendance (DB rows → date set).
// Gate logic: attendance-window.ts. Sync BrasilAPI continua no conductor/UI.

import { yearsToSync, CAMILA_HOLIDAY_TZ } from "../cold-outreach/br-national-holidays.ts";

export type HolidayRow = { date: string };

/** Pure: rows → Set YYYY-MM-DD. */
export function holidayDateSetFromRows(rows: readonly HolidayRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const d = String(row.date ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d);
  }
  return out;
}

/**
 * Load holiday dates (current+next BRT year) from `platform_crm_business_holidays`.
 * Empty/error → empty Set (domingo ainda fecha; feriado só com calendário).
 */
export async function loadHarnessHolidayDates(
  // deno-lint-ignore no-explicit-any
  sb: { from: (t: string) => any },
  now: Date = new Date(),
): Promise<Set<string>> {
  const years = yearsToSync(now, CAMILA_HOLIDAY_TZ);
  const start = `${years[0]}-01-01`;
  const end = `${years[years.length - 1]}-12-31`;
  try {
    const { data, error } = await sb
      .from("platform_crm_business_holidays")
      .select("date")
      .gte("date", start)
      .lte("date", end);
    if (error || !data) return new Set();
    return holidayDateSetFromRows(data as HolidayRow[]);
  } catch {
    return new Set();
  }
}
