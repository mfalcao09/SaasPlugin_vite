import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildCheckoutContext,
  planBenefitsLine,
} from "./checkout-context.ts";

const ESSENCIAL = {
  name: "Essencial",
  slug: "starter",
  description: "Recepcionista de IA + agenda + CRM. Para quem está começando.",
  price_monthly: 275,
  list_price_monthly: 450,
  checkout_url: "https://pay.example/essencial",
  max_connections: 1,
  max_users: 1,
  max_ai_agents: 1,
  feature_whatsapp: true,
  feature_scheduling: true,
  feature_ai_agents: true,
};

const PREMIUM = {
  name: "Premium",
  slug: "pro",
  description: "Atende, qualifica e reativa cliente sozinho.",
  price_monthly: 427,
  list_price_monthly: 720,
  checkout_url: "https://pay.example/premium",
  max_connections: 2,
  max_users: 5,
  max_ai_agents: 3,
  feature_whatsapp: true,
  feature_scheduling: true,
  feature_ai_agents: true,
  feature_pipeline: true,
};

Deno.test("planBenefitsLine inclui conexões / users / agentes", () => {
  const line = planBenefitsLine(ESSENCIAL);
  assertStringIncludes(line, "1 conexão WhatsApp");
  assertStringIncludes(line, "1 usuário");
  assertStringIncludes(line, "1 agente de IA");
  assertStringIncludes(line, "Recepcionista de IA");
});

Deno.test("planBenefitsLine Premium: 2 conexões", () => {
  const line = planBenefitsLine(PREMIUM);
  assertStringIncludes(line, "2 conexões WhatsApp");
  assertStringIncludes(line, "até 5 usuários");
  assertStringIncludes(line, "até 3 agentes de IA");
});

Deno.test("buildCheckoutContext: Camila vê benefícios e conexões com confiança", () => {
  const ctx = buildCheckoutContext([ESSENCIAL, PREMIUM], "Camila");
  assertStringIncludes(ctx, "LINKS DE PAGAMENTO");
  assertStringIncludes(ctx, "*Essencial*");
  assertStringIncludes(ctx, "1 conexão WhatsApp");
  assertStringIncludes(ctx, "*Premium*");
  assertStringIncludes(ctx, "2 conexões WhatsApp");
  assertStringIncludes(ctx, "custa R$450, hoje sai por R$275");
  assertStringIncludes(ctx, "src=camila");
  assertStringIncludes(ctx, "REGRA DE LIMITES");
  assertEquals(ctx.includes("3 conexões"), false); // não inventa
});

Deno.test("sem max_connections → não inventa número", () => {
  const line = planBenefitsLine({ name: "X", description: "Só texto" });
  assertEquals(line.includes("conexão"), false);
  assertEquals(line, "Só texto");
});
