// camila-identity.ts — regras PURAS da identidade transparente da Camila (BDR).
// Garante que o prompt NUNCA mente ("carne e osso" / "NUNCA assume ser IA") e
// contém os fragmentos obrigatórios de compliance (Nexvy, origem pública, honestidade
// sobre automação, PARE/opt-out, preço/link só do contexto vivo).
//   deno test --frozen apps/NexvyBeauty/supabase/functions/_shared/cold-outreach/camila-identity.test.ts

/** Frases que NUNCA podem aparecer na identidade da Camila. */
export const CAMILA_FORBIDDEN_PHRASES = [
  "carne e osso",
  "NUNCA assume ser IA",
  "Kkkkkk que isso, sou de carne e osso sim, por que?",
] as const;

/** Fragmentos que DEVEM aparecer na identidade transparente da Camila. */
export const CAMILA_REQUIRED_FRAGMENTS = [
  "Camila",
  "Nexvy",
  "Instagram público",
  "não negue",
  "parar/sair",
  "contexto desta conversa",
] as const;

/** Lança Error se o prompt violar forbidden ou faltar required. */
export function assertCamilaIdentityCompliant(prompt: string): void {
  for (const phrase of CAMILA_FORBIDDEN_PHRASES) {
    if (prompt.includes(phrase)) {
      throw new Error(`Camila identity forbidden phrase present: ${phrase}`);
    }
  }
  for (const frag of CAMILA_REQUIRED_FRAGMENTS) {
    if (!prompt.includes(frag)) {
      throw new Error(`Camila identity required fragment missing: ${frag}`);
    }
  }
}
