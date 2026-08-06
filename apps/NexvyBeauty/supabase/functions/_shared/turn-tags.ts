/**
 * PR-B — tags CLASSIFICADORAS do turno: o modelo OBSERVA a lead, não se contém.
 *
 * ── POR QUE TAG E NÃO REGEX ────────────────────────────────────────────────────
 * A lei dos tiers (PRD-CONVERSATION-STATE-2026-08-06):
 *   tier 1  ato do código      → não falha  → pode virar FATO
 *   tier 2  tag do modelo      → SUBCONTA   → fato, COM controle negativo
 *   tier 3  regex sobre prosa  → MENTE      → PROIBIDO como fato
 *
 * `demo_recusas` e `objecoes_vistas` não tinham fonte nenhuma. A saída tentadora
 * era regex sobre a fala da lead — e o teste do PR-A prova por que não pode:
 *   /oferec\w*\s+demonstra/i.test("não vou ficar te oferecendo demonstração") === true
 * ou seja, a frase em que a lead RECLAMOU da oferta seria lida como oferta.
 *
 * ── POR QUE ISTO NÃO É "CONFIAR NO PROMPT" ─────────────────────────────────────
 * O eval E1/E2 mediu que o prompt NÃO segura comportamento: as diretivas de Raio-X
 * foram removidas e a agente ofereceu assim mesmo. Mas isso é o modelo falhando em
 * SE CONTER. Aqui a tarefa é outra: ROTULAR o que a lead disse. Modelos são ruins
 * em obedecer proibições e bons em classificar texto — e o custo do erro é outro:
 * proibição ignorada vira mensagem errada pra lead; rótulo errado vira UM campo de
 * estado errado, detectável e corrigível.
 *
 * ── A GARANTIA QUE ESTE MÓDULO DÁ ──────────────────────────────────────────────
 * SÓ a tag literal conta. Prosa nunca conta, em hipótese nenhuma — há controle
 * negativo cravando isso. E a tag é REMOVIDA do texto: a lead jamais pode ver
 * "[LEAD_RECUSOU_DEMO]" na bolha, que é o modo de falha óbvio de tag no corpo.
 */

export const TAG_RECUSOU_DEMO = '[LEAD_RECUSOU_DEMO]';

/** `[OBJECAO:preco]`, `[OBJECAO:ja_tentei]`… slug livre, normalizado em minúscula. */
const RE_OBJECAO = /\[OBJECAO:([a-zA-Z0-9_-]{1,40})\]/g;

export interface TagsDoTurno {
  /** O texto SEM as tags — é isto que vai pra lead. */
  texto: string;
  /** TIER 2: o modelo marcou que a lead recusou a demonstração. */
  recusouDemo: boolean;
  /** TIER 2: objeções que o modelo rotulou neste turno, minúsculas e sem repetição. */
  objecoes: string[];
}

/**
 * Extrai as tags classificadoras e devolve o texto limpo.
 *
 * Idempotente: rodar de novo no texto já limpo devolve o mesmo texto, recusouDemo
 * false e objeções vazias — nenhuma tag sobrevive à primeira passagem.
 */
export function extrairTags(input: string): TagsDoTurno {
  if (!input) return { texto: input ?? '', recusouDemo: false, objecoes: [] };

  let texto = input;

  // ATENÇÃO: comparação LITERAL de substring, nunca padrão semântico. É esta linha
  // que mantém a fonte no tier 2 — se um dia virar /recus\w+/i, o estado passa a
  // mentir e a lei dos tiers foi quebrada.
  const recusouDemo = texto.includes(TAG_RECUSOU_DEMO);
  if (recusouDemo) texto = texto.split(TAG_RECUSOU_DEMO).join(' ');

  const objecoes: string[] = [];
  texto = texto.replace(RE_OBJECAO, (_m, slug: string) => {
    const k = String(slug).trim().toLowerCase();
    if (k && !objecoes.includes(k)) objecoes.push(k);
    return ' ';
  });

  // A remoção deixa espaço duplo e pode deixar espaço antes de pontuação. Limpa,
  // mas NUNCA mexe no conteúdo: só colapsa espaço em branco.
  texto = texto
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { texto, recusouDemo, objecoes };
}

/**
 * Bloco de instrução para o prompt. Fica no fim do system, DEPOIS da persona:
 * é instrução de FORMATO, e recência ajuda o modelo a não esquecer de emitir.
 *
 * Deliberadamente pede OBSERVAÇÃO ("marque o que ela disse"), nunca contenção
 * ("não ofereça") — a contenção é aplicada por código, com o estado, no turno
 * seguinte. Pedir as duas coisas na mesma instrução foi o que já falhou.
 */
export const BLOCO_TAGS_CLASSIFICADORAS = `
MARCAÇÃO INTERNA (o cliente NUNCA vê estas marcas — elas são removidas antes do envio):
- Se a mensagem DELA recusou, dispensou ou demonstrou incômodo com a demonstração
  ("não quero ver", "tá chato", "para de oferecer", "depois eu vejo" dito com
  irritação), escreva ${TAG_RECUSOU_DEMO} no fim da sua resposta.
- Se ela levantou uma objeção, marque o tipo no fim: [OBJECAO:preco],
  [OBJECAO:ja_tentei], [OBJECAO:sem_tempo], [OBJECAO:medo_tecnico],
  [OBJECAO:equipe_nao_usa], [OBJECAO:nao_confia]. Pode marcar mais de uma.
- Marque APENAS o que ela de fato disse NESTE turno. Não marque por suposição, nem
  repita marca de turno anterior. Se ela não recusou e não objetou, não escreva marca
  nenhuma — ausência de marca é resposta válida e é o caso mais comum.`.trim();
