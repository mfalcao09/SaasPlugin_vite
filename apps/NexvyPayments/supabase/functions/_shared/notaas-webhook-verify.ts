// _shared/notaas-webhook-verify.ts
//
// Função PURA de verificação de assinatura do webhook NotaAS (Entregável C2).
// Isolada do handler (index.ts) justamente para ser testável 100% offline: recebe
// o secret, o corpo CRU e o header de assinatura como STRINGS, e devolve um
// booleano — sem tocar rede, banco nem Deno.env.
//
// Molde 1:1 do HMAC herdado do Beauty/Vendus `_shared/meta-graph.ts:48-68`
// (`hmacSha256Hex` + `timingSafeEqual`), que valida a X-Hub-Signature-256 do
// webhook Meta. Aqui aplicamos o MESMO envelope (HMAC-SHA256 hex via crypto.subtle
// + comparação de tempo constante) ao header `X-Notaas-Signature` do NotaAS.
// Reimplementamos as duas primitivas neste arquivo de domínio (em vez de importar
// meta-graph.ts) para não acoplar o cofre de cobrança ao módulo Meta — mesma
// lógica, byte a byte.
//
// TIMING-SAFE (spec §3.2 C2): a comparação NUNCA usa `===` (que faz short-circuit
// no 1º byte divergente e vaza o comprimento do prefixo correto por temporização).
// `timingSafeEqual` percorre TODOS os bytes acumulando XOR — tempo constante para
// entradas de mesmo tamanho.

/** HMAC-SHA256 do `body` com a `key`, em hex minúsculo. Molde: meta-graph.ts:48. */
export async function hmacSha256Hex(key: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Comparação de tempo constante entre duas strings. Molde: meta-graph.ts:63.
 *
 * Devolve `false` imediatamente se os comprimentos diferem (o comprimento não é
 * segredo). Para comprimentos iguais, percorre TODOS os caracteres acumulando o
 * XOR — não faz short-circuit no 1º byte divergente (evita o oráculo de timing).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Normaliza o header de assinatura para o hex cru comparável.
 *
 * O NotaAS pode enviar a assinatura com ou sem prefixo de esquema
 * (`sha256=<hex>` ao estilo Meta, ou só `<hex>`). Aceitamos ambos: tiramos o
 * prefixo `sha256=` se presente, normalizamos para minúsculo e removemos espaços
 * de borda. NÃO alteramos o corpo comparado — só a forma do header.
 */
export function normalizeSignature(header: string | null | undefined): string {
  if (!header) return '';
  let s = header.trim();
  if (s.toLowerCase().startsWith('sha256=')) s = s.slice('sha256='.length);
  return s.toLowerCase();
}

/**
 * Verifica a assinatura HMAC-SHA256 do webhook NotaAS.
 *
 * @param secret          Segredo compartilhado do webhook (decifrado do cofre
 *                        billing_credentials, provider 'notaas'). Nunca logado.
 * @param rawBody         Corpo CRU da requisição (string), EXATAMENTE como veio
 *                        no fio — assinar o JSON re-serializado quebraria o HMAC.
 * @param signatureHeader Valor de `X-Notaas-Signature` (com ou sem `sha256=`).
 * @returns `true` só se o HMAC computado casar, byte a byte, em tempo constante.
 *          Secret/header/body vazios ⇒ `false` (nunca "passa" por omissão).
 */
export async function verifyNotaasSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<boolean> {
  const provided = normalizeSignature(signatureHeader);
  if (!secret || !provided) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, provided);
}
