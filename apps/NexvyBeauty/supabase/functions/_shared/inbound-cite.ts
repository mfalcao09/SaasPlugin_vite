// Escolhe qual inbound citar: a pergunta feita à Camila, não a última bolha.
// Caso Andressa (ouro Marcelo): "Oiii" / "Bom dia" / "Tudo bem" / "E vc?"
// → cita "E vc?" e responde "Estou bem, também. Obrigada por perguntar 🥰".

export type CiteCandidate = {
  content?: string | null;
  direction?: string;
  sender_type?: string;
};

function fold(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Pergunta dirigida à Camila (“e você?”). Ouro Andressa. */
const ASK_CAMILA = [
  /\be\s+(voce|vc|tu)\b/,
  /\bcomo\s+(voce|vc)\s+esta\b/,
  /\bcomo\s+vai\b/,
];

/** “Tudo bem?” perguntando. Sem interrogação pode ser só afirmação. */
const HOW_ARE_YOU_QUESTION = [
  /\btudo\s+bem(\s+contigo)?\s*\?/,
];

const HOW_ARE_YOU_STATEMENT = [
  /\btudo\s+bem(\s+contigo)?\b/,
];

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
  if (ASK_CAMILA.some((re) => re.test(n))) score = 110;
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
