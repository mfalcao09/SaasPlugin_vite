// Escolhe qual inbound citar e quando usar a resposta-ouro.
// Andressa: "Oiii" / "Bom dia" / "Tudo bem" / "E vc?" (ou "E vc" sem ?)
// → cita o “e você” e responde o ouro do Marcelo.

export type CiteCandidate = {
  content?: string | null;
  direction?: string;
  sender_type?: string;
};

/** Texto fixo quando a lead pergunta como a Camila está. */
export const GOLD_HOW_ARE_YOU_REPLY =
  "Estou bem, também. Obrigada por perguntar 🥰";

function fold(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Sem pontuação/emoji — “E vc?” e “E você 🥰” viram “e vc” / “e voce”. */
export function normalizeCiteText(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ASK_CAMILA_EXACT = [
  /^e\s+(voce|vc|tu)$/,
  /^como\s+(voce|vc)\s+esta$/,
  /^como\s+vai$/,
  // Mesma bolha: “E você, tudo bem?” / “E vc tb” — reciprocidade, não outra pergunta.
  /^e\s+(voce|vc|tu)\s+(tb|tbm|tambem|tudo\s+bem|como\s+vai|como\s+esta|beleza|tranquila?)$/,
];

/** Palavras que transformam “e você …” em outra pergunta (não ouro). */
const ASK_CAMILA_NOT_OTHER_Q =
  /\b(tem|faz|vende|usa|trabalha|pode|consegue|sabe|aceita|cobra|atende)\b/;

/**
 * “E você” / “E vc” sozinho, com ou sem interrogação.
 * “Tudo bem e vc” curto também conta. “E você tem agenda?” não.
 */
export function isStandaloneAskCamila(text: string): boolean {
  const t = normalizeCiteText(text);
  if (!t) return false;
  if (ASK_CAMILA_EXACT.some((re) => re.test(t))) return true;
  if (t.length <= 40 && /(^|\s)e\s+(voce|vc|tu)$/.test(t)) {
    return !ASK_CAMILA_NOT_OTHER_Q.test(t);
  }
  return false;
}

export function burstAsksCamilaHowSheIs(texts: readonly string[]): boolean {
  return texts.some((t) => isStandaloneAskCamila(t));
}

export function goldHowAreYouReply(texts: readonly string[]): string | null {
  return burstAsksCamilaHowSheIs(texts) ? GOLD_HOW_ARE_YOU_REPLY : null;
}

const HOW_ARE_YOU_QUESTION = [/\btudo\s+bem(\s+contigo)?\s*\?/];
const HOW_ARE_YOU_STATEMENT = [/\btudo\s+bem(\s+contigo)?\b/];
const GREETING = [
  /^(oi+|ola|opa|eai|e ai)[\s!.]*$/,
  /^(bom\s+dia|boa\s+tarde|boa\s+noite)[\s!.]*$/,
];

/** Maior = mais digno de citação. Empate: quem chama decide (mais nova). */
export function scoreInboundCite(text: string): number {
  const raw = String(text ?? "").trim();
  if (!raw) return 0;
  const n = fold(raw);
  let score = 5;
  if (isStandaloneAskCamila(raw)) score = 110;
  else if (HOW_ARE_YOU_QUESTION.some((re) => re.test(n) || re.test(raw))) {
    score = 100;
  } else if (HOW_ARE_YOU_STATEMENT.some((re) => re.test(n))) score = 55;
  else if (/\?/.test(raw)) score = 40;
  else if (GREETING.some((re) => re.test(n))) score = 10;
  return score + Math.min(raw.length, 40) / 10;
}

/** `texts` em qualquer ordem; empate fica com a última da lista. */
export function selectAssertiveCite(texts: readonly string[]): string {
  const cleaned = texts.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  let best = cleaned[cleaned.length - 1];
  let bestScore = -1;
  for (const t of cleaned) {
    const s = scoreInboundCite(t);
    if (s >= bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

/** Newest-first: ignora outbound recente, pega a rajada inbound contínua. */
export function burstInboundVisitor<T extends CiteCandidate>(
  historyDesc: readonly T[],
): T[] {
  const burst: T[] = [];
  let started = false;
  for (const m of historyDesc) {
    const isIn = m.direction === "inbound" && m.sender_type === "visitor";
    if (!started) {
      if (!isIn) continue;
      started = true;
    }
    if (isIn) burst.push(m);
    else break;
  }
  return burst;
}

/** Newest-first. Empate fica com a mais nova. */
export function pickAssertiveInbound<T extends CiteCandidate>(
  historyDesc: readonly T[],
): T | null {
  const burst = burstInboundVisitor(historyDesc);
  if (!burst.length) return null;
  let best = burst[0];
  let bestScore = -1;
  for (const m of burst) {
    const s = scoreInboundCite(String(m.content ?? ""));
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

export function goldReplyFromHistory<T extends CiteCandidate>(
  historyDesc: readonly T[],
): string | null {
  const texts = burstInboundVisitor(historyDesc).map((m) =>
    String(m.content ?? "")
  );
  return goldHowAreYouReply(texts);
}
