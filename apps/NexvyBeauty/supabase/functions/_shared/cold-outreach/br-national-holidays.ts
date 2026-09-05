// Feriados nacionais via BrasilAPI (GET /api/feriados/v1/{ano}).
//
// Não existe REST em gov.br com o calendário anual. A fonte legal é a
// legislação federal + Portaria MGI no DOU; a BrasilAPI calcula as datas
// (fixas + móveis via Páscoa) sem chave. deno test neste arquivo.

export const BRASIL_API_HOLIDAYS_BASE = "https://brasilapi.com.br/api/feriados/v1";
export const CAMILA_HOLIDAY_TZ = "America/Sao_Paulo";

export type BrasilApiHoliday = {
  date: string;
  name: string;
  type?: string;
};

export function brasilApiHolidaysUrl(year: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) {
    throw new Error(`holiday year out of range: ${year}`);
  }
  return `${BRASIL_API_HOLIDAYS_BASE}/${year}`;
}

export function parseBrasilApiHolidays(payload: unknown): BrasilApiHoliday[] {
  if (!Array.isArray(payload)) {
    throw new Error("brasilapi holidays: expected array");
  }
  const out: BrasilApiHoliday[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const date = String(rec.date ?? "");
    const name = String(rec.name ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) continue;
    const type = typeof rec.type === "string" ? rec.type : undefined;
    out.push({ date, name, type });
  }
  return out;
}

export function rowsForUpsert(
  holidays: readonly BrasilApiHoliday[],
): { date: string; description: string }[] {
  return holidays.map((h) => ({
    date: h.date,
    description: `${h.name} (nacional/BrasilAPI)`,
  }));
}

export function holidayDateSet(dates: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of dates) {
    const d = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d);
  }
  return out;
}

export function zonedIsoDate(now: Date, timeZone = CAMILA_HOLIDAY_TZ): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function yearsToSync(now: Date, timeZone = CAMILA_HOLIDAY_TZ): number[] {
  const y = Number(zonedIsoDate(now, timeZone).slice(0, 4));
  return [y, y + 1];
}

export function missingYears(existing: Iterable<string>, years: readonly number[]): number[] {
  const have = new Set<number>();
  for (const d of existing) {
    const y = Number(String(d).slice(0, 4));
    if (Number.isInteger(y)) have.add(y);
  }
  return years.filter((y) => !have.has(y));
}

export function isNationalHoliday(
  now: Date,
  dates: ReadonlySet<string> | null | undefined,
  timeZone = CAMILA_HOLIDAY_TZ,
): boolean {
  if (!dates || dates.size === 0) return false;
  return dates.has(zonedIsoDate(now, timeZone));
}

export async function fetchBrasilApiHolidays(
  year: number,
  fetcher: typeof fetch = fetch,
): Promise<BrasilApiHoliday[]> {
  const res = await fetcher(brasilApiHolidaysUrl(year), {
    headers: {
      Accept: "application/json",
      "User-Agent": "NexvyBeauty-Camila/1.0 (holiday-import)",
    },
  });
  if (!res.ok) {
    throw new Error(`brasilapi holidays ${year}: HTTP ${res.status}`);
  }
  return parseBrasilApiHolidays(await res.json());
}
