// deno test — prova a identidade transparente da Camila (sem mentir "carne e osso").
//   cd apps/NexvyBeauty && deno test --frozen --allow-read=supabase/migrations_platform_crm \
//     supabase/functions/_shared/cold-outreach/camila-identity.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertCamilaIdentityCompliant,
  CAMILA_FORBIDDEN_PHRASES,
  CAMILA_REQUIRED_FRAGMENTS,
} from "./camila-identity.ts";

const LYING_REPLY = "Kkkkkk que isso, sou de carne e osso sim, por que?";

const TRANSPARENT_PROMPT =
  `VOCÊ É A CAMILA — assistente comercial e gestora de produtos da Nexvy.\n` +
  `IDENTIDADE: você é automação da Nexvy. Se perguntarem se você é robô/bot/IA/automação, ` +
  `responda com honestidade e não negue — diga que é a Camila, assistente automatizada da Nexvy, e siga ajudando. Nunca finja ser humana.\n` +
  `PREÇO E CHECKOUT: Use SOMENTE o preço e o link que vierem no contexto desta conversa.\n` +
  `RESPEITO E LGPD: na 1ª mensagem diga quem você é e de onde veio o contato ("vi o Instagram público do salão"). ` +
  `Se ela pedir pra parar/sair (PARE), respeite na hora e pare — o motor grava o opt-out.`;

/** Prompt that used to false-pass with weak tokens (Camila+Nexvy+não negue) without admitting automation. */
const FALSE_PASS_WITHOUT_AUTOMATION =
  `Camila da Nexvy. Vi o Instagram público. Em preço, não negue o valor pedido.\n` +
  `Se pedir parar/sair, pare. Use só o contexto desta conversa.`;

const HONESTY_FRAGMENTS = [
  "assistente automatizada",
  "automação",
  "robô/bot/IA/automação",
  "Nunca finja ser humana",
] as const;

Deno.test("forbidden phrases: carne e osso, NUNCA assume ser IA, e a resposta mentirosa exata", () => {
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes("carne e osso"), true);
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes("NUNCA assume ser IA"), true);
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes(LYING_REPLY), true);
});

Deno.test("required fragments: honesty tokens force admitting automation + ops fragments", () => {
  for (const frag of HONESTY_FRAGMENTS) {
    assertEquals(
      CAMILA_REQUIRED_FRAGMENTS.some((r) => r === frag),
      true,
      `fragmento de honestidade ausente da exportação: ${frag}`,
    );
  }
  for (
    const frag of [
      "Instagram público",
      "parar/sair",
      "contexto desta conversa",
    ]
  ) {
    assertEquals(
      CAMILA_REQUIRED_FRAGMENTS.some((r) => r === frag),
      true,
      `fragmento operacional ausente da exportação: ${frag}`,
    );
  }
  // Weak tokens alone must NOT be enough to satisfy the export list.
  assertEquals(CAMILA_REQUIRED_FRAGMENTS.includes("não negue" as never), false);
});

Deno.test("assertCamilaIdentityCompliant: aceita prompt transparente", () => {
  assertCamilaIdentityCompliant(TRANSPARENT_PROMPT);
});

Deno.test("assertCamilaIdentityCompliant: rejeita false-pass sem admitir automação", () => {
  assertThrows(
    () => assertCamilaIdentityCompliant(FALSE_PASS_WITHOUT_AUTOMATION),
    Error,
    "required fragment missing",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita frase proibida", () => {
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(TRANSPARENT_PROMPT + "\n" + LYING_REPLY),
    Error,
    "carne e osso",
  );
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(
        TRANSPARENT_PROMPT.replace(
          "Nunca finja ser humana",
          "NUNCA assume ser IA",
        ),
      ),
    Error,
    "NUNCA assume ser IA",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita frase proibida case-insensitive", () => {
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(
        TRANSPARENT_PROMPT + "\nSOU DE CARNE E OSSO SIM",
      ),
    Error,
    "carne e osso",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita fragmento obrigatório ausente", () => {
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(
        TRANSPARENT_PROMPT.replace("Instagram público", "rede social"),
      ),
    Error,
    "Instagram público",
  );
});

Deno.test("migration 20260809: seed transparente tem fragmentos e sem proibições", async () => {
  const url = new URL(
    "../../../migrations_platform_crm/20260809_seed_bdr_camila_transparent_identity.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(url);
  assertCamilaIdentityCompliant(sql);
  assertEquals(sql.includes("68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"), true);
  assertEquals(sql.includes("INSERT"), false);
  assertEquals(/UPDATE\s+public\.platform_crm_product_agents/i.test(sql), true);
  assertEquals(sql.includes("Camila · Prospecção"), true);
  assertEquals(sql.includes("google/gemini-2.5-flash"), true);
  assertEquals(sql.includes("RAISE WARNING"), true);
  assertEquals(sql.includes("NÃO APLICAR EM PRODUÇÃO"), true);
  assertEquals(sql.includes("20260804"), true);
});
