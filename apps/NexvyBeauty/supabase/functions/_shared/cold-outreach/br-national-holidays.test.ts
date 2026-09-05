import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  brasilApiHolidaysUrl,
  holidayDateSet,
  isNationalHoliday,
  missingYears,
  parseBrasilApiHolidays,
  rowsForUpsert,
  yearsToSync,
  zonedIsoDate,
} from "./br-national-holidays.ts";

/** Payload live 2026 (BrasilAPI GET /feriados/v1/2026), recortado p/ o teste. */
const BRASILAPI_2026_SAMPLE = [
  { date: "2026-01-01", name: "Confraternização mundial", type: "national" },
  { date: "2026-02-16", name: "Carnaval", type: "national" },
  { date: "2026-02-17", name: "Carnaval", type: "national" },
  { date: "2026-04-03", name: "Sexta-feira Santa", type: "national" },
  { date: "2026-04-05", name: "Páscoa", type: "national" },
  { date: "2026-04-21", name: "Tiradentes", type: "national" },
  { date: "2026-05-01", name: "Dia do trabalho", type: "national" },
  { date: "2026-06-04", name: "Corpus Christi", type: "national" },
  { date: "2026-09-07", name: "Independência do Brasil", type: "national" },
  { date: "2026-10-12", name: "Nossa Senhora Aparecida", type: "national" },
  { date: "2026-11-02", name: "Finados", type: "national" },
  { date: "2026-11-15", name: "Proclamação da República", type: "national" },
  { date: "2026-11-20", name: "Dia da consciência negra", type: "national" },
  { date: "2026-12-25", name: "Natal", type: "national" },
];

Deno.test("URL BrasilAPI fica no path /feriados/v1/{ano}", () => {
  assertEquals(
    brasilApiHolidaysUrl(2026),
    "https://brasilapi.com.br/api/feriados/v1/2026",
  );
  assertThrows(() => brasilApiHolidaysUrl(1899));
});

Deno.test("parseBrasilApiHolidays extrai Independência 2026-09-07", () => {
  const holidays = parseBrasilApiHolidays(BRASILAPI_2026_SAMPLE);
  assertEquals(holidays.length, 14);
  assertEquals(
    holidays.some((h) => h.date === "2026-09-07" && /independ/i.test(h.name)),
    true,
  );
});

Deno.test("parseBrasilApiHolidays ignora linha podre e recusa não-array", () => {
  const holidays = parseBrasilApiHolidays([
    { date: "2026-09-07", name: "Independência do Brasil" },
    { date: "nope", name: "x" },
    null,
    { date: "2026-12-25" },
  ]);
  assertEquals(holidays.map((h) => h.date), ["2026-09-07"]);
  assertThrows(() => parseBrasilApiHolidays({ date: "2026-09-07" }));
});

Deno.test("7/set/2026 11h BRT é feriado; 8/set não", () => {
  const dates = holidayDateSet(parseBrasilApiHolidays(BRASILAPI_2026_SAMPLE).map((h) => h.date));
  const independia1100 = new Date("2026-09-07T14:00:00.000Z");
  const nextDay1100 = new Date("2026-09-08T14:00:00.000Z");
  assertEquals(zonedIsoDate(independia1100), "2026-09-07");
  assertEquals(isNationalHoliday(independia1100, dates), true);
  assertEquals(isNationalHoliday(nextDay1100, dates), false);
  assertEquals(isNationalHoliday(independia1100, undefined), false);
});

Deno.test("missingYears só pede ano sem nenhuma data", () => {
  assertEquals(missingYears(["2026-09-07"], [2026, 2027]), [2027]);
  assertEquals(missingYears([], [2026, 2027]), [2026, 2027]);
});

Deno.test("yearsToSync pega ano BRT + seguinte", () => {
  assertEquals(yearsToSync(new Date("2026-09-05T04:43:00.000Z")), [2026, 2027]);
});

Deno.test("rowsForUpsert carimba fonte BrasilAPI", () => {
  const rows = rowsForUpsert([{ date: "2026-09-07", name: "Independência do Brasil" }]);
  assertEquals(rows[0].date, "2026-09-07");
  assertEquals(rows[0].description.includes("BrasilAPI"), true);
});
