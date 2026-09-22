// First-contact package — FC-1, idempotency, resume ≤48h. Shadow (no send).

export const FC_BUBBLE_COUNT = 4;
export const FC_RESUME_MAX_MS = 48 * 3600 * 1000;

export type BubbleStatus = "pending" | "reserved" | "sent" | "failed" | "cancelled";

export type BubbleRecord = {
  index: number; // 1..4
  text: string;
  idempotencyKey: string;
  status: BubbleStatus;
};

export type FirstContactPackage = {
  packageId: string;
  goId: string;
  leadId: string;
  bubbles: BubbleRecord[];
  /** contacted starts at first sent bubble */
  firstSentAtIso: string | null;
  resumeUsed: boolean;
  realSends: number; // always 0 in shadow
};

export function createFirstContactPackage(input: {
  packageId: string;
  goId: string;
  leadId: string;
  scripts: string[]; // length 4
}): FirstContactPackage {
  const scripts = input.scripts.slice(0, FC_BUBBLE_COUNT);
  while (scripts.length < FC_BUBBLE_COUNT) scripts.push(`bolha_${scripts.length + 1}`);
  return {
    packageId: input.packageId,
    goId: input.goId,
    leadId: input.leadId,
    bubbles: scripts.map((text, i) => ({
      index: i + 1,
      text,
      idempotencyKey: `fc:${input.packageId}:b${i + 1}`,
      status: "pending" as const,
    })),
    firstSentAtIso: null,
    resumeUsed: false,
    realSends: 0,
  };
}

/** Shadow "send": mark sent; never increments realSends. Idempotent. */
export function shadowSendNext(
  pkg: FirstContactPackage,
  nowIso?: string,
): { pkg: FirstContactPackage; sent: BubbleRecord | null; duplicate: boolean } {
  const next = pkg.bubbles.find((b) => b.status === "pending" || b.status === "reserved");
  if (!next) return { pkg, sent: null, duplicate: false };
  if (next.status === "sent") return { pkg, sent: null, duplicate: true };

  const bubbles = pkg.bubbles.map((b) =>
    b.index === next.index ? { ...b, status: "sent" as const } : b
  );
  const firstSentAtIso = pkg.firstSentAtIso ?? (nowIso ?? new Date().toISOString());
  return {
    pkg: { ...pkg, bubbles, firstSentAtIso, realSends: 0 },
    sent: { ...next, status: "sent" },
    duplicate: false,
  };
}

/** Replay same bubble key → no duplicate send. */
export function shadowReplayBubble(
  pkg: FirstContactPackage,
  idempotencyKey: string,
): { duplicateBlocked: boolean; pkg: FirstContactPackage } {
  const b = pkg.bubbles.find((x) => x.idempotencyKey === idempotencyKey);
  if (!b) return { duplicateBlocked: false, pkg };
  if (b.status === "sent") return { duplicateBlocked: true, pkg };
  const r = shadowSendNext(pkg);
  return { duplicateBlocked: r.duplicate, pkg: r.pkg };
}

/**
 * FC-1: always complete remaining pending bubbles (even after hard mid-stream).
 * Returns updated package after forcing all pending → sent (shadow).
 */
export function shadowCompleteAll(pkg: FirstContactPackage, nowIso?: string): FirstContactPackage {
  let cur = pkg;
  for (let i = 0; i < FC_BUBBLE_COUNT + 1; i++) {
    const r = shadowSendNext(cur, nowIso);
    if (!r.sent) break;
    cur = r.pkg;
  }
  return cur;
}

export function pendingCount(pkg: FirstContactPackage): number {
  return pkg.bubbles.filter((b) => b.status === "pending" || b.status === "reserved").length;
}

export function allSent(pkg: FirstContactPackage): boolean {
  return pkg.bubbles.every((b) => b.status === "sent");
}

/** Resume within 48h: optional resume bubble text, then remaining. */
export function shadowResume(
  pkg: FirstContactPackage,
  input: {
    crashedAfterIndex: number; // last successfully sent
    nowMs: number;
    crashMs: number;
    resumeText: string;
  },
): { ok: boolean; reason?: string; pkg: FirstContactPackage; resumeBubble?: string } {
  if (input.nowMs - input.crashMs > FC_RESUME_MAX_MS) {
    return { ok: false, reason: "resume_window_expired", pkg };
  }
  const bubbles = pkg.bubbles.map((b) => {
    if (b.index <= input.crashedAfterIndex) return { ...b, status: "sent" as const };
    return { ...b, status: "pending" as const };
  });
  return {
    ok: true,
    pkg: { ...pkg, bubbles, resumeUsed: true, realSends: 0 },
    resumeBubble: input.resumeText,
  };
}

export function resumeCopy(daysAgo: 1 | 2, name = "tudo bem"): string {
  const when = daysAgo === 1 ? "ontem" : "anteontem";
  return `Oi, ${name}! Desculpe, acabei não conseguindo te responder dentro da minha janela de atendimento de ${when}. Mas vamos retomar por aqui!`;
}
