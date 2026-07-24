// ============================================================================
// SUBAGENTES DE EXTRAÇÃO — cada um faz UMA coisa e devolve ao orquestrador
//
// Por que dividir (pedido do Marcelo, e correto): tarefa estreita = prompt
// curto = menos superfície para alucinar, e cada etapa fica auditável em
// separado. O orquestrador (orquestrador.mjs) encadeia e o AUDITOR — que é
// CÓDIGO, não LLM — confere tudo contra o texto-fonte no final.
//
//   A1 TRIADOR       página inteira → candidatos com classe
//                    (ato_publicado | citacao | lista_empenho | nao_normativo)
//   A2 EXTRATOR      candidatos ato_publicado → campos estruturados
//   A3 RELACIONADOR  texto de cada ato → relações normativas com evidência
//
// Prompt de cada agente = CONTRATO (Camada A) + papel específico + EXEMPLOS
// (Camada B). O eval (Camada C) mede o conjunto contra o gabarito humano.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chamarJson } from './gemini.mjs';
import { EXEMPLOS_TRIAGEM, EXEMPLOS_CAMPOS, EXEMPLOS_RELACOES } from './exemplos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

let CONTRATO = null;
async function contrato() {
  CONTRATO ??= await readFile(join(AQUI, 'contrato.md'), 'utf8');
  return CONTRATO;
}

const fewshot = (exemplos) => exemplos
  .map((e, i) => `### Exemplo ${i + 1}\nENTRADA:\n${e.entrada}\nSAÍDA CORRETA:\n${JSON.stringify(e.saida)}`)
  .join('\n\n');

// ---------------------------------------------------------------------------
// A1 — TRIADOR: separa o joio do trigo numa página
// ---------------------------------------------------------------------------
const SCHEMA_TRIAGEM = {
  type: 'object',
  properties: {
    candidatos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          classe: { type: 'string', enum: ['ato_publicado', 'citacao', 'lista_empenho', 'nao_normativo'] },
          cabecalho: { type: 'string', nullable: true },
          ancora_inicio: { type: 'string' },
          ancora_fim: { type: 'string' },
          justificativa: { type: 'string' },
        },
        required: ['classe', 'ancora_inicio', 'ancora_fim', 'justificativa'],
      },
    },
  },
  required: ['candidatos'],
};

export async function triarPagina({ fonte, numeroPagina, textoPagina }) {
  return chamarJson({
    rotulo: 'triador',
    system: `${await contrato()}

## SEU PAPEL NESTA CHAMADA: TRIADOR
Percorra a página INTEIRA e liste TODOS os blocos de conteúdo relevantes,
cada um com sua classe. Não deixe ato publicado de fora (falso negativo é o
erro mais grave). ancora_inicio/ancora_fim: 6–12 palavras VERBATIM do começo
e do fim do bloco — serão usadas para recortar o texto mecanicamente.

${fewshot(EXEMPLOS_TRIAGEM)}`,
    user: `Fonte: ${fonte} · Página ${numeroPagina}\n\n===== TEXTO DA PÁGINA =====\n${textoPagina}`,
    schema: SCHEMA_TRIAGEM,
  });
}

// ---------------------------------------------------------------------------
// A2 — EXTRATOR DE CAMPOS: só para candidatos ato_publicado
// ---------------------------------------------------------------------------
const SCHEMA_CAMPOS = {
  type: 'object',
  properties: {
    atos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indice_candidato: { type: 'integer' },
          tipo: { type: 'string' },
          tipo_completo: { type: 'string' },
          numero: { type: 'string', nullable: true },
          ano: { type: 'integer', nullable: true },
          data_ato: { type: 'string', nullable: true },
          orgao_emissor: { type: 'string', nullable: true },
          ementa: { type: 'string', nullable: true },
          justificativa: { type: 'string' },
        },
        required: ['indice_candidato', 'tipo', 'justificativa'],
      },
    },
  },
  required: ['atos'],
};

export async function extrairCampos({ fonte, numeroPagina, candidatos }) {
  const blocos = candidatos
    .map((c, i) => `--- CANDIDATO ${i} ---\n${c.texto}`)
    .join('\n\n');
  return chamarJson({
    rotulo: 'extrator',
    system: `${await contrato()}

## SEU PAPEL NESTA CHAMADA: EXTRATOR DE CAMPOS
Para CADA candidato (todos já triados como ato_publicado), preencha os campos
da §5 do contrato. data_ato em ISO AAAA-MM-DD. numero sem pontos. Campo que
não estiver LITERALMENTE no texto: null + explique na justificativa.

${fewshot(EXEMPLOS_CAMPOS)}`,
    user: `Fonte: ${fonte} · Página ${numeroPagina}\n\n${blocos}`,
    schema: SCHEMA_CAMPOS,
  });
}

// ---------------------------------------------------------------------------
// A3 — RELACIONADOR: relações normativas dentro de cada ato
// ---------------------------------------------------------------------------
const SCHEMA_RELACOES = {
  type: 'object',
  properties: {
    relacoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indice_candidato: { type: 'integer' },
          verbo: { type: 'string', enum: ['revoga', 'revoga_parcialmente', 'altera', 'torna_sem_efeito', 'retifica', 'regulamenta', 'referencia'] },
          destino_tipo: { type: 'string' },
          destino_numero: { type: 'string' },
          destino_ano: { type: 'integer', nullable: true },
          evidencia: { type: 'string' },
        },
        required: ['indice_candidato', 'verbo', 'destino_tipo', 'destino_numero', 'evidencia'],
      },
    },
  },
  required: ['relacoes'],
};

export async function relacionarAtos({ fonte, numeroPagina, candidatos }) {
  const blocos = candidatos
    .map((c, i) => `--- CANDIDATO ${i} ---\n${c.texto}`)
    .join('\n\n');
  return chamarJson({
    rotulo: 'relacionador',
    system: `${await contrato()}

## SEU PAPEL NESTA CHAMADA: RELACIONADOR
Para CADA ato, liste as normas que ele revoga/altera/retifica/regulamenta ou
apenas referencia. evidencia: trecho VERBATIM (≤160 chars) contendo o verbo e
a norma alvo. Sem relação = não invente; devolva lista vazia.

${fewshot(EXEMPLOS_RELACOES)}`,
    user: `Fonte: ${fonte} · Página ${numeroPagina}\n\n${blocos}`,
    schema: SCHEMA_RELACOES,
  });
}
