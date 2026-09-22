// PRD-06 — verdade comercial determinística (puro).
// Preço/link só do conjunto carregado do banco; input opaco → frase fixa.

import { appendSellerRef, type CheckoutPlanRow } from "./checkout-context.ts";

export const OPAQUE_CLARIFY = "Não entendi muito bem, me explica melhor?";

/** Sem preço/link. Usado quando o filtro corta a resposta — não calar. */
export const PRODUCT_EXPLAIN_NO_PRICE =
  "É um sistema no WhatsApp que você já usa: responde a cliente, consulta a agenda de verdade e marca horário. Conectou o WhatsApp, as conversas viram a lista sozinhas — e dá pra ver quem parou de aparecer e chamar de volta, com você aprovando.";

export interface CommercialAllowlist {
  prices: number[];
  urls: string[];
}

export interface CommercialTruthResult {
  ok: boolean;
  reason: string | null;
  bubbles: string[];
  inventedPrices: number[];
  inventedUrls: string[];
}

/** Monta allowlist a partir dos planos já carregados nesta request. */
export function allowlistFromPlans(
  plans: CheckoutPlanRow[],
  personaName: string,
): CommercialAllowlist {
  const prices = new Set<number>();
  const urls = new Set<string>();
  for (const plan of plans) {
    for (const raw of [plan.price_monthly, plan.list_price_monthly]) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) prices.add(n);
    }
    const base = String(plan.checkout_url ?? "").trim();
    if (!base) continue;
    urls.add(normalizeUrl(base));
    const tagged = appendSellerRef(base, personaName);
    if (tagged) urls.add(normalizeUrl(tagged));
  }
  return { prices: [...prices], urls: [...urls] };
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "");
  }
}

/** Preços R$275 / 275,00 / R$ 275. */
export function extractPrices(text: string): number[] {
  const out: number[] = [];
  // Só âncora monetária (R$ / reais) — evita falso positivo em "30 dias".
  const re = /R\$\s*(\d{1,5}(?:[.,]\d{2})?)|(\d{2,4}(?:[.,]\d{2})?)\s*(?:reais|\/m[eê]s)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").replace(",", ".");
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 10) continue;
    out.push(Math.round(n));
  }
  return [...new Set(out)];
}

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s)>\]]+/gi;
  const found = text.match(re) ?? [];
  return [...new Set(found.map(normalizeUrl))];
}

/** Pedido de preço, inclusive typo curto como "Valorv". */
export function isPriceAsk(text: string): boolean {
  const t = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(quanto|preco|valor\w*|gratis|graca|pagar|pago|mensalidade)\b/.test(t);
}

/**
 * Input opaco: curto demais, só emoji/pontuação, truncado, ou fragmento
 * sem verbo/interrogativa clara. Pedido de preço não é opaco.
 */
export function isOpaqueInbound(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (isPriceAsk(t)) return false;
  if (t === OPAQUE_CLARIFY) return false;
  if (/^\[(áudio|audio|imagem|vídeo|video|documento|sticker)\]$/i.test(t)) {
    return true;
  }
  if (/(\.\.\.|…)\s*$/.test(t) && t.length < 40) return true;
  const letters = t.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (letters.length < 3) return true;
  const clear =
    /\b(quero|como|quanto|preço|preco|valor\w*|pago|pagar|gratis|grátis|graça|graca|contratar|humano|atendente|rob[oô]|sair|parar|manda|mostra|funciona|adiantamento|cancel|agenda)\b/i
      .test(t) ||
    /[?]/.test(t) ||
    letters.split(/\s+/).length >= 4;
  return !clear;
}

export function looksTruncated(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/(\.\.\.|…)\s*$/.test(t)) return true;
  if (/https?:\/\/\S+$/i.test(t) && !/[.!?…)]\s*$/.test(t) && t.length > 80) {
    return /\/[a-z0-9_-]{1,6}$/i.test(t);
  }
  return false;
}

/** No máximo 4 bolhas; descarta truncadas; nunca devolve lista vazia se havia texto. */
export function enforceBubbleBudget(bubbles: string[]): string[] {
  const cleaned = bubbles
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !looksTruncated(b));
  const capped = cleaned.slice(0, 4);
  if (capped.length > 0) return capped;
  return bubbles.map((b) => b.trim()).filter(Boolean).slice(0, 1);
}

/**
 * Valida bolhas contra allowlist. Remove URLs inventadas; preço inventado
 * falha fechado e substitui por clarificação segura.
 */
export function validateCommercialTruth(
  bubbles: string[],
  allow: CommercialAllowlist,
): CommercialTruthResult {
  const allowedPrices = new Set(allow.prices.map((n) => Math.round(n)));
  const allowedUrls = new Set(allow.urls.map(normalizeUrl));
  const inventedPrices: number[] = [];
  const inventedUrls: string[] = [];

  const sanitized = bubbles.map((bubble) => {
    let next = bubble;
    for (const url of extractUrls(bubble)) {
      const norm = normalizeUrl(url);
      const isTrustedRaiox = /https?:\/\/([a-z0-9-]+\.)*nexvybeauty\.com\.br\/implantacao\//i.test(url);
      if (!allowedUrls.has(norm) && !isTrustedRaiox) {
        inventedUrls.push(url);
        next = next.split(url).join("").trim();
      }
    }
    for (const price of extractPrices(next)) {
      if (!allowedPrices.has(price)) inventedPrices.push(price);
    }
    return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }).filter(Boolean);

  const budget = enforceBubbleBudget(sanitized);
  const uniquePrices = [...new Set(inventedPrices)];
  const uniqueUrls = [...new Set(inventedUrls)];

  if (uniquePrices.length) {
    return {
      ok: false,
      reason: "invented_price",
      bubbles: [OPAQUE_CLARIFY],
      inventedPrices: uniquePrices,
      inventedUrls: uniqueUrls,
    };
  }
  if (uniqueUrls.length) {
    return {
      ok: false,
      reason: "invented_url",
      bubbles: budget.length ? budget : [OPAQUE_CLARIFY],
      inventedPrices: uniquePrices,
      inventedUrls: uniqueUrls,
    };
  }
  return {
    ok: true,
    reason: null,
    bubbles: budget,
    inventedPrices: [],
    inventedUrls: [],
  };
}

/** Se o filtro esvaziar a fala, explica o produto — sem inventar preço. */
export function bubblesAfterCommercialTruth(
  truth: CommercialTruthResult,
): string[] {
  if (truth.bubbles.length > 0) return truth.bubbles;
  return [PRODUCT_EXPLAIN_NO_PRICE];
}
