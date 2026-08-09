// camila-identity.ts — regras PURAS da identidade transparente da Camila (BDR).
// Garante que o prompt NUNCA mente ("carne e osso" / "NUNCA assume ser IA") e
// contém os fragmentos obrigatórios de compliance (origem pública, honestidade
// sobre automação, PARE/opt-out, preço/link só do contexto vivo).
//   cd apps/NexvyBeauty && deno test --frozen --allow-read=supabase/migrations_platform_crm \
//     supabase/functions/_shared/cold-outreach/camila-identity.test.ts

/** Frases que NUNCA podem aparecer na identidade da Camila. */
export const CAMILA_FORBIDDEN_PHRASES = [
  "carne e osso",
  "NUNCA assume ser IA",
  "Kkkkkk que isso, sou de carne e osso sim, por que?",
] as const;

/**
 * Fragmentos que DEVEM aparecer na identidade transparente da Camila.
 * Honesty tokens are strong on purpose: weak "Camila"+"Nexvy"+"não negue" alone
 * must NOT satisfy compliance (see false-pass test).
 */
export const CAMILA_REQUIRED_FRAGMENTS = [
  "assistente automatizada",
  "automação",
  "robô/bot/IA/automação",
  "Nunca finja ser humana",
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
