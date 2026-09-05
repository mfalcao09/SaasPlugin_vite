// Callers: Deno test runner only. SUT callers after wire:
//   camila-conductor-policy.ts (isLeadAcceptingOutbound → decideCamilaWake)
//   platform-camila-conductor/index.ts ~149
//   platform-sales-brain/index.ts ~2106 / ~2162 (formatWaLeadBrainContext)
// Glob **/wa-lead-profile*: only wa-lead-profile.ts (no prior test).
// No data-file I/O. Synthetic hours: openTime "10:00", dates ISO 2026-09-04T12:30:00.000Z
// User: "a) não é só ligar o vocativo, é ligar todas as informações que o número
// pode fornecer. [...] horário de funcionamento. [...] ficar salvo no DB, na
// informação do lead. [...] enriquecer a Camila [...] b) ainda não."
//
// deno test supabase/functions/_shared/cold-outreach/wa-lead-profile.test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  asWaLeadProfile,
  formatWaLeadBrainContext,
  isLeadAcceptingOutbound,
  normalizeWaLeadProfile,
} from "./wa-lead-profile.ts";

/** Sexta 2026-09-04 09:30 BRT = 12:30 UTC */
const FRI_0930 = new Date("2026-09-04T12:30:00.000Z");
/** Sexta 11:00 BRT = 14:00 UTC */
const FRI_1100 = new Date("2026-09-04T14:00:00.000Z");
/** Sexta 17:33 BRT = 20:33 UTC (wake Expert) */
const FRI_1733 = new Date("2026-09-04T20:33:00.000Z");
/** Sabado 17:00 BRT = 20:00 UTC — Purissimo fecha 16:00 */
const SAT_1700 = new Date("2026-09-05T20:00:00.000Z");

const EXPERT_BIZ = {
  description:
    "Antigo Lanci Lashes Beauty. Agora Studio Purissimo, Thais Purissimo e Beatriz Purissimo.",
  address: "R. Sao Jose - Embare, Santos - SP",
  websites: ["https://www.instagram.com/thaiis.lashdesigner"],
  categories: [{ displayName: "Beleza, cosmeticos e cuidados pessoais" }],
  businessHours: {
    timezone: "America/Sao_Paulo",
    mode: "specificHours",
    days: [
      { dayOfWeek: "MONDAY", openTime: "10:00", closeTime: "19:30" },
      { dayOfWeek: "FRIDAY", openTime: "10:00", closeTime: "19:30" },
      { dayOfWeek: "SATURDAY", openTime: "10:00", closeTime: "16:00" },
    ],
  },
};

const EMILLY_BIZ = {
  categories: [{ displayName: "Salao de beleza" }],
  businessHours: {
    timezone: "America/Sao_Paulo",
    mode: "appointmentOnly",
    days: [
      { dayOfWeek: "MONDAY" },
      { dayOfWeek: "FRIDAY" },
      { dayOfWeek: "SATURDAY" },
    ],
  },
};

Deno.test("Expert/Purissimo: 09:30 fechado, 11:00 e 17:33 abertos, sab 17h fechado", () => {
  const p = normalizeWaLeadProfile({
    business: EXPERT_BIZ,
    chat: { name: "5513992028635" },
    igName: "Expert em Extensoes com Naturalidade",
    handle: "lancilashesbeauty",
    primeiroNome: "Expert",
    now: FRI_1100,
  });
  assertEquals(p.is_business, true);
  assertEquals(p.hours_mode, "specificHours");
  assertEquals(p.greeting_name, null);
  assertEquals(isLeadAcceptingOutbound(p, FRI_0930), false);
  assertEquals(isLeadAcceptingOutbound(p, FRI_1100), true);
  assertEquals(isLeadAcceptingOutbound(p, FRI_1733), true);
  assertEquals(isLeadAcceptingOutbound(p, SAT_1700), false);
  const ctx = formatWaLeadBrainContext(p, FRI_0930, "Expert");
  assertStringIncludes(ctx, "FORA DO HORARIO");
  assertStringIncludes(ctx, "Studio Purissimo");
  assertStringIncludes(ctx, "NAO use nome generico");
  const round = asWaLeadProfile(JSON.parse(JSON.stringify(p)));
  assertEquals(round?.hours_mode, "specificHours");
  assertEquals(isLeadAcceptingOutbound(round, FRI_0930), false);
});

Deno.test("Emilly appointmentOnly: sexta 11h ok, sexta 20h nao", () => {
  const p = normalizeWaLeadProfile({
    business: EMILLY_BIZ,
    chat: { name: "5521971449182" },
    igName: "LASH DESIGNER | NITEROI - RJ",
    handle: "emillylopes_beauty",
    primeiroNome: "LASH",
    now: FRI_1100,
  });
  assertEquals(p.hours_mode, "appointmentOnly");
  assertEquals(p.greeting_name, "Emilly");
  assertEquals(isLeadAcceptingOutbound(p, FRI_1100), true);
  assertEquals(isLeadAcceptingOutbound(p, new Date("2026-09-04T23:00:00.000Z")), false);
  const ctx = formatWaLeadBrainContext(p, FRI_1100, "LASH");
  assertStringIncludes(ctx, "HORA MARCADA");
  assertStringIncludes(ctx, "Emilly");
  assertStringIncludes(ctx, "LASH");
});

Deno.test("Deise sem business: nao inventa horario", () => {
  const p = normalizeWaLeadProfile({
    business: { success: false, message: "Business profile not found" },
    chat: { name: "Deise Santos Esmalteria", about: " " },
    igName: "Deise Santos/Unhas",
    handle: "deisesantos_naildesigner",
    primeiroNome: "Deise",
  });
  assertEquals(p.is_business, false);
  assertEquals(p.hours_mode, "not_business");
  assertEquals(p.greeting_name, "Deise");
  assertEquals(isLeadAcceptingOutbound(p, FRI_1100), null);
});
