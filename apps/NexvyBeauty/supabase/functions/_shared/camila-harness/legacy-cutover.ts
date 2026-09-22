// Legacy Camila senders — master fail-closed cutover (PRD-12).
// Default OFF: Path A reopen, R2 auto, cold tick, apresentar, conductor = 0 sends
// even if an isolated secret is flipped. Re-enable only with LEGACY_CAMILA_SENDERS=1
// (explicit emergency / forensic — not the pilot path).

export const LEGACY_TICK_RETIRED = "legacy_tick_retired";
export const LEGACY_CONDUCTOR_RETIRED = "legacy_conductor_retired";
export const LEGACY_R2_RETIRED = "legacy_r2_retired";
export const LEGACY_APRESENTAR_RETIRED = "legacy_apresentar_retired";
export const LEGACY_PATH_A_RETIRED = "legacy_path_a_retired";

export function legacyCamilaSendersEnabled(
  envGet: (k: string) => string | undefined = (k) =>
    typeof Deno !== "undefined" ? Deno.env.get(k) : undefined,
): boolean {
  return envGet("LEGACY_CAMILA_SENDERS") === "1";
}

/** Path A reopen/R2 mutate path — dead unless legacy master ON. */
export function pathARuntimeAllowed(
  envGet: (k: string) => string | undefined = (k) =>
    typeof Deno !== "undefined" ? Deno.env.get(k) : undefined,
): boolean {
  if (!legacyCamilaSendersEnabled(envGet)) return false;
  const raw = String(envGet("PATH_A_RUNTIME") ?? "off").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true";
}
