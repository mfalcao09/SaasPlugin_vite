/**
 * Quebra de resposta em bolhas WhatsApp — pura, testável.
 *
 * Extraída de platform-sales-brain. A sentença NÃO pode partir no meio de
 * parênteses/aspas (bug Camila T2 2026-08-11: `…verdade!` | `) e manda…`).
 *
 * INVARIANTE: só reagrupa; nunca corta caracteres. Bolha longa > estilo quebrado.
 */

export const MAX_BUBBLES = 4;
export const MAX_BUBBLE_CHARS = 160;

/** Bolha que começa com pontuação de continuação = corte inválido. */
const CONTINUATION_START = /^[)\]\},;:…'"»“”‘’]/

const OPEN_PAREN = new Set(['(', '[', '{']);
const CLOSE_PAREN = new Set([')', ']', '}']);
const QUOTE_CHARS = new Set(['"', "'", '«', '»', '“', '”', '‘', '’']);

function joinBubbleParts(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trimStart();
  if (!left) return right;
  if (!right) return left;
  // `verdade!` + `) e manda` → sem espaço antes do fechamento
  if (/^[)\]\}]/.test(right)) return left + right;
  return `${left} ${right}`;
}

/** Contagem bruta de parênteses/colchetes/chaves abertos (não casados). */
export function unmatchedOpenMarkup(text: string): number {
  let depth = 0;
  for (const ch of text) {
    if (OPEN_PAREN.has(ch)) depth++;
    else if (CLOSE_PAREN.has(ch)) depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * Quebra por `.!?` só quando parênteses/aspas estão balanceados.
 * Preserva espaços após o terminador (como o regex antigo).
 */
export function splitSentencesForBubbles(para: string): string[] {
  if (!para) return [];
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < para.length; i++) {
    const ch = para[i]!;
    buf += ch;

    if (QUOTE_CHARS.has(ch)) {
      if (quote === null) {
        if (ch === '»' || ch === '”' || ch === '’') {
          // fechamento órfão — ignora
        } else {
          quote = ch;
        }
      } else if (
        ch === quote ||
        (quote === '«' && ch === '»') ||
        (quote === '“' && ch === '”') ||
        (quote === '‘' && ch === '’')
      ) {
        quote = null;
      }
    } else if (quote === null) {
      if (OPEN_PAREN.has(ch)) depth++;
      else if (CLOSE_PAREN.has(ch)) depth = Math.max(0, depth - 1);
    }

    if (quote === null && depth === 0 && (ch === '.' || ch === '!' || ch === '?')) {
      let j = i + 1;
      while (j < para.length && /\s/.test(para[j]!)) {
        buf += para[j]!;
        j++;
      }
      i = j - 1;
      if (buf.trim()) out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out.length > 0 ? out : [para];
}

/**
 * Rede de segurança: junta bolha que começa com continuação, ou quando a
 * anterior deixou parêntese aberto.
 */
export function mergeBrokenBubbles(bubbles: string[]): string[] {
  const out: string[] = [];
  for (const raw of bubbles) {
    const b = raw.trim();
    if (!b) continue;
    if (out.length === 0) {
      out.push(b);
      continue;
    }
    const prev = out[out.length - 1]!;
    const shouldMerge =
      CONTINUATION_START.test(b) ||
      unmatchedOpenMarkup(prev) > 0;
    if (shouldMerge) {
      out[out.length - 1] = joinBubbleParts(prev, b);
    } else {
      out.push(b);
    }
  }
  return out;
}

export interface SplitIntoBubblesOptions {
  maxBubbles?: number;
  maxBubbleChars?: number;
  /** Callback quando a última bolha (após cap) fica longa. */
  warnLongTail?: (chars: number) => void;
}

/**
 * Divide a resposta em até maxBubbles bolhas por parágrafo / quebra de linha,
 * cada uma respeitando o teto de caracteres (quebra longas por sentença).
 */
export function splitIntoBubbles(
  input: string,
  opts: SplitIntoBubblesOptions = {},
): string[] {
  const maxBubbles = opts.maxBubbles ?? MAX_BUBBLES;
  const maxChars = opts.maxBubbleChars ?? MAX_BUBBLE_CHARS;

  const paras = input
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const out: string[] = [];
  for (const para of paras) {
    if (para.length <= maxChars) {
      out.push(para);
      continue;
    }
    const sentences = splitSentencesForBubbles(para);
    let buf = '';
    for (const s of sentences) {
      // Não abrir bolha nova se a próxima unidade é continuação (`)`, `,`, …)
      // ou se o buf ainda tem markup aberto — bug > estilo (bolha longa ok).
      const wouldSplit = (buf + s).length > maxChars && !!buf;
      const mustKeep =
        CONTINUATION_START.test(s.trim()) ||
        unmatchedOpenMarkup(buf) > 0;
      if (wouldSplit && !mustKeep) {
        out.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }

  let merged = mergeBrokenBubbles(out.filter(Boolean));

  if (merged.length > maxBubbles) {
    const head = merged.slice(0, maxBubbles - 1);
    const tail = merged.slice(maxBubbles - 1).join(' ').trim();
    if (tail.length > maxChars) {
      opts.warnLongTail?.(tail.length);
    }
    merged = [...head, tail].filter(Boolean);
  }
  return mergeBrokenBubbles(merged.filter(Boolean));
}
