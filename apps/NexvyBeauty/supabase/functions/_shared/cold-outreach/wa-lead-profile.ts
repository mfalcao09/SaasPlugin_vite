// wa-lead-profile.ts — snapshot do WhatsApp do NUMERO (Z-API) no lead.
// Horario de funcionamento, descricao business, nome do chat — para a Camila
// pensar e para NAO cutucar loja fechada (auto-reply).
//
//   deno test supabase/functions/_shared/cold-outreach/wa-lead-profile.test.ts

import { pickCamilaGreetingName } from "./camila-display-name.ts";

const DOW: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const DOW_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

export type WaLeadHoursMode =
  | "specificHours"
  | "appointmentOnly"
  | "alwaysOpen"
  | "unknown"
  | "not_business";

export type WaLeadDayHours = {
  weekday: number;
  openMin: number | null;
  closeMin: number | null;
};

export type WaLeadProfile = {
  fetched_at: string;
  is_business: boolean;
  chat_name: string | null;
  about: string | null;
  description: string | null;
  address: string | null;
  email: string | null;
  websites: string[];
  categories: string[];
  hours_mode: WaLeadHoursMode;
  timezone: string;
  days: WaLeadDayHours[];
  greeting_name: string | null;
};

export type WaLeadFetchInput = {
  chat?: unknown;
  business?: unknown;
  igName?: string | null;
  handle?: string | null;
  primeiroNome?: string | null;
  now?: Date;
};

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}

function parseHm(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function zonedClock(
  now: Date,
  timeZone: string,
): { weekday: number; minuteOfDay: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minStr, 10) || 0;
  return { weekday: map[wdStr] ?? 0, minuteOfDay: hour * 60 + minute };
}

function chatLooksMissing(chat: Record<string, unknown> | null): boolean {
  if (!chat) return true;
  const err = String(chat.error ?? chat.message ?? "");
  return /not found/i.test(err);
}

function businessFound(biz: Record<string, unknown> | null): boolean {
  if (!biz) return false;
  if (biz.success === false) return false;
  const msg = String(biz.message ?? "");
  if (/not found/i.test(msg)) return false;
  return !!(
    biz.description || biz.address || biz.email || biz.businessHours ||
    (Array.isArray(biz.categories) && biz.categories.length) ||
    (Array.isArray(biz.websites) && biz.websites.length)
  );
}

export function normalizeWaLeadProfile(input: WaLeadFetchInput): WaLeadProfile {
  const chat = asRec(input.chat);
  const biz = asRec(input.business);
  const hours = asRec(biz?.businessHours);
  const tz = String(hours?.timezone ?? "America/Sao_Paulo") || "America/Sao_Paulo";
  const modeRaw = String(hours?.mode ?? "").trim();
  const isBiz = businessFound(biz);
  let hours_mode: WaLeadHoursMode = "unknown";
  if (!isBiz) hours_mode = "not_business";
  else if (modeRaw === "specificHours") hours_mode = "specificHours";
  else if (modeRaw === "appointmentOnly") hours_mode = "appointmentOnly";
  else if (modeRaw === "alwaysOpen") hours_mode = "alwaysOpen";

  const days: WaLeadDayHours[] = [];
  const rawDays = Array.isArray(hours?.days) ? hours.days : [];
  for (const d of rawDays) {
    const rec = asRec(d);
    if (!rec) continue;
    const wd = DOW[String(rec.dayOfWeek ?? "").toUpperCase()];
    if (wd == null) continue;
    days.push({
      weekday: wd,
      openMin: parseHm(rec.openTime),
      closeMin: parseHm(rec.closeTime),
    });
  }

  const chatName = chatLooksMissing(chat)
    ? null
    : (typeof chat?.name === "string" && chat.name.trim() ? chat.name.trim() : null);
  const about = typeof chat?.about === "string" && chat.about.trim() ? chat.about.trim() : null;
  const description = typeof biz?.description === "string" && biz.description.trim()
    ? biz.description.trim()
    : null;
  const address = typeof biz?.address === "string" && biz.address.trim() ? biz.address.trim() : null;
  const email = typeof biz?.email === "string" && biz.email.trim() ? biz.email.trim() : null;
  const websites = Array.isArray(biz?.websites)
    ? biz.websites.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const categories: string[] = [];
  if (Array.isArray(biz?.categories)) {
    for (const c of biz.categories) {
      const rec = asRec(c);
      const label = typeof rec?.displayName === "string"
        ? rec.displayName
        : (typeof c === "string" ? c : "");
      if (label.trim()) categories.push(label.trim());
    }
  }

  const greeting_name = pickCamilaGreetingName({
    igName: input.igName,
    handle: input.handle,
    waChatName: chatName,
    primeiroNome: input.primeiroNome,
  });

  return {
    fetched_at: (input.now ?? new Date()).toISOString(),
    is_business: isBiz,
    chat_name: chatName,
    about,
    description,
    address,
    email,
    websites,
    categories,
    hours_mode,
    timezone: tz,
    days,
    greeting_name,
  };
}

const HOURS_MODES = new Set<WaLeadHoursMode>([
  "specificHours",
  "appointmentOnly",
  "alwaysOpen",
  "unknown",
  "not_business",
]);

/** Lê snapshot jsonb gravado em extracted_leads.wa_profile / conversation.metadata.wa_profile. */
export function asWaLeadProfile(raw: unknown): WaLeadProfile | null {
  const rec = asRec(raw);
  if (!rec) return null;
  const mode = rec.hours_mode;
  if (typeof mode !== "string" || !HOURS_MODES.has(mode as WaLeadHoursMode)) return null;
  const days: WaLeadDayHours[] = [];
  if (Array.isArray(rec.days)) {
    for (const d of rec.days) {
      const row = asRec(d);
      if (!row || typeof row.weekday !== "number") continue;
      days.push({
        weekday: row.weekday,
        openMin: typeof row.openMin === "number" ? row.openMin : null,
        closeMin: typeof row.closeMin === "number" ? row.closeMin : null,
      });
    }
  }
  const websites = Array.isArray(rec.websites)
    ? rec.websites.filter((u): u is string => typeof u === "string")
    : [];
  const categories = Array.isArray(rec.categories)
    ? rec.categories.filter((u): u is string => typeof u === "string")
    : [];
  return {
    fetched_at: typeof rec.fetched_at === "string" ? rec.fetched_at : new Date(0).toISOString(),
    is_business: rec.is_business === true,
    chat_name: typeof rec.chat_name === "string" ? rec.chat_name : null,
    about: typeof rec.about === "string" ? rec.about : null,
    description: typeof rec.description === "string" ? rec.description : null,
    address: typeof rec.address === "string" ? rec.address : null,
    email: typeof rec.email === "string" ? rec.email : null,
    websites,
    categories,
    hours_mode: mode as WaLeadHoursMode,
    timezone: typeof rec.timezone === "string" && rec.timezone ? rec.timezone : "America/Sao_Paulo",
    days,
    greeting_name: typeof rec.greeting_name === "string" && rec.greeting_name.trim()
      ? rec.greeting_name.trim()
      : null,
  };
}

/**
 * Loja aceita mensagem nossa AGORA?
 * true/false quando sabemos o relogio; null = nao sabemos (usar janela da Camila).
 * appointmentOnly sem hora: so dias listados + 9h-18h BRT (nao inventar expediente).
 */
export function isLeadAcceptingOutbound(
  profile: WaLeadProfile | null | undefined,
  now: Date,
): boolean | null {
  if (!profile) return null;
  if (profile.hours_mode === "not_business" || profile.hours_mode === "unknown") return null;
  if (profile.hours_mode === "alwaysOpen") return true;
  const { weekday, minuteOfDay } = zonedClock(now, profile.timezone || "America/Sao_Paulo");
  const today = profile.days.filter((d) => d.weekday === weekday);
  if (profile.hours_mode === "appointmentOnly") {
    if (!profile.days.length) return null;
    if (!today.length) return false;
    return minuteOfDay >= 9 * 60 && minuteOfDay < 18 * 60;
  }
  if (profile.hours_mode === "specificHours") {
    if (!today.length) return false;
    return today.some((d) => {
      if (d.openMin == null || d.closeMin == null) return false;
      return minuteOfDay >= d.openMin && minuteOfDay < d.closeMin;
    });
  }
  return null;
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function hoursLines(profile: WaLeadProfile): string {
  if (profile.hours_mode === "not_business") {
    return "- Conta WhatsApp comum (sem perfil business / sem horario publicado).";
  }
  if (profile.hours_mode === "appointmentOnly") {
    const days = [...new Set(profile.days.map((d) => DOW_PT[d.weekday]))].join(", ");
    return `- Horario: SOMENTE COM HORA MARCADA (${days || "dias nao listados"}). Relogio de porta NAO veio na API — mensagem nossa fora do comercial 9h-18h tende a cair no autoatendimento.`;
  }
  if (profile.hours_mode === "specificHours" && profile.days.length) {
    const lines = profile.days.map((d) => {
      const day = DOW_PT[d.weekday] ?? "?";
      if (d.openMin == null || d.closeMin == null) return `- ${day}: horario incompleto`;
      return `- ${day}: ${fmtMin(d.openMin)}-${fmtMin(d.closeMin)}`;
    });
    return `- Horario publicado (fuso ${profile.timezone}):\n${lines.join("\n")}`;
  }
  return "- Horario de funcionamento: nao publicado.";
}

export function formatWaLeadBrainContext(
  profile: WaLeadProfile | null | undefined,
  now: Date,
  visitorName?: string | null,
): string {
  if (!profile) return "";
  const open = isLeadAcceptingOutbound(profile, now);
  const openLine = open == null
    ? "- Agora: NAO SABEMOS se a loja esta aberta (nao invente)."
    : open
    ? "- Agora: loja em horario de atendimento (pelo perfil)."
    : "- Agora: FORA DO HORARIO DELES. Mensagem nossa pode disparar autoatendimento da loja. Nao peca atendimento imediato; nao 'ainda por aqui?' como se ela tivesse te ignorado.";
  const vocative = profile.greeting_name
    ? `- Vocativo seguro: ${profile.greeting_name}. PROIBIDO apelido de categoria (LASH, Expert, Maquiagem, Studio).`
    : "- Vocativo: NAO use nome generico. Se nao tiver nome de pessoa, fale sem 'Oi, X'.";
  const visitor = String(visitorName ?? "").trim();
  const visitorWarn = visitor && profile.greeting_name &&
      visitor.toLowerCase() !== profile.greeting_name.toLowerCase()
    ? `- O CRM ainda mostra "${visitor}" — lixo de Instagram/categoria, NAO o nome dela.`
    : "";
  const bits = [
    vocative,
    visitorWarn,
    profile.chat_name && !/^\d{10,13}$/.test(profile.chat_name)
      ? `- Nome no WhatsApp (chat): ${profile.chat_name}`
      : "",
    profile.description ? `- Descricao do perfil business: ${profile.description.slice(0, 400)}` : "",
    profile.address ? `- Endereco: ${profile.address}` : "",
    profile.categories.length ? `- Categoria: ${profile.categories.join(", ")}` : "",
    profile.websites.length ? `- Sites/Instagram no perfil: ${profile.websites.slice(0, 3).join(" | ")}` : "",
    hoursLines(profile),
    openLine,
  ].filter(Boolean);
  return (
    `\n=======================================\n` +
    `PERFIL WHATSAPP DESTA LEAD (API Z-API, salvo no lead — fato, nao chute)\n` +
    `=======================================\n` +
    `${bits.join("\n")}\n`
  );
}
