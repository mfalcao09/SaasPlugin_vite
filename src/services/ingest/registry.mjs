// ============================================================================
// Registry de parsers — card C0.5 (PRD v2.1 §5.1)
//
// CRITÉRIO DO CARD: adicionar uma fonte nova NÃO pode editar nenhum arquivo
// existente. Por isso a resolução é por CONVENÇÃO, não por registro manual:
//
//     fontes_diarios.parser_key = 'doms-pdf'
//                                    ↓
//               ./parsers/doms-pdf.mjs   (import dinâmico)
//
// Um `switch (parser_key)` ou um mapa `{ 'doms-pdf': ... }` reprovaria o gate,
// porque cada fonte nova exigiria editar este arquivo. O nome do arquivo É o
// contrato.
//
// Adicionar o diário de um novo tribunal vira configuração, não código:
//   1. criar src/services/ingest/parsers/<parser_key>.mjs
//   2. inserir 1 linha em fontes_diarios
// ============================================================================

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_PARSERS = join(AQUI, 'parsers');

// Superfície mínima que todo parser precisa expor (§5.1).
const OBRIGATORIOS = ['descobrir', 'baixar', 'extrair'];

/** Impede que uma parser_key vinda do banco escape do diretório de parsers. */
function validarChave(parserKey) {
  if (typeof parserKey !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(parserKey)) {
    throw new Error(
      `parser_key inválida: ${JSON.stringify(parserKey)} — use apenas [a-z0-9-]`,
    );
  }
  return parserKey;
}

/**
 * Resolve o parser de uma fonte pela sua parser_key.
 * @param {string} parserKey  ex.: 'doms-pdf'
 * @returns {Promise<object>} módulo do parser, já validado contra o contrato
 */
export async function resolverParser(parserKey) {
  validarChave(parserKey);

  let modulo;
  try {
    modulo = await import(`./parsers/${parserKey}.mjs`);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        `parser '${parserKey}' não encontrado. Crie ` +
          `src/services/ingest/parsers/${parserKey}.mjs — ` +
          `nenhum arquivo existente precisa mudar.`,
      );
    }
    throw e;
  }

  const faltando = OBRIGATORIOS.filter((f) => typeof modulo[f] !== 'function');
  if (faltando.length > 0) {
    throw new Error(
      `parser '${parserKey}' não cumpre o contrato §5.1 — falta: ${faltando.join(', ')}`,
    );
  }
  return modulo;
}

/**
 * Lista as parser_keys disponíveis no disco (varredura, não lista fixa).
 * @returns {Promise<string[]>}
 */
export async function parsersDisponiveis() {
  const arquivos = await readdir(DIR_PARSERS);
  return arquivos
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => f.replace(/\.mjs$/, ''))
    .sort();
}

/**
 * Confere se toda fonte cadastrada tem parser correspondente no disco.
 * @param {Array<{sigla:string, parser_key:string}>} fontes
 * @returns {Promise<{ok:boolean, ausentes:Array<{sigla:string,parser_key:string}>}>}
 */
export async function conferirCobertura(fontes) {
  const disponiveis = new Set(await parsersDisponiveis());
  const ausentes = fontes.filter((f) => !disponiveis.has(f.parser_key));
  return { ok: ausentes.length === 0, ausentes };
}

export default { resolverParser, parsersDisponiveis, conferirCobertura };
