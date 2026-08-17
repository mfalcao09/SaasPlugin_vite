/**
 * Gate do Raio-X / link de implantação.
 *
 * MEDIDO 2026-08-17 (conv c0b33068…): "Sim, pode ser que sim" casou aceite
 * genérico e o brain emitiu [ENVIAR_RAIOX] + URL na mesma resposta — 4 bolhas
 * seguidas, sem perguntar se restava dúvida. O prompt dizia "não pergunte de
 * novo, só dispare". Este módulo vira isso em CÓDIGO.
 *
 *   deno test --no-check supabase/functions/_shared/raiox-preflight.test.ts
 */

export const RAIOX_TAG = '[ENVIAR_RAIOX]';

export const RAIOX_PREFLIGHT_TEXT =
  'Antes de te mandar o link: ficou alguma dúvida? Você entendeu como a ferramenta funciona por completo? Quer saber mais alguma coisa?';

const ACEITE_RE =
  /\b(quero|pode mandar|pode enviar|manda|mande|envia|envie|mostra|topo|topa|bora|vamos|aceito|sim|beleza|fechado|fechou|ok|pode|manda o link)\b/;

const NOVA_DUVIDA_RE =
  /\b(como (que |é |e )|por que|porque|senha|v[ií]rus|golpe|e se|pega minha|n[aã]o (t[oô]|estou) confi)\b/;

function norm(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isRaioxUrl(text: string): boolean {
  return /\/implantacao\//i.test(text) || /nexvybeauty\.com\.br\/implantacao/i.test(text);
}

export function inboundConfirmaPreflight(text: string): boolean {
  const n = norm(text);
  if (!n.trim()) return false;
  if (n.includes('?')) return false;
  if (NOVA_DUVIDA_RE.test(n)) return false;
  return ACEITE_RE.test(n);
}

export function stripRaioxArtifacts(text: string): string {
  return String(text ?? '')
    .split(RAIOX_TAG)
    .join('')
    .replace(/https?:\/\/\S*implantacao\S*/gi, '')
    .replace(/(aqui est[aá]|t[aá] aqui|segue o link)\s*👉?\s*/gi, '')
    .replace(/👉/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function replyJaTemPreflight(text: string): boolean {
  const n = norm(text);
  return n.includes('ficou alguma duvida') && n.includes('entendeu');
}

/** Se o modelo tentou disparar o link cedo demais, vira a pergunta obrigatória. */
export function ensureRaioxPreflight(text: string): string {
  const cleaned = stripRaioxArtifacts(text);
  if (replyJaTemPreflight(cleaned)) return cleaned;
  return cleaned ? `${cleaned}\n\n${RAIOX_PREFLIGHT_TEXT}` : RAIOX_PREFLIGHT_TEXT;
}

export function deveLiberarRaiox(opts: {
  preflightAsked: boolean;
  inboundText: string;
}): boolean {
  return opts.preflightAsked === true && inboundConfirmaPreflight(opts.inboundText);
}
