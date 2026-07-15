// _shared/cold-outreach/script.ts
//
// SCRIPT WIRED — a copy VENCEDORA do COLD-OUTREACH-SCRIPT §2, pronta pra render.
// Espinha prova-social (identidade) + mecânica perda (cálculo próprio) + norte
// demo (reversão de risco), com os 3 buracos removidos. Versões WhatsApp e IG DM,
// 2 follow-ups (D+2, D+4/5 breakup), respostas de objeção, e SUPORTE A/B (§5.1).
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/script.test.ts
//
// Determinístico de propósito: o esqueleto é FIXO (o LLM só preenche tokens do
// lado do motor, se quiser personalizar [servico]/[detalheIg]) — assim garantimos
// "zero link na 1ª msg", 1 emoji, curto. `containsLink()` prova isso nos testes.

export interface ScriptTokens {
  nome: string; // [Nome] — primeiro nome do lead
  seuNome: string; // [SeuNome] — quem assina (config da campanha)
  salao: string; // [salão] — nome do salão/@handle
  detalheIg?: string; // [detalhe real do IG] — post/trabalho real (IG e opcional no WA)
  servico?: string; // [serviço carro-chefe] — ex. "escova", "unha", "sobrancelha"
}

export type Channel = "whatsapp" | "instagram";

/** Substitui tokens no template. Fallbacks seguros pra não deixar "[serviço]" cru. */
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

// ── Detector de link (guard anti-link na 1ª msg) ─────────────────────────────
const LINK_RE = /(https?:\/\/|www\.|wa\.me|t\.me|bit\.ly|\b[a-z0-9-]+\.(com|br|net|io|link|me)\b)/i;

/** Há URL/link no texto? Usado pra PROVAR que a abertura não tem link. */
export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

// ── A/B (§5.1) — 1 variável por vez ──────────────────────────────────────────
export type OpeningVariant = "A_pergunta" | "B_prova"; // A/B 1
export type DorVariant = "A_sumiu" | "B_noshow"; // A/B 2
export type CtaVariant = "A_hoje_amanha" | "B_quero"; // A/B 5

export interface Variant {
  opening: OpeningVariant;
  dor: DorVariant;
  cta: CtaVariant;
}

export const DEFAULT_VARIANT: Variant = {
  opening: "A_pergunta",
  dor: "A_sumiu",
  cta: "A_hoje_amanha",
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
  return {
    opening: (h & 1) ? "A_pergunta" : "B_prova",
    dor: (h & 2) ? "A_sumiu" : "B_noshow",
    cta: (h & 4) ? "A_hoje_amanha" : "B_quero",
  };
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
const WA_OPENING_A = `Oi [Nome]! Aqui é a [SeuNome], da Nexvy 🌿 ajudo salão a recuperar cliente que sumiu, sem gastar com anúncio.

Vi o [salão] e fiquei com uma pergunta: das suas clientes dos últimos meses, quantas você acha que sumiram e não voltaram?

Quase ninguém sabe o número — e é bem aí que costuma vazar dinheiro. Posso te mostrar como descobrir isso no [salão]? Leva 2 min e é de graça.`;

const WA_OPENING_B = `Oi [Nome]! Aqui é a [SeuNome], da Nexvy 🌿 ajudo salão a recuperar cliente que sumiu, sem gastar com anúncio.

Nos salões que já olhei, 3 a 4 de cada 10 clientes somem no prazo que deveriam voltar — e a dona quase nunca percebe. Fiquei curiosa como tá isso no [salão].

Posso te mostrar como descobrir esse número aí? Leva 2 min e é de graça.`;

const WA_FOLLOWUP_2_SUMIU = `Oi [Nome], só voltando aqui 🙂 pra você ter uma ideia: nos salões que já olhei, 3 a 4 de cada 10 clientes somem no prazo que deveriam voltar. Multiplica isso pelo que cada uma gasta num [serviço]… é dinheiro que já era seu, parado.

Eu monto esse raio-x com os números do [salão] — sem custo e sem acesso nenhum ao seu WhatsApp. Quer que eu puxe?`;

const WA_FOLLOWUP_2_NOSHOW = `Oi [Nome], só voltando aqui 🙂 uma dor que quase todo salão tem e ninguém mede: as faltas e os no-shows. Cada horário furado num [serviço] é uma cadeira parada que não volta.

Eu monto um raio-x disso com os números do [salão] — sem custo e sem acesso nenhum ao seu WhatsApp. Quer que eu puxe?`;

const WA_FOLLOWUP_3_BREAKUP = `[Nome], não quero te encher 🙏 esse é meu último toque por aqui.

As clientes que sumiram continuam sumidas hoje só porque ninguém chamou de volta — não porque não voltariam. Se quiser ver o número do [salão], responde "quero". Se não for o momento, tranquilo, deixo a porta aberta.`;

const WA_OBJ_PRECO = `Boa 🙂 mas deixa eu inverter: antes de preço, faz mais sentido eu te mostrar quanto tem parado aí — porque recuperar R$8, R$10 mil muda toda a conta. Te mostro o raio-x do [salão] de graça; você vê o número e decide se compensa. Se não compensar, fica com o raio-x de brinde. Combinado?`;

const WA_OBJ_GOLPE = `Entendo total, é o seu WhatsApp e as suas clientes 🙌 então deixa claro: eu não peço código, senha, nem acesso ao seu WhatsApp — nada disso. Eu levanto o número do meu lado e te mostro pronto.

E quando a gente ativa de verdade, nada sai sem você aprovar cada mensagem — no seu tom, com o nome da cliente. Você aprova antes, sempre. Quer ver como fica?`;

const WA_CTA_A = `Então bora: me responde "quero" que eu monto o raio-x do [salão] — quantas clientes sumiram, há quanto tempo e quanto vale em R$. Você olha e decide. Sem custo, sem compromisso, sem acesso ao seu Whats. Que dia te pega melhor, hoje ou amanhã?`;

const WA_CTA_B = `Então bora: me responde "quero" que eu monto o raio-x do [salão] — quantas clientes sumiram, há quanto tempo e quanto vale em R$. Você olha e decide. Sem custo, sem compromisso, sem acesso ao seu Whats.`;

// ── Instagram DM ──────────────────────────────────────────────────────────────
const IG_OPENING = `Oii [Nome]! Aqui é a [SeuNome], da Nexvy 🌿

Vi o seu [detalhe] e vim com 1 pergunta rápida: das clientes que passaram aí nos últimos meses, quantas você acha que sumiram e não voltaram?

Quase ninguém sabe o número — e é aí que vaza dinheiro. Posso te mostrar como descobrir? 👀`;

const IG_FOLLOWUP_2 = `[Nome], só pra não passar batido 👀 nos salões que já olhei, 3 a 4 de cada 10 clientes somem sem a dona perceber. O seu de [serviço] provavelmente tem mais. Quer que eu levante isso pra você?`;

const IG_OBJ_GOLPE = `Entendo total 🙌 não peço acesso a nada seu — nem senha, nem seu Direct. Eu levanto o número do meu lado e te mostro. E nada é enviado pra cliente sem você aprovar antes. Quer ver?`;

const IG_CTA = `Me responde só "quero" aqui que a gente combina o melhor jeito de eu te mostrar o raio-x do seu salão — sem custo e sem acesso a nada seu. 🙌`;

// ── API pública de render ────────────────────────────────────────────────────
export type ObjectionKind = "preco" | "golpe";

/** Abertura (1º toque). WhatsApp respeita A/B de abertura; IG é fixo (personaliza post). */
export function renderOpening(channel: Channel, tokens: ScriptTokens, variant: Variant = DEFAULT_VARIANT): string {
  if (channel === "instagram") return fill(IG_OPENING, tokens);
  return fill(variant.opening === "A_pergunta" ? WA_OPENING_A : WA_OPENING_B, tokens);
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

/** Resposta de objeção. IG só trata golpe/robô (preço raro no DM). */
export function renderObjection(channel: Channel, kind: ObjectionKind, tokens: ScriptTokens): string {
  if (channel === "instagram") return fill(IG_OBJ_GOLPE, tokens);
  return fill(kind === "preco" ? WA_OBJ_PRECO : WA_OBJ_GOLPE, tokens);
}

/** CTA pra demo/raio-x. WhatsApp respeita A/B de CTA; IG é fixo. */
export function renderCta(channel: Channel, tokens: ScriptTokens, variant: Variant = DEFAULT_VARIANT): string {
  if (channel === "instagram") return fill(IG_CTA, tokens);
  return fill(variant.cta === "A_hoje_amanha" ? WA_CTA_A : WA_CTA_B, tokens);
}

/**
 * Sequência completa de 1º-toque para enfileirar. `firstTouch` é a abertura;
 * os follow-ups entram na fila com os offsets D+2 / D+4-5. Zero link em TODAS
 * (validado por `containsLink` nos testes).
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
  }
  return { firstTouch: renderOpening(channel, tokens, variant), followups };
}
