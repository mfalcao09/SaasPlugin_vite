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

/** Por que esta persona foi escolhida — o handler usa pra decidir se ALARMA. */
export type PersonaRouteReason =
  /** current_agent_id aponta um agente ativo+WhatsApp do produto: é ele quem fala. */
  | 'pinned'
  /** Sem pin: a SDR (Duda) abre a conversa. Caminho normal. */
  | 'sdr_open'
  /** PIN ÓRFÃO — o agente pinado NÃO está entre os ativos+WhatsApp do produto
   *  (desativado, removido, tirado do WhatsApp, ou handoff que apontou pra um
   *  agente que o cérebro não consegue usar). A SDR ASSUME — invariante: conversa
   *  nunca fica sem dono. O handler DEVE alarmar: é handoff quebrado. */
  | 'sdr_fallback_orphan_pin'
  /** Nem pin válido nem SDR ativa: ninguém pode falar. Handler cala + alarma. */
  | 'no_persona';

export interface PersonaRoute {
  persona: Record<string, any> | null;
  reason: PersonaRouteReason;
  /** id do pin que não resolveu — preenchido quando houve pin que não casou. */
  orphanAgentId: string | null;
}

/**
 * ROTEAMENTO POR CONVERSA (linha travada Duda→Bia) — versão com DIAGNÓSTICO.
 *
 * Lei de negócio: a dona da conversa é sempre a SDR (Duda) até ela fazer o
 * handoff; e ela é responsável por qualquer conversa SEM agente atribuído ou cujo
 * handoff FALHOU. Ou seja: pin órfão → volta pra Duda, nunca fica muda.
 *
 * O fallback já era o comportamento; o que faltava era SABER que ele aconteceu
 * (um pin apontando pra agente desativado caía na Duda em silêncio absoluto —
 * indistinguível de uma conversa nova). Agora o motivo sai junto e o chamador
 * alarma.
 *
 * Retorna a persona escolhida — quem persiste current_agent_id é o handler.
 */
export function resolvePersonaForConversation(
  agents: Array<Record<string, any>>,
  currentAgentId: string | null,
): PersonaRoute {
  const orphanIfPinned = currentAgentId ?? null;
  if (!agents.length) return { persona: null, reason: 'no_persona', orphanAgentId: orphanIfPinned };

  if (currentAgentId) {
    const pinned = agents.find((a) => a.id === currentAgentId);
    if (pinned) return { persona: pinned, reason: 'pinned', orphanAgentId: null };
    // Pin não resolveu: handoff quebrado. Cai na SDR (dona por default) e DENUNCIA.
    const sdr = pickSdrPersona(agents);
    return sdr
      ? { persona: sdr, reason: 'sdr_fallback_orphan_pin', orphanAgentId: currentAgentId }
      : { persona: null, reason: 'no_persona', orphanAgentId: currentAgentId };
  }

  const sdr = pickSdrPersona(agents);
  return sdr
    ? { persona: sdr, reason: 'sdr_open', orphanAgentId: null }
    : { persona: null, reason: 'no_persona', orphanAgentId: null };
}

/**
 * ROTEAMENTO POR CONVERSA (linha travada Duda→Bia): se a conversa já aponta um
 * agente ativo do produto em current_agent_id, é ELE quem fala (a Bia continua a
 * venda que a Duda passou; a Nina responde quando pinada). Senão, o SDR (Duda)
 * abre. Wrapper fino de resolvePersonaForConversation — mantido pra chamadores
 * que não precisam do motivo. Comportamento IDÊNTICO ao anterior.
 */
export function pickPersonaForConversation(
  agents: Array<Record<string, any>>,
  currentAgentId: string | null,
): Record<string, any> | null {
  return resolvePersonaForConversation(agents, currentAgentId).persona;
}
