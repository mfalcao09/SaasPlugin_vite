// deno test — prova identidade B2 da Camila (sem mentir "carne e osso").
//   cd apps/NexvyBeauty && deno test --allow-read=supabase/migrations_platform_crm \
//     supabase/functions/_shared/cold-outreach/camila-identity.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertCamilaIdentityCompliant,
  CAMILA_FORBIDDEN_PHRASES,
  CAMILA_REQUIRED_FRAGMENTS,
} from "./camila-identity.ts";

const LYING_REPLY = "Kkkkkk que isso, sou de carne e osso mesmo, por que?";

const B2_PROMPT =
  `VOCÊ É A CAMILA — assistente comercial da NexvyBeauty.\n` +
  `IDENTIDADE (B2): Se perguntarem se você é robô/bot/IA — transparência:\n` +
  `"Sou a Camila, da Nexvy — te atendo por aqui com o time e o sistema. Por que a pergunta?"\n` +
  `EquipIA / "agentes de IA": NÃO no frio (Mode A/B, R1/R2). SIM a partir do beat "o que faz".\n` +
  `PREÇO E CHECKOUT: Use SOMENTE o preço e o link que vierem no contexto desta conversa.\n` +
  `RESPEITO E LGPD: na 1ª mensagem diga quem você é e de onde veio o contato ("vi o Instagram público do salão"). ` +
  `Se ela pedir pra parar/sair, respeite na hora e pare — o motor grava o opt-out.`;

const FALSE_PASS_WITHOUT_B2 =
  `Camila da Nexvy. Vi o Instagram público. Em preço, use o contexto desta conversa.\n` +
  `Se pedir parar/sair, pare. EquipIA ok.`;

Deno.test("forbidden phrases: carne e osso / negar IA / resposta mentirosa", () => {
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes("carne e osso"), true);
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes("NUNCA assume ser IA"), true);
  assertEquals(CAMILA_FORBIDDEN_PHRASES.includes(LYING_REPLY), true);
});

Deno.test("required fragments: B2 phrase + EquipIA + ops", () => {
  for (
    const frag of [
      "te atendo por aqui com o time e o sistema",
      "EquipIA",
      "Instagram público",
      "parar/sair",
      "contexto desta conversa",
    ]
  ) {
    assertEquals(
      CAMILA_REQUIRED_FRAGMENTS.some((r) => r === frag),
      true,
      `fragmento ausente da exportação: ${frag}`,
    );
  }
});

Deno.test("assertCamilaIdentityCompliant: aceita prompt B2", () => {
  assertCamilaIdentityCompliant(B2_PROMPT);
});

Deno.test("assertCamilaIdentityCompliant: rejeita false-pass sem frase B2", () => {
  assertThrows(
    () => assertCamilaIdentityCompliant(FALSE_PASS_WITHOUT_B2),
    Error,
    "required fragment missing",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita frase proibida", () => {
  assertThrows(
    () => assertCamilaIdentityCompliant(B2_PROMPT + "\n" + LYING_REPLY),
    Error,
    "carne e osso",
  );
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(
        B2_PROMPT + "\nIDENTIDADE: você NUNCA assume ser IA.",
      ),
    Error,
    "NUNCA assume ser IA",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita frase proibida case-insensitive", () => {
  assertThrows(
    () => assertCamilaIdentityCompliant(B2_PROMPT + "\nSOU DE CARNE E OSSO SIM"),
    Error,
    "carne e osso",
  );
});

Deno.test("assertCamilaIdentityCompliant: rejeita fragmento obrigatório ausente", () => {
  assertThrows(
    () =>
      assertCamilaIdentityCompliant(
        B2_PROMPT.replace("Instagram público", "rede social"),
      ),
    Error,
    "Instagram público",
  );
});

Deno.test("migration 20260903: seed B2 tem fragmentos e sem proibições", async () => {
  const url = new URL(
    "../../../migrations_platform_crm/20260903_camila_identity_b2.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(url);
  assertCamilaIdentityCompliant(sql);
  assertEquals(sql.includes("68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"), true);
  assertEquals(sql.includes("INSERT"), false);
  assertEquals(/UPDATE\s+public\.platform_crm_product_agents/i.test(sql), true);
  assertEquals(sql.toLowerCase().includes("carne e osso"), false);
});
