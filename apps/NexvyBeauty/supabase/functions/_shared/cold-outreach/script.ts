// _shared/cold-outreach/script.ts
//
// SCRIPT WIRED — follow-ups/objeções/CTA + abertura Instagram. Abertura WhatsApp
// NÃO vive mais em constante hardcoded: vem do `additional_prompt` do agente
// (Camila · Estágio 1 — APRESENTAR), via `renderOpeningFromDb`.
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/script.test.ts
//
// Determinístico de propósito: o esqueleto de follow-up é FIXO; a 1ª bolha WA é
// o template FIXO aprovado no DB. `containsLink()` prova zero-link nos testes.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface ScriptTokens {
  nome: string; // [Nome] / {Nome} — primeiro nome do lead
  seuNome: string; // [SeuNome] — quem assina (config da campanha; legacy)
  salao: string; // [salão] / {@handle} — nome do salão/@handle
  detalheIg?: string; // [detalhe real do IG] — post/trabalho real (IG e opcional no WA)
  servico?: string; // [serviço carro-chefe] — ex. "escova", "unha", "sobrancelha"
}

export type Channel = "whatsapp" | "instagram";

/** Agente Camila · Prospecção (produção). Fallback se campaign.agent_id vier null. */
export const CAMILA_PROSPECTOR_AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7";

/** Substitui tokens no template legado `[Nome]` / `[salão]`. */
function fill(tpl: string, t: ScriptTokens): string {
  const servico = t.servico?.trim() || "serviço";
  const detalhe = t.detalheIg?.trim() || "seu trabalho";
  return tpl
    .replaceAll("[Nome]", t.nome.trim())
    .replaceAll("[SeuNome]", t.seuNome.trim())
    .replaceAll("[salão]", t.salao.trim())
    .replaceAll("[detalhe]", detalhe)
    .replaceAll("[serviço]", servico);
}

function handleWithAt(salao: string): string {
  const s = salao.trim();
  if (!s || s === "seu salão") return s;
  return s.startsWith("@") ? s : `@${s}`;
}

function handleBare(salao: string): string {
  const s = salao.trim();
  if (!s || s === "seu salão") return s;
  return s.startsWith("@") ? s.slice(1) : s;
}

/**
 * Preenche templates do prompt do agente: `{Nome}`, `{@handle}`, `{handle}`
 * e legado `[Nome]` / `[salão]` (salão → handle sem forçar `@` duas vezes).
 */
export function fillAgentTemplate(tpl: string, t: ScriptTokens): string {
  const withAt = handleWithAt(t.salao);
  const bare = handleBare(t.salao);
  // {@handle} antes de {handle} — senão `{handle}` parcial quebraria o token.
  let out = tpl
    .replaceAll("{Nome}", t.nome.trim())
    .replaceAll("{@handle}", withAt)
    .replaceAll("{handle}", bare)
    .replaceAll("[Nome]", t.nome.trim())
    .replaceAll("[SeuNome]", t.seuNome.trim())
    .replaceAll("[salão]", withAt || t.salao.trim());
  const servico = t.servico?.trim() || "serviço";
  const detalhe = t.detalheIg?.trim() || "seu trabalho";
  out = out.replaceAll("[detalhe]", detalhe).replaceAll("[serviço]", servico);
  return out;
}

/**
 * Extrai bolhas citadas do Estágio 1 / APRESENTAR:
 * `1ª "..." → 2ª "..." → 3ª "..." → 4ª "..."`.
 * Operacional: 1ª=opening; 2ª/3ª=follow-ups D+N; cascata 15s desligada (APRESENTAR_SEQUENCE_ENABLED).
 * Fail closed se <1 bolha.
 */
export function extractApresentarBubbles(additionalPrompt: string): string[] {
  const prompt = additionalPrompt ?? "";
  const stageIdx = prompt.search(/\*\*Estágio\s*1\b|Estágio\s*1\s*[—\-]|APRESENTAR/i);
  const stageEnd = stageIdx >= 0
    ? prompt.slice(stageIdx).search(/\*\*Estágio\s*2\b|Estágio\s*2\s*[—\-]|TIRAR/i)
    : -1;
  const hay = stageIdx >= 0
    ? (stageEnd > 0 ? prompt.slice(stageIdx, stageIdx + stageEnd) : prompt.slice(stageIdx))
    : prompt;

  const bubbles: string[] = [];
  const re = /(\d+)ª\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay)) !== null) {
    const text = m[2].trim();
    if (text) bubbles.push(text);
  }
  if (bubbles.length < 1) {
    throw new Error(
      'extractApresentarBubbles: nenhuma bolha 1ª "..." no Estágio 1 / APRESENTAR',
    );
  }
  return bubbles;
}

/** Carrega `additional_prompt` do agente. Fail closed se vazio/erro. */
export async function fetchAgentAdditionalPrompt(
  sb: SupabaseClient,
  agentId: string,
): Promise<string> {
  if (!agentId?.trim()) {
    throw new Error("fetchAgentAdditionalPrompt: agentId obrigatório");
  }
  const { data, error } = await sb
    .from("platform_crm_product_agents")
    .select("additional_prompt")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    throw new Error(`fetchAgentAdditionalPrompt: ${error.message}`);
  }
  const prompt = (data?.additional_prompt ?? "").trim();
  if (!prompt) {
    throw new Error(
      `fetchAgentAdditionalPrompt: additional_prompt vazio para agent ${agentId}`,
    );
  }
  return prompt;
}

export interface RenderOpeningFromDbOpts {
  agentId: string;
  variant?: Variant;
}

/**
 * Abertura async. WhatsApp: bolha 1 do Estágio 1 no DB — NUNCA cai no template
 * hardcoded antigo (`da Nexvy 🌿`). Instagram: mantém IG_OPENING por enquanto.
 */
export async function renderOpeningFromDb(
  sb: SupabaseClient,
  channel: Channel,
  tokens: ScriptTokens,
  opts: RenderOpeningFromDbOpts,
): Promise<string> {
  if (channel === "instagram") {
    return fill(IG_OPENING, tokens);
  }
  const agentId = opts.agentId?.trim();
  if (!agentId) {
    throw new Error(
      "renderOpeningFromDb(whatsapp): agentId obrigatório — sem fallback hardcoded",
    );
  }
  const prompt = await fetchAgentAdditionalPrompt(sb, agentId);
  const bubbles = extractApresentarBubbles(prompt);
  return fillAgentTemplate(bubbles[0], tokens);
}

// ── Detector de link (guard anti-link na 1ª msg) ─────────────────────────────
const LINK_RE = /(https?:\/\/|www\.|wa\.me|t\.me|bit\.ly|\b[a-z0-9-]+\.(com|br|net|io|link|me)\b)/i;

/** Há URL/link no texto? Usado pra PROVAR que a abertura não tem link. */
export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

// ── A/B (§5.1) — 1 variável por vez ──────────────────────────────────────────
export type OpeningVariant = "A_pergunta" | "B_prova"; // A/B 1
export type DorVariant = "A_sumiu" | "B_noshow"; // A/B 2
export type PrecoObjectionVariant = "P1" | "P2" | "P3"; // banco fechado obj preço
// CtaVariant A/B (raio-x) removido 2026-09-15 — oferta descontinuada.

export interface Variant {
  opening: OpeningVariant;
  dor: DorVariant;
  precoObj: PrecoObjectionVariant;
}

export const DEFAULT_VARIANT: Variant = {
  opening: "A_pergunta",
  dor: "A_sumiu",
  precoObj: "P1",
};

/** Hash determinístico (FNV-1a 32-bit) — assign A/B estável por leadId, sem RNG. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Atribui A/B determinístico por leadId (50/50 por eixo). */
export function assignVariant(leadId: string): Variant {
  const h = stableHash(leadId);
  const precoObjs: PrecoObjectionVariant[] = ["P1", "P2", "P3"];
  return {
    opening: (h & 1) ? "A_pergunta" : "B_prova",
    dor: (h & 2) ? "A_sumiu" : "B_noshow",
    precoObj: precoObjs[h % 3],
  };
}

// ── WhatsApp (follow-ups / objeções — abertura = DB via renderOpeningFromDb) ─
// Copy aprovada 2026-09-15 (sem raio-x): FU A1/B1, breakup C1, obj preço P1–P3, golpe G1.
const WA_FOLLOWUP_2_SUMIU = `Oi [Nome], só voltando aqui 🙂 nos salões que já olhei, 3 a 4 de cada 10 clientes somem no prazo em que deveriam voltar — e quase ninguém tem alguém chamando de volta todo dia.

Eu mostro como a NexvyBeauty coloca uma equipe de IA pra atender no WhatsApp e resgatar quem sumiu, no tom do [salão]. Quer que eu te conte em 1 minuto?`;

const WA_FOLLOWUP_2_NOSHOW = `Oi [Nome], só voltando 🙂 faltas e no-shows deixam cadeira parada — e quase ninguém confirma presença de verdade, todo dia.

A NexvyBeauty coloca IA pra confirmar horário e atender no WhatsApp do [salão]. Quer que eu te mostre como funciona?`;

const WA_FOLLOWUP_3_BREAKUP = `[Nome], não quero te encher 🙏 esse é meu último toque por aqui.

Se fizer sentido ter IA atendendo, confirmando presença e buscando quem não voltou no [salão], responde "quero". Se não for o momento, tranquilo — deixo a porta aberta.`;

const WA_OBJ_PRECO: Record<PrecoObjectionVariant, string> = {
  P1: `Boa 🙂 antes de falar só o número: o que muda a conta é ter alguém (IA) atendendo, confirmando presença e buscando quem sumiu — todo dia, sem você virar refém do WhatsApp. Te mostro como funciona no dia a dia do [salão]; aí você vê se o preço faz sentido. Combinado?`,
  P2: `Entendi a pergunta de preço 🙂 eu te falo o valor com clareza — e junto te mostro o que a equipe de IA faz de concreto (atender, marcar, confirmar, resgatar). Assim a conta fica justa. Posso?`,
  P3: `Preço sem contexto assusta mesmo 🙂 deixa eu te mostrar o que a NexvyBeauty faz no WhatsApp do salão; você decide se vale. Sem pressão — e o valor eu te passo na sequência. Ok?`,
};

const WA_OBJ_GOLPE = `Entendo total, é o seu WhatsApp e as suas clientes 🙌 deixa claro: eu não peço código, senha, nem acesso ao seu WhatsApp — nada disso.

Quando ativa de verdade, nada sai sem você aprovar cada mensagem — no seu tom, com o nome da cliente. Você aprova antes, sempre. Quer que eu te explique como fica?`;

// WA_CTA_A / WA_CTA_B removidos 2026-09-15 — oferta raio-x descontinuada.

// ── Instagram DM ──────────────────────────────────────────────────────────────
const IG_OPENING = `Oii [Nome]! Aqui é a [SeuNome], da Nexvy 🌿

Vi o seu [detalhe] e vim com 1 pergunta rápida: das clientes que passaram aí nos últimos meses, quantas você acha que sumiram e não voltaram?

Quase ninguém sabe o número — e é aí que vaza dinheiro. Posso te mostrar como descobrir? 👀`;

const IG_FOLLOWUP_2 = `[Nome], só pra não passar batido 👀 nos salões que já olhei, 3 a 4 de cada 10 clientes somem sem a dona perceber. O seu de [serviço] provavelmente tem mais. Quer que eu levante isso pra você?`;

const IG_OBJ_GOLPE = `Entendo total 🙌 não peço acesso a nada seu — nem senha, nem seu Direct. Eu levanto o número do meu lado e te mostro. E nada é enviado pra cliente sem você aprovar antes. Quer ver?`;

// IG_CTA (raio-x) removido 2026-09-15 — mesma descontinuação do CTA WA.

// ── API pública de render ────────────────────────────────────────────────────
export type ObjectionKind = "preco" | "golpe";

/**
 * Abertura síncrona. Instagram ok; WhatsApp SEMPRE lança — use
 * `renderOpeningFromDb` no caminho de envio (fail closed, sem copy stale).
 */
export function renderOpening(channel: Channel, tokens: ScriptTokens, _variant: Variant = DEFAULT_VARIANT): string {
  if (channel === "instagram") return fill(IG_OPENING, tokens);
  throw new Error(
    "renderOpening(whatsapp) removido: use await renderOpeningFromDb(sb, 'whatsapp', tokens, { agentId }) — abertura WA vem do additional_prompt do agente (Camila), nunca do template hardcoded.",
  );
}

/** Follow-up por passo (1 = D+2, 2 = D+4/5 breakup no WA; IG tem só o D+2). */
export function renderFollowup(
  channel: Channel,
  step: 1 | 2,
  tokens: ScriptTokens,
  variant: Variant = DEFAULT_VARIANT,
): string {
  if (channel === "instagram") return fill(IG_FOLLOWUP_2, tokens);
  if (step === 1) return fill(variant.dor === "A_sumiu" ? WA_FOLLOWUP_2_SUMIU : WA_FOLLOWUP_2_NOSHOW, tokens);
  return fill(WA_FOLLOWUP_3_BREAKUP, tokens);
}

/** Resposta de objeção. IG só trata golpe/robô (preço raro no DM).
 *  Preço WA: só P1|P2|P3 do banco fechado (via variant.precoObj). */
export function renderObjection(
  channel: Channel,
  kind: ObjectionKind,
  tokens: ScriptTokens,
  variant: Variant = DEFAULT_VARIANT,
): string {
  if (channel === "instagram") return fill(IG_OBJ_GOLPE, tokens);
  if (kind === "preco") {
    return fill(WA_OBJ_PRECO[variant.precoObj], tokens);
  }
  return fill(WA_OBJ_GOLPE, tokens);
}

/**
 * CTA raio-x removido (oferta descontinuada 2026-09-15).
 * Fail closed: nenhum caller deve pedir CTA A/B.
 */
export function renderCta(
  _channel: Channel,
  _tokens: ScriptTokens,
  _variant: Variant = DEFAULT_VARIANT,
): never {
  throw new Error(
    "renderCta removido: oferta raio-x / CTA A|B descontinuada — não usar",
  );
}

/**
 * Sequência completa de 1º-toque para enfileirar. `firstTouch` é a abertura;
 * os follow-ups entram na fila com os offsets D+2 / D+4-5. Zero link em TODAS
 * (validado por `containsLink` nos testes).
 *
 * WhatsApp: `firstTouch` NÃO pode ser gerado sync — use `renderOpeningFromDb`
 * no motor. Esta função lança se channel=whatsapp (evita copy stale).
 */
export interface RenderedSequence {
  firstTouch: string;
  followups: { step: 1 | 2; text: string; delayHours: number }[];
}

export function renderSequence(
  channel: Channel,
  tokens: ScriptTokens,
  variant: Variant = DEFAULT_VARIANT,
): RenderedSequence {
  const followups: RenderedSequence["followups"] = [
    { step: 1, text: renderFollowup(channel, 1, tokens, variant), delayHours: 48 }, // D+2
  ];
  if (channel === "whatsapp") {
    followups.push({ step: 2, text: renderFollowup(channel, 2, tokens, variant), delayHours: 108 }); // D+4/5 breakup
    // Fail closed: não devolver firstTouch stale.
    throw new Error(
      "renderSequence(whatsapp) sem firstTouch sync: use await renderOpeningFromDb para a abertura + renderFollowup para a fila.",
    );
  }
  return { firstTouch: renderOpening(channel, tokens, variant), followups };
}
