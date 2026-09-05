// camila-display-name.ts — vocativo da Camila sem categoria/IG first-token.
// Fonte dos casos: piloto 2026-09-02 (LASH, Expert, Sobrancelha, Studio).
//
//   deno test --allow-read supabase/functions/_shared/cold-outreach/camila-display-name.test.ts

const GENERIC = new Set([
  "lash",
  "lashes",
  "expert",
  "studio",
  "salao",
  "salão",
  "unha",
  "unhas",
  "nail",
  "nails",
  "maquiagem",
  "make",
  "penteado",
  "sobrancelha",
  "sobrancelhas",
  "designer",
  "beauty",
  "cilios",
  "cílios",
  "extensao",
  "extensão",
  "extensoes",
  "extensões",
  "clinica",
  "clínica",
  "spa",
  "estetica",
  "estética",
  "saude",
  "saúde",
  "beleza",
  "noivas",
  "noiva",
  "micro",
  "makeup",
]);

const SKIP = new Set([
  "em",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "com",
  "para",
  "por",
  "the",
  "and",
  "rj",
  "sp",
  "ba",
  "pe",
  "rn",
  "ac",
  "df",
  "niteroi",
  "niterói",
  "santos",
  "brasilia",
  "brasília",
  "caruaru",
]);

const HANDLE_SURNAMES = [
  "lopes",
  "santos",
  "silva",
  "castro",
  "araujo",
  "araújo",
  "lima",
  "sabino",
  "nascimento",
  "alves",
  "oliveira",
];

export function foldName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function looksLikePhoneDigits(s: string): boolean {
  const d = s.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13 && /^\+?[\d\s()-]+$/.test(s.trim()) &&
    d === s.replace(/\D/g, "");
}

export function isGenericGreetingName(raw: string | null | undefined): boolean {
  const t = foldName(String(raw ?? ""));
  if (!t) return true;
  if (GENERIC.has(t)) return true;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && GENERIC.has(parts[0])) return true;
  return false;
}

function isPersonLike(token: string): boolean {
  const t = foldName(token);
  if (!t || t.length < 3 || t.length > 16) return false;
  if (GENERIC.has(t) || SKIP.has(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/(dade|mente|ismo|ista|icoes|icoes)$/.test(t)) return false;
  if (!/[aeiou]/.test(t)) return false;
  return true;
}

function title(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function tokensFromBlob(raw: string): string[] {
  return raw
    .split(/[|/•·,\-–—]+/)
    .flatMap((p) => p.split(/\s+/))
    .map((p) => p.trim())
    .filter(Boolean);
}

function firstPersonToken(raw: string | null | undefined): string | null {
  if (!raw || looksLikePhoneDigits(raw)) return null;
  for (const tok of tokensFromBlob(raw)) {
    const cleaned = tok.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (isPersonLike(cleaned)) return title(cleaned);
  }
  return null;
}

function nameFromHandle(handle: string | null | undefined): string | null {
  const h = String(handle ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!h) return null;
  const seg = h.split("_")[0] ?? h;
  for (const suf of HANDLE_SURNAMES) {
    if (seg.endsWith(suf) && seg.length > suf.length + 2) {
      const head = seg.slice(0, -suf.length);
      if (isPersonLike(head)) return title(head);
    }
  }
  if (isPersonLike(seg) && seg.length <= 12) return title(seg);
  return null;
}

export interface CamilaGreetingInput {
  igName?: string | null;
  handle?: string | null;
  waChatName?: string | null;
  primeiroNome?: string | null;
}

/** Nome para "Oi, X" — null = não usar vocativo (cair em "tudo bem?"). */
export function pickCamilaGreetingName(input: CamilaGreetingInput): string | null {
  const wa = String(input.waChatName ?? "").trim();
  if (wa && /\s/.test(wa) && !looksLikePhoneDigits(wa)) {
    const fromWa = firstPersonToken(wa);
    if (fromWa && !isGenericGreetingName(fromWa)) return fromWa;
  }

  const fromIg = firstPersonToken(input.igName ?? null);
  if (fromIg && !isGenericGreetingName(fromIg)) return fromIg;

  const first = String(input.primeiroNome ?? "").trim();
  if (first && !isGenericGreetingName(first) && isPersonLike(first)) return title(first);

  const fromHandle = nameFromHandle(input.handle ?? null);
  if (fromHandle && !isGenericGreetingName(fromHandle)) return fromHandle;

  return null;
}
