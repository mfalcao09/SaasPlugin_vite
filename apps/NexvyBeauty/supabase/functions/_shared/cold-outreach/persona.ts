// _shared/cold-outreach/persona.ts
//
// Seletor PURO da persona BDR (prospector) do cold outreach. Espelha o PADRÃO de
// `_shared/agent-routing.ts` (isSdrAgent/pickSdrPersona) — mas é ISOLADO: aquele
// arquivo é do PR #68 (não está em origin/main) e NÃO deve ser tocado. Aqui o
// motor cold escolhe o abridor de saída (BDR), o inverso do SDR inbound.
// Blueprint §4.2: agent_type='prospector' + reconhecimento próprio.
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/persona.test.ts

/** Subconjunto de `platform_crm_product_agents` que o seletor precisa. */
export interface AgentLike {
  id: string;
  name?: string | null;
  agent_type?: string | null;
  is_active?: boolean | null;
}

function hay(a: AgentLike): string {
  return `${a.agent_type ?? ""} ${a.name ?? ""}`.toLowerCase();
}

/** É o BDR/prospector? Por agent_type canônico OU fallback de nome. */
export function isProspectorAgent(a: AgentLike): boolean {
  if ((a.agent_type ?? "").toLowerCase() === "prospector") return true;
  const h = hay(a);
  return h.includes("prospector") || h.includes("prospec") || h.includes("bdr") || h.includes("outbound");
}

/** É a Duda (SDR)? — destino do handoff pós-"quero". Espelha isSdrAgent do #68. */
export function isSdrAgent(a: AgentLike): boolean {
  if ((a.agent_type ?? "").toLowerCase() === "sdr") return true;
  const h = hay(a);
  return h.includes("sdr") || h.includes("qualifica") || h.includes("duda");
}

/**
 * Escolhe o BDR abridor entre os agentes ATIVOS do produto. Retorna null se não
 * houver prospector — NUNCA cai em agents[0] (mesma disciplina anti-roleta do
 * pickSdrPersona: sem BDR explícito, o cold não abre com quem não devia).
 */
export function pickProspectorPersona<T extends AgentLike>(agents: T[]): T | null {
  return agents.find((a) => a.is_active !== false && isProspectorAgent(a)) ?? null;
}

/** Escolhe a Duda (SDR ativa) como destino de handoff. Null se não houver. */
export function pickSdrPersona<T extends AgentLike>(agents: T[]): T | null {
  return agents.find((a) => a.is_active !== false && isSdrAgent(a)) ?? null;
}
