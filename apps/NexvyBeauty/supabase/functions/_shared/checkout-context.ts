// _shared/checkout-context.ts
// Monta a seção LINKS DE PAGAMENTO + benefícios/limites do plano (fonte = banco).
//   deno test --allow-read supabase/functions/_shared/checkout-context.test.ts

export type CheckoutPlanRow = {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  price_monthly?: number | string | null;
  list_price_monthly?: number | string | null;
  checkout_url?: string | null;
  max_connections?: number | null;
  max_users?: number | null;
  max_ai_agents?: number | null;
  feature_whatsapp?: boolean | null;
  feature_instagram?: boolean | null;
  feature_scheduling?: boolean | null;
  feature_ai_agents?: boolean | null;
  feature_pipeline?: boolean | null;
  feature_campaigns?: boolean | null;
  feature_kanban?: boolean | null;
};

/** Atribuição ?src= — 1º token do nome ('Duda — SDR' → 'duda'), igual ao brain. */
export function appendSellerRef(url: string | null | undefined, personaName: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  const src = String(personaName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")[0];
  if (!src) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.set("src", src);
    return u.toString();
  } catch {
    return raw;
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Benefícios/limites legíveis — só o que veio do banco (sem inventar). */
export function planBenefitsLine(p: CheckoutPlanRow): string {
  const parts: string[] = [];
  const desc = String(p.description ?? "").trim();
  if (desc) parts.push(desc);

  const connections = numOrNull(p.max_connections);
  if (connections != null) {
    parts.push(
      connections === 1
        ? "1 conexão WhatsApp"
        : `${connections} conexões WhatsApp`,
    );
  }
  const users = numOrNull(p.max_users);
  if (users != null) {
    parts.push(users === 1 ? "1 usuário" : `até ${users} usuários`);
  }
  const agents = numOrNull(p.max_ai_agents);
  if (agents != null) {
    parts.push(agents === 1 ? "1 agente de IA" : `até ${agents} agentes de IA`);
  }

  const flags: string[] = [];
  if (p.feature_whatsapp) flags.push("WhatsApp");
  if (p.feature_instagram) flags.push("Instagram");
  if (p.feature_scheduling) flags.push("agenda");
  if (p.feature_ai_agents) flags.push("agentes de IA");
  if (p.feature_pipeline) flags.push("pipeline/CRM");
  if (p.feature_campaigns) flags.push("campanhas");
  if (p.feature_kanban) flags.push("kanban");
  if (flags.length) parts.push(`inclui: ${flags.join(", ")}`);

  return parts.join(" · ");
}

/**
 * Seção injetada no prompt do brain (Duda/Camila).
 * Preço + link + benefícios/limites — fonte única do banco nesta request.
 */
export function buildCheckoutContext(
  plans: CheckoutPlanRow[],
  personaName: string,
): string {
  if (!plans.length) return "";
  let ctx =
    `\n## LINKS DE PAGAMENTO (a sua maquininha — mande o link DIRETO quando o cliente DECIDIR contratar)\n` +
    `Cada linha traz: preço, o que o plano inclui (benefícios), limites (conexões WhatsApp / usuários / agentes de IA) e o link.\n` +
    `Quando ela perguntar diferenças entre planos, benefícios ou "quantas conexões", use EXATAMENTE estes números — não invente.\n`;

  for (const p of plans) {
    const url = appendSellerRef(p.checkout_url, personaName);
    const list = numOrNull(p.list_price_monthly);
    const price = numOrNull(p.price_monthly);
    const priceLabel =
      list != null && price != null && list > price
        ? `custa R$${list}, hoje sai por R$${price}`
        : price != null
        ? `R$${price}`
        : "preço sob consulta";
    const benefits = planBenefitsLine(p);
    ctx += `- *${p.name}* (${priceLabel})`;
    if (benefits) ctx += `\n  Inclui: ${benefits}`;
    ctx += `\n  Link: ${url}\n`;
  }

  ctx +=
    `REGRA: cliente que já decidiu ("quero contratar", "como pago", "quero começar") NÃO precisa de demonstração nem de passar pra ninguém — mande o link do plano recomendado, diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição. O cliente QUALIFICADO que ainda está EM DÚVIDA/CÉTICO é SEU também: aprofunde o valor e conduza ao fechamento você mesma — não existe passar adiante.\n` +
    `REGRA DE LIMITES: conexões WhatsApp, usuários e agentes de IA só valem se aparecerem acima. Se um número não estiver na linha do plano, diga que confirma e NÃO chute.\n`;
  return ctx;
}
