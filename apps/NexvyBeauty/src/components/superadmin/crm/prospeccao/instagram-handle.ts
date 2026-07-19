/**
 * Saneamento de @handle do Instagram — RÉPLICA FIEL da regra do backend.
 *
 * Fonte-da-verdade: `supabase/functions/_shared/apify-leads.ts`
 * (`HANDLE_RE` + `sanitizeInstagramHandle`). O front NÃO pode importar do
 * `_shared` (bundle Deno ≠ bundle Vite), então a regra é replicada aqui
 * CARACTERE A CARACTERE para que a contagem "válidos/inválidos" mostrada na
 * tela seja exatamente a mesma que a edge vai aplicar. Se um dia a regra do IG
 * mudar, os DOIS arquivos mudam juntos — não existe um "quase igual".
 *
 * Regra: 1..30 chars, só [a-z0-9._]. Aceita `@handle`, `instagram.com/handle`,
 * URL completa (com path/query/hash) ou o username cru.
 */
export const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function sanitizeInstagramHandle(raw: unknown): string | null {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.replace(/^instagram\.com\//, '').replace(/^m\.instagram\.com\//, '');
  s = s.replace(/[/?#].*$/, ''); // corta path/query/hash restante
  s = s.replace(/^@/, '');
  return HANDLE_RE.test(s) ? s : null;
}

export interface HandleTally {
  /** @handles válidos, já sanitizados e deduplicados (ordem de aparição). */
  valid: string[];
  /** Quantos tokens não passaram na regra do IG. */
  invalid: number;
  /** Quantos tokens válidos repetiram dentro da própria lista colada. */
  duplicates: number;
  /** Total de tokens não-vazios encontrados no texto. */
  total: number;
}

/**
 * Quebra um texto colado (um por linha, por vírgula, ponto-e-vírgula ou espaço)
 * em @handles válidos + contagens para a prévia. A deduplicação AQUI é só dentro
 * do que foi colado; o dedup GLOBAL contra a base é sempre da edge (autoridade
 * única — o front nunca decide o que já existe).
 */
export function tallyHandles(text: string): HandleTally {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  let duplicates = 0;

  for (const token of tokens) {
    const handle = sanitizeInstagramHandle(token);
    if (!handle) { invalid++; continue; }
    if (seen.has(handle)) { duplicates++; continue; }
    seen.add(handle);
    valid.push(handle);
  }

  return { valid, invalid, duplicates, total: tokens.length };
}
