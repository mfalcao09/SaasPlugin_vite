/**
 * Regras puras da vigia 48h da torre Camila.
 */

export type WatchSnapshot = {
  evolution_open: boolean;
  opt_outs_last_hour: number;
  send_failures_last_hour: number;
  queue_depth: number;
  hours_since_pilot_start: number;
};

export type WatchVerdict = {
  severity: "ok" | "warn" | "kill_recommend";
  reasons: string[];
};

export function evaluateWatch(s: WatchSnapshot): WatchVerdict {
  const reasons: string[] = [];
  if (!s.evolution_open) reasons.push("canal_evolution_nao_open");
  if (s.opt_outs_last_hour >= 2) reasons.push("opt_out_spike");
  if (s.send_failures_last_hour >= 3) reasons.push("send_failures_spike");
  if (s.queue_depth > 50) reasons.push("queue_backlog");
  if (s.hours_since_pilot_start > 48) reasons.push("watch_window_ended");

  if (reasons.some((r) => r === "canal_evolution_nao_open" || r === "opt_out_spike" || r === "send_failures_spike")) {
    return { severity: "kill_recommend", reasons };
  }
  if (reasons.length) return { severity: "warn", reasons };
  return { severity: "ok", reasons: ["healthy"] };
}
