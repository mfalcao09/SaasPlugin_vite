// ─────────────────────────────────────────────────────────────────────────────
// agentImportParsers — leitura de arquivos de importação de Agente IA (D3 P1/F1d+).
// Converte um arquivo .json OU .md num objeto "raw" no schema flat aceito por
// `sanitizeAgentJson` (AgentImportModal). O .md usa frontmatter YAML (campos
// estruturados) + seções markdown mapeadas por título (## Objetivo, ## Regras...).
// SEM dependência externa: mini-parser de frontmatter self-contained (proporcional
// ao escopo — só precisa carregar escalares/booleanos/números/arrays do agente).
// ─────────────────────────────────────────────────────────────────────────────

export type AgentImportFormat = 'json' | 'md';

/** Descobre o formato pelo nome do arquivo. */
export function detectAgentFileFormat(filename: string): AgentImportFormat | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
}

// Remove comentário inline (` # ...`) de um valor não-citado, respeitando
// aspas e colchetes (não corta `#` dentro de string/array).
function stripInlineComment(raw: string): string {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[') { depth++; continue; }
    if (ch === ']') { depth--; continue; }
    // "#" só inicia comentário se precedido de espaço/início (evita cortar "a#b")
    if (ch === '#' && depth === 0 && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

// ── Mini-parser de valor escalar YAML ────────────────────────────────────────
// Suporta: "string entre aspas", 'string', true/false, números, [inline, arrays].
function parseScalar(raw: string): unknown {
  const v = stripInlineComment(raw).trim();
  if (v === '') return '';
  // Inline array: [a, b, "c"]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevelCommas(inner).map((s) => parseScalar(s));
  }
  // Aspas
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  // Número (int ou float), sem interpretar strings tipo "50%" ou "1.2.3"
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

/** Divide por vírgulas de topo, respeitando aspas e colchetes aninhados. */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[') { depth++; cur += ch; continue; }
    if (ch === ']') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

/**
 * Mini-parser de frontmatter YAML. Cobre o que o agente precisa:
 *   key: valor            → escalar
 *   key: [a, b]           → array inline
 *   key:                  → seguido de itens "- item" (array em bloco)
 *     - item1
 *     - item2
 * Ignora indentação profunda/objetos aninhados (não usados no frontmatter do agente).
 */
export function parseFrontmatter(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^([A-Za-z0-9_]+):(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2].trim();
    if (rest === '') {
      // Pode ser array em bloco (linhas "- item" a seguir)
      const items: unknown[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        const li = l.match(/^\s*-\s+(.*)$/);
        if (li) { items.push(parseScalar(li[1])); j++; continue; }
        if (l.trim() === '') { j++; continue; }
        break;
      }
      if (items.length) { out[key] = items; i = j; continue; }
      out[key] = '';
      i++;
      continue;
    }
    out[key] = parseScalar(rest);
    i++;
  }
  return out;
}

// ── Mapeamento de seções markdown → campos do agente ─────────────────────────
// Normaliza acentos/caixa do título da seção para casar (## Objetivo, ## objetivo…).
function normHeading(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Título de seção → campo do schema flat. Seções string viram o próprio campo;
// seções de lista viram arrays. Qualquer seção fora deste mapa é preservada no
// additional_prompt (conteúdo rico não se perde).
const SECTION_TO_FIELD: Record<string, { field: string; kind: 'text' | 'list' }> = {
  'objetivo': { field: 'primary_objective', kind: 'text' },
  'missao': { field: 'additional_prompt', kind: 'text' },
  'regras': { field: 'additional_prompt', kind: 'text' },
  'prompt adicional': { field: 'additional_prompt', kind: 'text' },
  'instrucoes': { field: 'additional_prompt', kind: 'text' },
  'pode fazer': { field: 'can_do', kind: 'list' },
  'capacidades': { field: 'can_do', kind: 'list' },
  'nao pode fazer': { field: 'cannot_do', kind: 'list' },
  'restricoes': { field: 'cannot_do', kind: 'list' },
  'transferir': { field: 'handoff_triggers', kind: 'list' },
  'gatilhos de transferencia': { field: 'handoff_triggers', kind: 'list' },
  'handoff': { field: 'handoff_triggers', kind: 'list' },
  'encerrar conversa': { field: 'end_conversation_triggers', kind: 'list' },
  'frases obrigatorias': { field: 'required_phrases', kind: 'list' },
  'frases proibidas': { field: 'prohibited_phrases', kind: 'list' },
  'palavras-chave de ativacao': { field: 'activation_keywords', kind: 'list' },
  'tags': { field: 'default_tags', kind: 'list' },
};

interface MdSection {
  heading: string;
  body: string;
}

function splitMarkdownSections(body: string): MdSection[] {
  const lines = body.split(/\r?\n/);
  const sections: MdSection[] = [];
  let cur: MdSection | null = null;
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      if (cur) sections.push(cur);
      cur = { heading: h[1].trim(), body: '' };
    } else if (cur) {
      cur.body += (cur.body ? '\n' : '') + line;
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

/** Extrai itens de uma lista markdown ("- x" ou "* x" ou "1. x"). */
function extractListItems(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => m[1].trim())
    .filter(Boolean);
}

/**
 * Converte um documento markdown (frontmatter YAML opcional + corpo com seções)
 * num objeto raw flat. Frontmatter tem PRECEDÊNCIA sobre seções para o mesmo campo.
 */
export function parseAgentMarkdown(text: string): Record<string, unknown> {
  let frontmatter: Record<string, unknown> = {};
  let body = text;

  // Frontmatter delimitado por --- no topo (tolera BOM inicial)
  const fm = text.replace(/^﻿/, '').match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fm) {
    frontmatter = parseFrontmatter(fm[1]);
    body = fm[2];
  }

  const raw: Record<string, unknown> = { ...frontmatter };
  const promptChunks: string[] = [];

  for (const section of splitMarkdownSections(body)) {
    const key = normHeading(section.heading);
    const map = SECTION_TO_FIELD[key];
    const trimmed = section.body.trim();
    if (!trimmed) continue;

    if (!map) {
      // Seção desconhecida → conteúdo rico preservado no additional_prompt
      promptChunks.push(`## ${section.heading}\n${trimmed}`);
      continue;
    }

    if (map.kind === 'list') {
      const items = extractListItems(section.body);
      if (items.length && raw[map.field] === undefined) raw[map.field] = items;
      continue;
    }

    // text
    if (map.field === 'additional_prompt') {
      promptChunks.push(`## ${section.heading}\n${trimmed}`);
    } else if (raw[map.field] === undefined) {
      raw[map.field] = trimmed;
    }
  }

  // Consolida prompt: frontmatter.additional_prompt (se houver) + seções extras
  if (promptChunks.length) {
    const existing = typeof raw.additional_prompt === 'string' ? raw.additional_prompt : '';
    raw.additional_prompt = [existing, ...promptChunks].filter(Boolean).join('\n\n');
  }

  return raw;
}

/**
 * Ponto de entrada único: recebe nome + texto do arquivo e devolve o objeto raw
 * (schema flat) pronto para `sanitizeAgentJson`. Lança em formato inválido.
 */
export function parseAgentFile(filename: string, text: string): Record<string, unknown> {
  const fmt = detectAgentFileFormat(filename);
  if (fmt === 'json') {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
    return parsed as Record<string, unknown>;
  }
  if (fmt === 'md') {
    return parseAgentMarkdown(text);
  }
  throw new Error('Formato não suportado. Use .json ou .md');
}
