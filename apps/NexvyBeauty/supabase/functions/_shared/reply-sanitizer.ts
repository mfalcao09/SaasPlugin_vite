/**
 * Censura de vocabulário da resposta da agente — POR SENTENÇA, nunca por token.
 *
 * ── O DEFEITO QUE ISTO MATA (capturado ao vivo pelo eval E1, 2026-08-06) ────────
 * A agente escreveu:
 *     "Desconto não tem como, Fernanda — mas olha a conta antes de decidir se é caro."
 * e a lead recebeu:
 *     "a conta da recuperação (2-3 clientes de volta já pagam a mensalidade) não tem
 *      como, Fernanda — mas olha a conta antes de decidir se é caro."
 *
 * Frase destruída, em produção. E o golden aprovou 3/3, porque nenhuma asserção
 * pergunta se a frase FAZ SENTIDO.
 *
 * ── AS DUAS CAUSAS (a segunda sobrevive ao conserto da primeira) ────────────────
 * (1) GUARDA DE UMA PORTA SÓ. O guard olhava `fonte.slice(offset - 40, offset)` —
 *     só os 40 caracteres à ESQUERDA. Aqui o termo ABRE a frase e a negação vem à
 *     DIREITA ("Desconto não tem como"), então o guard não viu nada e substituiu.
 *     Mesma família do platform-evolution-send, que conferia só `Authorization` e
 *     ignorava `apikey`: cuidado aparente, cobertura parcial.
 * (2) SPLICE SUBSTANTIVO→ORAÇÃO. Trocar "desconto" (substantivo) por "a conta da
 *     recuperação (...)" (oração inteira) quebra a sintaxe MESMO SEM NEGAÇÃO
 *     nenhuma. Ampliar a janela do guard não resolveria isto.
 *
 * ── A REGRA ────────────────────────────────────────────────────────────────────
 * Nunca costurar no meio de uma frase. A unidade de decisão é a SENTENÇA:
 *   · sentença com o termo E com negação em QUALQUER posição ⇒ sai INTACTA
 *     (a agente já está negando — é o comportamento certo, não há o que censurar);
 *   · sentença com o termo e sem negação ⇒ a sentença inteira CAI, e a reancoragem
 *     entra como sentença própria no fim.
 * Assim a saída é sempre gramatical: ou é texto que o modelo escreveu, ou é texto
 * que nós escrevemos — nunca um enxerto dos dois.
 */

/** Negação em QUALQUER posição da sentença — não só antes do termo. */
const NEGACAO = /\b(n[ãa]o|sem|nunca|jamais|nenhum[ao]?|zero|imposs[ií]vel)\b/i;

/** Termo proibido → reancoragem que entra como sentença PRÓPRIA. */
interface Regra {
  termo: RegExp;
  reancoragem: string;
}

const REGRAS: Regra[] = [
  // "teste grátis / trial grátis / período grátis" e "grátis" solto: o produto é PAGO.
  {
    termo: /\b(teste|trial|per[ií]odo)\s+gr[aá]tis\b|\bgr[aá]tis\b/i,
    reancoragem: 'É um produto pago, mas o valor se paga recuperando 2-3 clientes.',
  },
  // desconto / promoção: reancorar no VALOR e no preço de HOJE.
  // ZERO menção a "vai subir" — a âncora temporal foi REVOGADA pelo Marcelo.
  {
    termo: /\b(desconto|descontos)\b/i,
    reancoragem: 'O que eu consigo te mostrar é a conta: 2-3 clientes de volta já pagam a mensalidade.',
  },
  {
    termo: /\bpromo(?:ç|c)(?:ã|a)o\b/i,
    reancoragem: 'O preço que te passei é o que está valendo hoje.',
  },
];

export interface SanitizeResult {
  text: string;
  sanitized: boolean;
  /** Quantas sentenças foram DERRUBADAS (não substituídas). Vai pro log/metadata. */
  removidas: number;
}

/**
 * Quebra em sentenças. Trata o que aparece no WhatsApp: `.` `!` `?` `…`, quebra de
 * linha — e o travessão, que a agente usa como separador de oração ("Desconto não
 * tem como, Fernanda — mas olha a conta").
 * Não é tokenizador linguístico: é o suficiente pra nunca cortar no meio.
 */
export function splitSentencas(texto: string): string[] {
  const partes = texto
    .split(/(?<=[.!?…])\s+|\n+|\s+—\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return partes.length > 0 ? partes : (texto.trim() ? [texto.trim()] : []);
}

/**
 * Aplica a censura de vocabulário. Idempotente: rodar duas vezes dá o mesmo texto,
 * porque nenhuma reancoragem contém termo proibido (há teste cobrindo).
 */
export function sanitizeReply(input: string): SanitizeResult {
  const sentencas = splitSentencas(input);
  if (sentencas.length === 0) return { text: input, sanitized: false, removidas: 0 };

  const mantidas: string[] = [];
  const anexos: string[] = [];
  let removidas = 0;

  for (const s of sentencas) {
    const regra = REGRAS.find((r) => r.termo.test(s));
    if (!regra) {
      mantidas.push(s);
      continue;
    }
    // A sentença já nega o termo ⇒ é o comportamento CERTO. Sai intacta.
    if (NEGACAO.test(s)) {
      mantidas.push(s);
      continue;
    }
    // Sem negação ⇒ a sentença inteira cai. Nunca se costura no meio dela.
    removidas++;
    if (!anexos.includes(regra.reancoragem)) anexos.push(regra.reancoragem);
  }

  if (removidas === 0) return { text: input, sanitized: false, removidas: 0 };

  const text = [...mantidas, ...anexos].join(' ').replace(/\s+/g, ' ').trim();
  return { text, sanitized: true, removidas };
}
