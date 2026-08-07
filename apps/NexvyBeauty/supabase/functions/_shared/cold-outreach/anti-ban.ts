// _shared/cold-outreach/anti-ban.ts
//
// Núcleo PURO (sem banco/rede) da camada anti-ban do cold outreach.
// É "o que separa 1.200 de 300 leads tocados" (COLD-OUTREACH-SCRIPT §4): warm-up
// ramp, teto diário por número, jitter humano, janela comercial, dedupe e
// kill-switch. Tudo determinístico e testável por `deno test` com dados semeados.
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/anti-ban.test.ts
//
// Nenhuma destas funções envia nada — elas só DECIDEM (pode enviar? quantas hoje?
// quanto esperar? deve pausar?). O envio real vive no motor (platform-cold-outreach),
// gated por dry-run + flag.

import type { LifecycleVerdict } from "./campaign-lifecycle.ts";

// ── Warm-up ramp ────────────────────────────────────────────────────────────
// "começa ~20/dia, dobra a cada 2-3 dias" (COLD-OUTREACH-SCRIPT §4 / blueprint §5.3).
export interface WarmupConfig {
  /** teto do dia 1 de envios (chip novo) */
  startPerDay: number;
  /** de quantos em quantos dias o teto dobra */
  doublingEveryDays: number;
  /** teto máximo por dia depois de aquecido (proteção final) */
  maxPerDay: number;
}

export const DEFAULT_WARMUP: WarmupConfig = {
  startPerDay: 20,
  doublingEveryDays: 2,
  maxPerDay: 200,
};

/**
 * Teto de envios do dia N de vida da instância (warmupDay 1-indexado: dia 1 = 1º
 * dia disparando). Dobra a cada `doublingEveryDays`, saturando em `maxPerDay`.
 * Ex. (20, dobra/2d, cap 200): d1=20, d2=20, d3=40, d4=40, d5=80, d6=80, d7=160, d9+=200.
 */
export function warmupCapForDay(cfg: WarmupConfig, warmupDay: number): number {
  if (warmupDay < 1) return 0;
  const doublings = Math.floor((warmupDay - 1) / Math.max(1, cfg.doublingEveryDays));
  const cap = cfg.startPerDay * Math.pow(2, doublings);
  return Math.min(cfg.maxPerDay, Math.floor(cap));
}

/** Dia de warm-up (1-indexado) a partir da data do 1º envio. Nunca < 1. */
export function warmupDayFromFirstSend(firstSendAt: Date | null, now: Date): number {
  if (!firstSendAt) return 1;
  const ms = now.getTime() - firstSendAt.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** Quantos ainda cabem hoje sob o teto de warm-up. Nunca negativo. */
export function remainingToday(cfg: WarmupConfig, warmupDay: number, sentToday: number): number {
  return Math.max(0, warmupCapForDay(cfg, warmupDay) - Math.max(0, sentToday));
}

// ── Jitter humano ─────────────────────────────────────────────────────────────
// "jitter 40-180s entre envios" (COLD-OUTREACH-SCRIPT §5.2 / blueprint §5.3).
export interface JitterConfig {
  minMs: number;
  maxMs: number;
}

export const DEFAULT_JITTER: JitterConfig = { minMs: 40_000, maxMs: 180_000 };

/**
 * Intervalo aleatório (ms) a esperar antes do PRÓXIMO envio. `rng` injetável
 * (default Math.random) só p/ testes determinísticos — em runtime varia de verdade.
 */
export function jitterMs(cfg: JitterConfig = DEFAULT_JITTER, rng: () => number = Math.random): number {
  const lo = Math.min(cfg.minMs, cfg.maxMs);
  const hi = Math.max(cfg.minMs, cfg.maxMs);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ── Janela comercial (fuso America/Sao_Paulo) ────────────────────────────────
// "janela 9-18h Seg-Sex" (COLD-OUTREACH-SCRIPT §5.2). Weekday em getDay() JS:
// 0=Dom, 1=Seg, ... 6=Sáb. Default = Seg-Sex.
export interface WindowConfig {
  startHour: number;
  endHour: number;
  /** dias permitidos em convenção getDay() (0=Dom..6=Sáb) */
  days: number[];
  timeZone: string;
}

export const DEFAULT_WINDOW: WindowConfig = {
  startHour: 9,
  endHour: 18,
  days: [1, 2, 3, 4, 5],
  timeZone: "America/Sao_Paulo",
};

/** Hora (0-23) e dia-da-semana (0=Dom..6=Sáb) do `now` no fuso configurado. */
export function zonedParts(now: Date, timeZone: string): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // "24" em alguns runtimes p/ meia-noite → normaliza p/ 0.
  const hour = parseInt(hourStr, 10) % 24;
  return { hour, weekday: map[wdStr] ?? 0 };
}

/** Está dentro da janela comercial agora? */
export function withinWindow(now: Date, cfg: WindowConfig = DEFAULT_WINDOW): boolean {
  const { hour, weekday } = zonedParts(now, cfg.timeZone);
  if (!cfg.days.includes(weekday)) return false;
  return hour >= cfg.startHour && hour < cfg.endHour;
}

// ── Dedupe (anti-flood por lead) ─────────────────────────────────────────────
// "dedupe 24h" (COLD-OUTREACH-SCRIPT §5.2). Não re-tocar o mesmo lead dentro da janela.
export function dedupeOk(lastOutreachAt: Date | null, now: Date, windowHours = 24): boolean {
  if (!lastOutreachAt) return true;
  const hours = (now.getTime() - lastOutreachAt.getTime()) / 3_600_000;
  return hours >= windowHours;
}

// ── Kill-switch (circuit breaker por bloqueio/denúncia) ──────────────────────
// "pausa se taxa de bloqueio/denúncia passar do limiar" (COLD-OUTREACH-SCRIPT §5.2).
export interface KillSwitchConfig {
  /** fração máx de bloqueios sobre enviados (ex. 0.05 = 5%) */
  maxBlockRate: number;
  /** fração máx de denúncias/report sobre enviados (ex. 0.02 = 2%) */
  maxReportRate: number;
  /** amostra mínima antes de avaliar taxa (evita tripar em n pequeno) */
  minSample: number;
  /** falhas de ENVIO consecutivas que também tripam (número morto/derrubado) */
  maxConsecutiveFailures: number;
  /**
   * Fração máxima de NÃO-ENTREGA (sent sem ACK) tolerada. Default 0.4.
   * Este é o único sinal REAL de queima de número que existe — ver killSwitch().
   */
  maxUndeliveredRate?: number;
  /**
   * Amostra própria para o ramo de não-entrega. Default 30, maior que minSample
   * de propósito: ACK demora, e "ainda não entregou" não é "nunca vai entregar".
   */
  minSampleDelivery?: number;
}

export const DEFAULT_KILLSWITCH: KillSwitchConfig = {
  maxBlockRate: 0.05,
  maxReportRate: 0.02,
  minSample: 20,
  maxConsecutiveFailures: 10,
};

export interface KillSwitchStats {
  sent: number;
  blocked: number;
  reported: number;
  consecutiveFailures: number;
  /**
   * Entregas confirmadas por ACK (MESSAGES_UPDATE). OPCIONAL de propósito:
   * `undefined` significa "não sei", e quem não sabe não acusa. Só `number`
   * habilita o ramo de não-entrega — campo ausente nunca vira veredito.
   */
  delivered?: number;
}

export interface KillSwitchVerdict {
  tripped: boolean;
  reason: string | null;
}

/**
 * Decide se a campanha deve PAUSAR agora. Tripa por: falhas de envio consecutivas
 * (não precisa de amostra — número morto), OU taxa de bloqueio/denúncia acima do
 * limiar depois de amostra mínima. Retorna motivo pra logar e alertar.
 */
export function killSwitch(
  stats: KillSwitchStats,
  cfg: KillSwitchConfig = DEFAULT_KILLSWITCH,
): KillSwitchVerdict {
  if (stats.consecutiveFailures >= cfg.maxConsecutiveFailures) {
    return {
      tripped: true,
      reason: `consecutive_send_failures=${stats.consecutiveFailures} >= ${cfg.maxConsecutiveFailures}`,
    };
  }
  if (stats.sent >= cfg.minSample) {
    const blockRate = stats.blocked / stats.sent;
    if (blockRate > cfg.maxBlockRate) {
      return { tripped: true, reason: `block_rate=${blockRate.toFixed(3)} > ${cfg.maxBlockRate}` };
    }
    const reportRate = stats.reported / stats.sent;
    if (reportRate > cfg.maxReportRate) {
      return { tripped: true, reason: `report_rate=${reportRate.toFixed(3)} > ${cfg.maxReportRate}` };
    }
    // ⚠️ OS DOIS RAMOS ACIMA NÃO PODEM DISPARAR, e não é falta de trabalho: é
    // AUSÊNCIA DE SINAL. O WhatsApp NÃO notifica bloqueio nem denúncia — quando
    // alguém bloqueia, a mensagem só para de ser entregue (fica 'sent', nunca vira
    // 'delivered'). Não existe evento de webhook para nenhum dos dois.
    // Ficam aqui porque o limiar já está definido se um dia houver fonte — e o
    // motor DECLARA no log que roda sem eles.

  }

  {
    // ── TAXA DE NÃO-ENTREGA: o sinal que EXISTE ───────────────────────────────
    // FORA do `if (sent >= minSample)` de propósito. Aninhado ali, este ramo
    // ficava subordinado à amostra do OUTRO mecanismo: com minSample=20,
    // configurar minSampleDelivery=10 não tinha efeito nenhum — o portão externo
    // já havia barrado. Dois mecanismos independentes não podem compartilhar
    // porta de entrada, senão o mais restritivo vence em silêncio.
    // (Pego por teste; era acoplamento por proximidade, o mesmo defeito de forma
    // que o processFollowups tinha ao rodar antes do portão.)
    // Número saudável entrega quase tudo; número queimando para de entregar. É o
    // proxy REAL de bloqueio — indireto, com atraso e ruído, mas MENSURÁVEL,
    // porque MESSAGES_UPDATE chega (a instância já está subscrita nele).
    //
    // Amostra PRÓPRIA (default 30 > minSample 20) porque ACK demora: tratar
    // "ainda não entregou" como "nunca vai" pausaria a campanha por impaciência.
    //
    // `undefined` ≠ 0 de propósito: quem não sabe informar `delivered` não recebe
    // veredito. Campo ausente jamais vira acusação — mesma regra do
    // conversation_state (campo em dúvida OMITE, nunca assume default).
    if (typeof stats.delivered === 'number') {
      const amostra = cfg.minSampleDelivery ?? 30;
      if (stats.sent >= amostra) {
        const naoEntrega = (stats.sent - stats.delivered) / stats.sent;
        const teto = cfg.maxUndeliveredRate ?? 0.4;
        if (naoEntrega > teto) {
          return {
            tripped: true,
            reason: `undelivered_rate=${naoEntrega.toFixed(3)} > ${teto} ` +
              `(sent=${stats.sent} delivered=${stats.delivered}) — número provavelmente queimando`,
          };
        }
      }
    }
  }
  return { tripped: false, reason: null };
}

// ── Decisão composta: posso enviar 1 msg agora? ──────────────────────────────
export interface SendGateInput {
  now: Date;
  window: WindowConfig;
  warmup: WarmupConfig;
  warmupDay: number;
  sentToday: number;
  killStats: KillSwitchStats;
  killCfg: KillSwitchConfig;
  /**
   * Veredito do CICLO DE VIDA (campaign-lifecycle.ts) — estado + autorização +
   * vigência.
   *
   * Substituiu `campaignPaused: boolean`, que era CÓDIGO MORTO: o motor passava
   * `status === "paused"` depois de uma query que já filtrava
   * `in (active, warming)`, então a comparação nunca podia ser verdadeira. A
   * máquina de seis estados do banco chegava aqui achatada num bit sempre falso.
   *
   * Agora o portão consulta a máquina inteira, e um `active` sem carimbo de
   * autorização é recusado AQUI também — não só no `tickCampaign`. É redundância
   * deliberada, com fonte de verdade ÚNICA (a mesma função pura): dois pontos de
   * consulta, um mecanismo. O que não pode existir é o inverso — dois mecanismos
   * independentes decidindo a mesma coisa.
   */
  lifecycle: LifecycleVerdict;
}

export interface SendGateVerdict {
  canSend: boolean;
  reason: string | null;
  remaining: number;
}

/**
 * Portão único do tick: só libera envio se a campanha está ARMADA (estado +
 * autorização + vigência), o kill-switch não tripou, estamos na janela e ainda há
 * cota de warm-up hoje.
 *
 * O ciclo de vida vem PRIMEIRO de propósito: não faz sentido relatar
 * "outside_window" para uma campanha que nem foi autorizada — o motivo devolvido
 * deve ser sempre o mais fundamental.
 */
export function canSendNow(i: SendGateInput): SendGateVerdict {
  const remaining = remainingToday(i.warmup, i.warmupDay, i.sentToday);
  if (!i.lifecycle.armada) {
    return { canSend: false, reason: `lifecycle:${i.lifecycle.motivo}`, remaining };
  }
  const kill = killSwitch(i.killStats, i.killCfg);
  if (kill.tripped) return { canSend: false, reason: `kill_switch:${kill.reason}`, remaining };
  if (!withinWindow(i.now, i.window)) return { canSend: false, reason: "outside_window", remaining };
  if (remaining <= 0) return { canSend: false, reason: "daily_cap_reached", remaining };
  return { canSend: true, reason: null, remaining };
}
