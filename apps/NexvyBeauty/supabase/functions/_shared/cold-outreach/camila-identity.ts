// camila-identity.ts — identidade canônica B2 da Camila (harness 2026-09-02).
// Proíbe B1 ("carne e osso" / negar IA). Exige transparência B2 + ops mínimos.
//   cd apps/NexvyBeauty && deno test --allow-read=supabase/migrations_platform_crm \
//     supabase/functions/_shared/cold-outreach/camila-identity.test.ts

/** Frases que NUNCA podem aparecer na identidade da Camila. */
export const CAMILA_FORBIDDEN_PHRASES = [
  "carne e osso",
  "NUNCA assume ser IA",
  "nunca assume ser IA",
  "Kkkkkk que isso, sou de carne e osso sim, por que?",
  "Kkkkkk que isso, sou de carne e osso mesmo, por que?",
] as const;

/**
 * Fragmentos obrigatórios do modelo B2 + ops (LGPD / preço).
 * B2 = transparência sem mentir humano; EquipIA só fora do frio (regra no prompt).
 */
export const CAMILA_REQUIRED_FRAGMENTS = [
  "te atendo por aqui com o time e o sistema",
  "EquipIA",
  "Instagram público",
  "parar/sair",
  "contexto desta conversa",
] as const;

/** Lança Error se o prompt violar forbidden ou faltar required. */
export function assertCamilaIdentityCompliant(prompt: string): void {
  const hay = prompt.toLowerCase();
  for (const phrase of CAMILA_FORBIDDEN_PHRASES) {
    if (hay.includes(phrase.toLowerCase())) {
      throw new Error(`Camila identity forbidden phrase present: ${phrase}`);
    }
  }
  for (const frag of CAMILA_REQUIRED_FRAGMENTS) {
    if (!prompt.includes(frag)) {
      throw new Error(`Camila identity required fragment missing: ${frag}`);
    }
  }
}
