// Attendance windows — Camila Harness Engineering (única fonte de relógio).
// Fuso: America/Sao_Paulo. Fim de hora exclusivo (hour < endHour).
//
//   Comercial:  seg–sex 09h–18h BRT  → só abrir conversa nova (1ª das 4)
//   Estendida:  seg–sáb 08h–22h BRT  → continuar pacote / retomar / responder / saída
//   Domingo + feriado nacional → zero OUT e zero reply

export const HARNESS_TZ = "America/Sao_Paulo";

export type WindowConfig = {
  startHour: number;
  endHour: number;
  /** getDay(): 0=Dom … 6=Sáb */
  days: number[];
  timeZone: string;
};

/** Abrir conversa nova (1ª mensagem do pacote de 4). */
export const COMMERCIAL_WINDOW: WindowConfig = {
  startHour: 9,
  endHour: 18,
  days: [1, 2, 3, 4, 5],
  timeZone: HARNESS_TZ,
};

/** Continuar / retomar / responder / Mensagem de Saída. */
export const EXTENDED_WINDOW: WindowConfig = {
  startHour: 8,
  endHour: 22,
  days: [1, 2, 3, 4, 5, 6],
  timeZone: HARNESS_TZ,
};

export type AttendanceAction =
  | "open_new_package" // 1ª das 4 — abertura nova
  | "continue_package" // bolhas 2–4 do mesmo pacote
  | "resume_package" // retomar pacote incompleto (≤48h)
  | "reply" // lead escreveu; Camila responde
  | "exit_message"; // Mensagem de Saída

export type AttendanceVerdict = {
  allowed: boolean;
  /** Pode enviar (OUT). */
  canOut: boolean;
  /** Pode responder a inbound (IN). */
  canIn: boolean;
  reason: string;
  window: "commercial" | "extended" | "closed" | "none";
};

export function zonedParts(
  now: Date,
  timeZone = HARNESS_TZ,
): { hour: number; weekday: number; isoDate: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = map[get("weekday")] ?? 0;
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  return { hour, weekday, isoDate };
}

export function withinWindow(now: Date, cfg: WindowConfig): boolean {
  const { hour, weekday } = zonedParts(now, cfg.timeZone);
  if (!cfg.days.includes(weekday)) return false;
  return hour >= cfg.startHour && hour < cfg.endHour;
}

/**
 * Feriado nacional: só bloqueia se o calendário tiver datas.
 * Sem calendário (null/vazio) → não trata como feriado (domingo ainda fecha).
 */
export function isNationalHoliday(
  now: Date,
  holidayDates: ReadonlySet<string> | null | undefined,
): boolean {
  if (!holidayDates || holidayDates.size === 0) return false;
  return holidayDates.has(zonedParts(now).isoDate);
}

export function isClosedDay(
  now: Date,
  holidayDates?: ReadonlySet<string> | null,
): { closed: boolean; reason: "sunday" | "national_holiday" | null } {
  const { weekday } = zonedParts(now);
  if (weekday === 0) return { closed: true, reason: "sunday" };
  if (isNationalHoliday(now, holidayDates)) {
    return { closed: true, reason: "national_holiday" };
  }
  return { closed: false, reason: null };
}

/**
 * Decisão única de horário do Harness Engineering.
 * OUT e IN seguem a tabela do POLICY (fonte de verdade).
 */
export function decideAttendance(input: {
  now: Date;
  action: AttendanceAction;
  holidayDates?: ReadonlySet<string> | null;
}): AttendanceVerdict {
  const closed = isClosedDay(input.now, input.holidayDates);
  if (closed.closed) {
    return {
      allowed: false,
      canOut: false,
      canIn: false,
      reason: closed.reason === "sunday" ? "closed_sunday" : "closed_national_holiday",
      window: "closed",
    };
  }

  const inCommercial = withinWindow(input.now, COMMERCIAL_WINDOW);
  const inExtended = withinWindow(input.now, EXTENDED_WINDOW);

  switch (input.action) {
    case "open_new_package": {
      if (!inCommercial) {
        return {
          allowed: false,
          canOut: false,
          canIn: false,
          reason: "outside_commercial_window",
          window: "none",
        };
      }
      return {
        allowed: true,
        canOut: true,
        canIn: false, // ainda não há conversa; reply usa action=reply
        reason: "commercial_ok",
        window: "commercial",
      };
    }
    case "continue_package":
    case "resume_package":
    case "reply":
    case "exit_message": {
      if (!inExtended) {
        return {
          allowed: false,
          canOut: false,
          canIn: false,
          reason: "outside_extended_window",
          window: "none",
        };
      }
      const canIn = input.action === "reply" || input.action === "exit_message" ||
        input.action === "continue_package" || input.action === "resume_package";
      return {
        allowed: true,
        canOut: true,
        canIn,
        reason: "extended_ok",
        window: "extended",
      };
    }
  }
}

/** Inferir ação a partir do pacote de abertura (bolha 1 vs resto / retomada). */
export function attendanceActionForPackage(input: {
  packageStarted: boolean;
  resumeUsed?: boolean;
  nextBubbleIndex: number; // 1..4
}): AttendanceAction {
  if (input.resumeUsed) return "resume_package";
  if (!input.packageStarted || input.nextBubbleIndex <= 1) {
    return "open_new_package";
  }
  return "continue_package";
}

/** Instantes fixos BRT para testes (sem DST no Brasil). */
export const FIXTURE = {
  /** Terça 2026-09-15 10:00 BRT */
  tue1000: new Date("2026-09-15T13:00:00.000Z"),
  /** Terça 17:59 BRT */
  tue1759: new Date("2026-09-15T20:59:00.000Z"),
  /** Terça 18:00 BRT */
  tue1800: new Date("2026-09-15T21:00:00.000Z"),
  /** Terça 18:05 BRT */
  tue1805: new Date("2026-09-15T21:05:00.000Z"),
  /** Terça 21:59 BRT (= 00:59 UTC do dia seguinte) */
  tue2159: new Date("2026-09-16T00:59:00.000Z"),
  /** Terça 22:00 BRT */
  tue2200: new Date("2026-09-16T01:00:00.000Z"),
  /** Sábado 15:00 BRT 2026-09-19 */
  sat1500: new Date("2026-09-19T18:00:00.000Z"),
  /** Domingo 11:00 BRT 2026-09-20 */
  sun1100: new Date("2026-09-20T14:00:00.000Z"),
  /** Feriado 7/set/2026 11:00 BRT (segunda) */
  holiday1100: new Date("2026-09-07T14:00:00.000Z"),
} as const;
