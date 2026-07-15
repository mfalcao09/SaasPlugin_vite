// agent-routing.test.ts — SMOKE do roteador (P2 · PR-B · B5).
//
// Golden suite das funções PURAS de _shared/agent-routing.ts. Prova, sem deploy
// e sem banco, as 2 garantias que o Marcelo pediu:
//   (1) a Duda continua roteando (abre a conversa de venda);
//   (2) NENHUM casca (Nina/Nexvy/Orquestrador) é escolhido como abridor — nem
//       com os 3 ativos no WhatsApp (a defesa é a LÓGICA, não o kill-switch).
// Roda: deno test supabase/functions/_shared/agent-routing.test.ts
//
// Cobre pré- e pós-backfill (agent_type 'custom' vs 'sdr'/'retention') — a
// migração B4 não pode ser pré-requisito de correção.

import {
  isSdrAgent,
  isCloserAgent,
  isRetentionAgent,
  pickSdrPersona,
  pickPersonaForConversation,
} from './agent-routing.ts';

// Assert mínimo self-contained (sem dependência externa).
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} — esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  }
}

// Fixtures espelhando os agentes reais (nomes do inventário do blueprint).
// PRÉ-backfill: Duda/Nina são 'custom' (casam só por nome). PÓS: 'sdr'/'retention'.
const dudaCustom = { id: 'duda', name: 'Duda — SDR Qualificadora', agent_type: 'custom' };
const dudaSdr = { id: 'duda', name: 'Duda — SDR Qualificadora', agent_type: 'sdr' };
const bia = { id: 'bia', name: 'Bia — Closer', agent_type: 'closer' };
const lia = { id: 'lia', name: 'Lia · Implantação', agent_type: 'support' };
const ninaCustom = { id: 'nina', name: 'Nina — Sucesso, Suporte & Retenção', agent_type: 'custom' };
const ninaRet = { id: 'nina', name: 'Nina — Sucesso, Suporte & Retenção', agent_type: 'retention' };
const nexvy = { id: 'nexvy', name: 'Nexvy — Ativação Pós-Venda', agent_type: 'custom' };
const orq = { id: 'orq', name: 'Orquestrador Cliente-de-Volta', agent_type: 'custom' };

const cascas = [ninaCustom, nexvy, orq];

Deno.test('isSdrAgent — só a Duda (por nome pré-backfill E por tipo pós)', () => {
  eq(isSdrAgent(dudaCustom), true, 'Duda custom casa por nome');
  eq(isSdrAgent(dudaSdr), true, 'Duda casa por agent_type=sdr');
  eq(isSdrAgent(bia), false, 'Bia não é SDR');
  eq(isSdrAgent(lia), false, 'Lia não é SDR');
  eq(isSdrAgent(ninaCustom), false, 'Nina não é SDR');
  eq(isSdrAgent(nexvy), false, 'Nexvy não é SDR');
  eq(isSdrAgent(orq), false, 'Orquestrador não é SDR');
  eq(isSdrAgent(null), false, 'null não é SDR');
});

Deno.test('isCloserAgent — só a Bia (já era closer por tipo)', () => {
  eq(isCloserAgent(bia), true, 'Bia casa por agent_type=closer');
  eq(isCloserAgent(dudaSdr), false, 'Duda não é closer');
  eq(isCloserAgent(ninaRet), false, 'Nina não é closer');
  eq(isCloserAgent(nexvy), false, 'Nexvy não é closer');
  eq(isCloserAgent(orq), false, 'Orquestrador não é closer');
  eq(isCloserAgent(lia), false, 'Lia não é closer');
});

Deno.test('isRetentionAgent — só a Nina (por nome pré-backfill E por tipo pós)', () => {
  eq(isRetentionAgent(ninaCustom), true, 'Nina custom casa por nome (nina/retenç)');
  eq(isRetentionAgent(ninaRet), true, 'Nina casa por agent_type=retention');
  eq(isRetentionAgent(dudaSdr), false, 'Duda não é retenção');
  eq(isRetentionAgent(bia), false, 'Bia não é retenção');
  eq(isRetentionAgent(lia), false, 'Lia não é retenção');
  eq(isRetentionAgent(nexvy), false, 'Nexvy (ativação) não é retenção');
  eq(isRetentionAgent(orq), false, 'Orquestrador não é retenção');
});

Deno.test('pickSdrPersona — Duda abre; SEM Duda → null (NUNCA um casca)', () => {
  // Com a Duda presente (pré e pós-backfill), ela abre.
  eq(pickSdrPersona([dudaCustom, bia, lia, ...cascas])?.id, 'duda', 'Duda custom abre');
  eq(pickSdrPersona([dudaSdr, bia, lia, ninaRet, nexvy, orq])?.id, 'duda', 'Duda sdr abre');
  // CRÍTICO: sem SDR, retorna null — mesmo com os 3 cascas ativos. NADA de agents[0].
  eq(pickSdrPersona([bia, lia, ...cascas]), null, 'sem Duda → null (não Bia, não casca)');
  eq(pickSdrPersona(cascas), null, 'só cascas ativos → null (arma desarmada)');
  eq(pickSdrPersona([]), null, 'lista vazia → null');
});

Deno.test('pickPersonaForConversation — pin respeitado; sem SDR e sem pin → null', () => {
  const full = [dudaSdr, bia, lia, ninaRet, nexvy, orq];
  // Sem pin: a Duda abre.
  eq(pickPersonaForConversation(full, null)?.id, 'duda', 'sem pin → Duda abre');
  // Pin na Bia: a Bia continua (linha Duda→Bia).
  eq(pickPersonaForConversation(full, 'bia')?.id, 'bia', 'pin=Bia → Bia responde');
  // Pin na Nina: a Nina responde (retenção só entra por pin).
  eq(pickPersonaForConversation(full, 'nina')?.id, 'nina', 'pin=Nina → Nina responde');
  // Pin num id inexistente: cai no SDR (Duda).
  eq(pickPersonaForConversation(full, 'fantasma')?.id, 'duda', 'pin órfão → Duda abre');
  // CRÍTICO: sem Duda e sem pin, ninguém abre — nem com cascas ativos.
  eq(pickPersonaForConversation([bia, lia, ...cascas], null), null, 'sem SDR, sem pin → null (guard cala)');
  eq(pickPersonaForConversation(cascas, null), null, 'só cascas, sem pin → null');
  // Mas um casca pinado responde (é o caminho legítimo da Nina).
  eq(pickPersonaForConversation(cascas, 'nina')?.id, 'nina', 'casca pinado (Nina) responde por pin');
});

Deno.test('GARANTIA-MÃE — 3 cascas ativos + Duda presente: Duda abre, casca só por pin', () => {
  const withDuda = [dudaSdr, bia, lia, ...cascas];
  // A Duda é a abridora, sempre.
  eq(pickPersonaForConversation(withDuda, null)?.id, 'duda', 'com cascas ativos, Duda ainda abre');
  // Remover a Duda (o cenário que armava a roleta antes) → ninguém abre.
  const noDuda = [bia, lia, ...cascas];
  eq(pickPersonaForConversation(noDuda, null), null, 'Duda fora → null, NUNCA um casca no número oficial');
});
