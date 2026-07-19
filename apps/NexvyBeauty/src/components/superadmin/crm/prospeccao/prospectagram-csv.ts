import { tokenizeCsv } from '@/lib/leadsExport';
import { sanitizeInstagramHandle } from './instagram-handle';

/**
 * PARSER DO EXPORT DO PROSPECTAGRAM (CSV QUEBRADO) — roda 100% no NAVEGADOR.
 *
 * O arquivo NUNCA sobe ao servidor: lemos aqui, normalizamos e mandamos à edge só
 * os registros já limpos, em lotes.
 *
 * ⚠️ POR QUE NÃO DÁ PRA MAPEAR PELO HEADER: o Prospectagram não escapa vírgula nos
 * campos de texto (`full_name`, `descricaoPesquisa`). Num export real de ~24,9 mil
 * linhas, ~16% vêm com MAIS de 14 campos — um nome como
 * "Venda de Produtos Nails, Lash e Micropigmentação." vira 2 campos. Mapear por
 * índice a partir do INÍCIO desloca TUDO que vem depois do nome (o telefone de uma
 * linha cairia na coluna de e-mail).
 *
 * ESTRATÉGIA — ancorar nas DUAS PONTAS:
 *   • `username` é o 1º campo e não contém vírgula (regra do IG) → `cols[0]`.
 *   • De `mediaCount` em diante os campos são numéricos/booleanos/URL, sem vírgula →
 *     conta-se DE TRÁS PRA FRENTE (`cols[len-11]` … `cols[len-1]`).
 *   • A sujeira fica presa no MIOLO (`full_name` + `descricaoPesquisa`), que não
 *     decide nada. O nome ainda é recuperável: o miolo é `cols.slice(1, len-11)` e
 *     seu ÚLTIMO item é sempre `descricaoPesquisa` — o resto, rejuntado com vírgula,
 *     é o nome original de volta.
 *
 * VALIDAÇÃO (o teste que prova que as âncoras casaram): `is_private` e `is_verified`
 * TÊM que ser booleanos. Quando o registro foi partido por uma quebra de linha dentro
 * do nome, as âncoras da direita caem em cima de texto e o teste falha → linha
 * descartada e contada como inválida. No export real isso pega 39 linhas (0,16%).
 */

/** Header canônico do export (14 colunas) — usado só para conferir o arquivo. */
export const PROSPECTAGRAM_HEADER = [
  'username', 'full_name', 'descricaoPesquisa', 'mediaCount', 'followingCount',
  'followerCount', 'whatsappEditado', 'publicEmail', 'externalUrl', 'is_private',
  'is_verified', 'valorNegocio', 'etapa', 'status',
] as const;

/** Quantos campos são lidos de trás pra frente (de `mediaCount` até `status`). */
const TAIL_FIELDS = 11;

/** Registro normalizado — é ISTO que trafega para a edge (o CSV cru não sai do browser). */
export interface ProspectagramRecord {
  username: string;
  full_name: string | null;
  /** A busca do Prospectagram que trouxe o lead (provenência; vai para o `raw`). */
  descricao: string | null;
  posts: number | null;
  following: number | null;
  followers: number | null;
  whatsapp: string | null;
  email: string | null;
  external_url: string | null;
  is_private: boolean;
  is_verified: boolean;
}

export interface ProspectagramParseResult {
  records: ProspectagramRecord[];
  /** Linhas de dados encontradas no arquivo (fora o header). */
  totalRows: number;
  /** Linhas que passaram nas âncoras + regra de @handle. */
  validRows: number;
  /** Linhas descartadas (âncoras não casaram, @handle inválido ou linha partida). */
  invalidRows: number;
  /** Válidas repetidas dentro do PRÓPRIO arquivo (dedup global é da edge). */
  duplicateRows: number;
  withWhatsapp: number;
  withoutWhatsapp: number;
  /** Header não bate com o do Prospectagram — provável arquivo errado. */
  headerMismatch: boolean;
}

const toNum = (v: string | undefined): number | null => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v: string | undefined): boolean | null => {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null; // qualquer outra coisa = âncora não casou
};

const orNull = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s ? s : null;
};

/**
 * Lê o texto do CSV e devolve os registros normalizados + os números da prévia.
 * Não faz rede, não toca no banco: só transforma texto em registros.
 */
export function parseProspectagramCsv(text: string): ProspectagramParseResult {
  const lines = tokenizeCsv(text);
  const header = (lines.shift() ?? []).map((h) => h.trim().toLowerCase());
  const headerMismatch = header[0] !== 'username' || !header.includes('whatsappeditado');

  const records: ProspectagramRecord[] = [];
  const seen = new Set<string>();
  let totalRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let withWhatsapp = 0;

  for (const cols of lines) {
    // Linha totalmente vazia (rabo de arquivo) não conta como linha de dados.
    if (cols.length === 0 || cols.every((c) => c.trim() === '')) continue;
    totalRows++;

    const len = cols.length;
    // Menos campos que o header ⇒ registro partido por quebra de linha no meio.
    if (len < PROSPECTAGRAM_HEADER.length) { invalidRows++; continue; }

    // ── Âncoras da DIREITA (de `mediaCount` até `status`) ────────────────────
    const at = (fromEnd: number) => cols[len - fromEnd];
    const is_private = toBool(at(5));
    const is_verified = toBool(at(4));
    // O teste que prova que as âncoras casaram.
    if (is_private === null || is_verified === null) { invalidRows++; continue; }

    // ── Âncora da ESQUERDA ───────────────────────────────────────────────────
    const username = sanitizeInstagramHandle(cols[0]);
    if (!username) { invalidRows++; continue; }

    if (seen.has(username)) { duplicateRows++; continue; }
    seen.add(username);

    // ── Miolo: sujo, mas o nome é recuperável (o último item é a descrição) ──
    const middle = cols.slice(1, len - TAIL_FIELDS);
    const descricao = orNull(middle[middle.length - 1]);
    const full_name = orNull(middle.slice(0, -1).join(','));

    const whatsapp = orNull(at(8));
    if (whatsapp) withWhatsapp++;

    records.push({
      username,
      full_name,
      descricao,
      posts: toNum(at(11)),
      following: toNum(at(10)),
      followers: toNum(at(9)),
      whatsapp,
      email: orNull(at(7)),
      external_url: orNull(at(6)),
      is_private,
      is_verified,
    });
  }

  return {
    records,
    totalRows,
    validRows: records.length,
    invalidRows,
    duplicateRows,
    withWhatsapp,
    withoutWhatsapp: records.length - withWhatsapp,
    headerMismatch,
  };
}

/** Quebra os registros em lotes para a edge (o dedup global roda lote a lote). */
export function chunkRecords<T>(records: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < records.length; i += size) out.push(records.slice(i, i + size));
  return out;
}
