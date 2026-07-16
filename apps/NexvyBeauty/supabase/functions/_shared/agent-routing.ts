// _shared/agent-routing.ts — ROTEAMENTO de personas do platform-sales-brain.
//
// Extraído do brain (P2 · PR-B) para ser UNIT-TESTÁVEL de forma isolada — a
// parte crítica-de-segurança do roteamento (quem fala no número oficial de
// vendas) merece uma golden suite própria. Funções PURAS: não tocam banco nem
// rede; recebem os agentes já carregados. Comportamento idêntico ao inline
// anterior — é porte, não reescrita.
//
// Migração nome→agent_type: PRIMÁRIO por agent_type ∈ {sdr, closer, retention};
// FALLBACK de transição por match-nome (o `hay` já incluía agent_type, então o
// tipo-primário é aditivo — Duda/Bia/Lia casam mesmo antes do backfill).

/** É o agente SDR (Duda) — abre/qualifica/recomenda? Base da linha travada. */
export function isSdrAgent(a: Record<string, any> | null): boolean {
  if (!a) return false;
  if ((a.agent_type ?? '').toLowerCase() === 'sdr') return true;
  const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
  return hay.includes('sdr') || hay.includes('qualifica') || hay.includes('duda');
}

/** É o agente closer (Bia) — recebe o dossiê e FECHA a venda? (a Bia JÁ era 'closer'). */
export function isCloserAgent(a: Record<string, any> | null): boolean {
  if (!a) return false;
  if ((a.agent_type ?? '').toLowerCase() === 'closer') return true;
  const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
  return hay.includes('closer') || hay.includes('bia');
}

/** É o agente de RETENÇÃO (Nina) — cuida de quem JÁ comprou. NUNCA abre conversa
 *  de venda: só é escolhida por PIN (current_agent_id, setado pelo nina-health-scan).
 *  Serve pra o brain entrar no MODO RETENÇÃO (sem links/preço, regras de cuidado)
 *  em vez de tratar a Nina como closer. */
export function isRetentionAgent(a: Record<string, any> | null): boolean {
  if (!a) return false;
  if ((a.agent_type ?? '').toLowerCase() === 'retention') return true;
  const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
  return hay.includes('retenç') || hay.includes('retenc') || hay.includes('retention') || hay.includes('nina');
}

/** Seleciona a persona SDR/qualificação (Duda) para ABRIR a conversa. Se não há
 *  SDR, retorna null — NÃO improvisa a primeira da lista. (P2 · PR-B: matar o
 *  `?? agents[0]`, a roleta que podia armar um casca no número oficial. Sem SDR
 *  → o guard `no_active_persona` do brain cala com segurança.) */
export function pickSdrPersona(agents: Array<Record<string, any>>): Record<string, any> | null {
  if (!agents.length) return null;
  return agents.find(isSdrAgent) ?? null;
}

/**
 * ROTEAMENTO POR CONVERSA (linha travada Duda→Bia): se a conversa já aponta um
 * agente ativo do produto em current_agent_id, é ELE quem fala (a Bia continua a
 * venda que a Duda passou; a Nina responde quando pinada). Senão, o SDR (Duda)
 * abre. Retorna a persona escolhida — quem persiste current_agent_id é o handler.
 */
export function pickPersonaForConversation(
  agents: Array<Record<string, any>>,
  currentAgentId: string | null,
): Record<string, any> | null {
  if (!agents.length) return null;
  if (currentAgentId) {
    const pinned = agents.find((a) => a.id === currentAgentId);
    if (pinned) return pinned; // agente já em curso na conversa (ativo + WhatsApp)
  }
  return pickSdrPersona(agents);
}
