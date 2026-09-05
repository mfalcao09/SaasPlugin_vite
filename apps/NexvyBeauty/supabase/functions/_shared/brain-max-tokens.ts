/**
 * Teto de tokens de SAÍDA do platform-sales-brain por persona.
 *
 * Camila (prospector) manda 3–4 bolhas por turno; 256 truncava no meio da frase
 * (Deise 2026-09-03: "…como a NexvyB"). SDR/closer mantêm 256 (1–2 bolhas).
 *
 * 512 falhou weight_exceeds_budget com prompt Camila ~13k (2026-09-01); prompt
 * encolheu (~8k) — 512 volta a caber.
 */
export const BRAIN_MAX_OUTPUT_TOKENS_SDR = 256;
export const BRAIN_MAX_OUTPUT_TOKENS_PROSPECTOR = 512;

export function resolveBrainMaxOutputTokens(personaIsProspector: boolean): number {
  return personaIsProspector ? BRAIN_MAX_OUTPUT_TOKENS_PROSPECTOR : BRAIN_MAX_OUTPUT_TOKENS_SDR;
}
