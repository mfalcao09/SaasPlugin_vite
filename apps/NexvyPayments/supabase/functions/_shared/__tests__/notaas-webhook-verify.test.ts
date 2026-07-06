// _shared/__tests__/notaas-webhook-verify.test.ts
//
// Suíte `deno test` PURA (zero rede real) para a função de verificação de
// assinatura do webhook NotaAS `notaas-webhook-verify.ts` — Entregável C2.
//
// A função pura NÃO toca banco, rede nem Deno.env: só crypto.subtle (HMAC local).
// Por isso não há env fake nem monkey-patch de fetch (diferente de
// billing-crypto.test.ts, que instancia o client supabase-js). Aqui o egress é
// naturalmente zero: `crypto.subtle` é local ao runtime.
//
// Contrato exercitado (spec §3.2 C2):
//   - assinatura VÁLIDA (HMAC-SHA256 hex do corpo com o secret) ⇒ true
//   - assinatura INVÁLIDA (secret errado / corpo adulterado) ⇒ false
//   - timing-safe: comprimentos diferentes ⇒ false SEM comparar conteúdo; a
//     comparação de mesmo tamanho é constante (não usa ===)
//   - normalização do header: aceita `sha256=<hex>` e `<hex>` cru, case-insensitive
//   - entradas vazias (secret/header/body) ⇒ false (nunca "passa" por omissão)
//   - o dedup atômico é do BANCO (UNIQUE em notaas_webhook_deliveries); aqui
//     provamos a base do dedup lógico: a MESMA (secret, body) sempre produz a
//     MESMA assinatura determinística → o receptor pode compará-la de forma
//     estável entre re-entregas.
//
// FLAGS: roda com `deno test --no-check --allow-env --allow-net`. Não precisa de
// nenhuma permissão de fato (não lê env nem faz rede), mas o comando padrão do
// projeto passa as flags; elas são inócuas aqui.

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import {
  hmacSha256Hex,
  normalizeSignature,
  timingSafeEqual,
  verifyNotaasSignature,
} from '../notaas-webhook-verify.ts';

// Secret e corpo SINTÉTICOS (nunca valores reais). O corpo é o JSON CRU que o
// NotaAS assinaria — a função compara o HMAC deste corpo, byte a byte.
const SECRET = 'notaas_webhook_secret_sintetico_c2_9f3a';
const RAW_BODY = JSON.stringify({
  event: 'nfse.issued',
  data: { invoice_id: 'ntaas_inv_123', referencia: 'NFSE-2026-000123', numero: '000123' },
});

/** Calcula a assinatura correta (o que o NotaAS colocaria no header). */
async function sign(secret: string, body: string): Promise<string> {
  return await hmacSha256Hex(secret, body);
}

// ---------------------------------------------------------------------------
// VÁLIDA: header = HMAC correto do corpo com o secret ⇒ true (com e sem prefixo)
// ---------------------------------------------------------------------------
Deno.test('assinatura valida (hex cru) => true', async () => {
  const sig = await sign(SECRET, RAW_BODY);
  assert(await verifyNotaasSignature(SECRET, RAW_BODY, sig));
});

Deno.test('assinatura valida com prefixo sha256= => true', async () => {
  const sig = await sign(SECRET, RAW_BODY);
  assert(await verifyNotaasSignature(SECRET, RAW_BODY, `sha256=${sig}`));
});

Deno.test('assinatura valida em MAIUSCULAS (case-insensitive) => true', async () => {
  const sig = await sign(SECRET, RAW_BODY);
  assert(await verifyNotaasSignature(SECRET, RAW_BODY, sig.toUpperCase()));
});

// ---------------------------------------------------------------------------
// INVÁLIDA: secret errado, corpo adulterado, header lixo ⇒ false (rejeita ⇒ 401)
// ---------------------------------------------------------------------------
Deno.test('secret errado => false', async () => {
  const sigComSecretErrado = await sign('secret_do_atacante', RAW_BODY);
  assertFalse(await verifyNotaasSignature(SECRET, RAW_BODY, sigComSecretErrado));
});

Deno.test('corpo adulterado (mesmo secret) => false', async () => {
  // O atacante assina o corpo original mas envia um corpo trocado.
  const sigDoOriginal = await sign(SECRET, RAW_BODY);
  const corpoAdulterado = RAW_BODY.replace('ntaas_inv_123', 'ntaas_inv_HACK');
  assertFalse(await verifyNotaasSignature(SECRET, corpoAdulterado, sigDoOriginal));
});

Deno.test('header de assinatura lixo => false', async () => {
  assertFalse(await verifyNotaasSignature(SECRET, RAW_BODY, 'deadbeef'));
});

// ---------------------------------------------------------------------------
// Entradas vazias/nulas: NUNCA passam por omissão
// ---------------------------------------------------------------------------
Deno.test('secret vazio => false (nunca passa por omissao)', async () => {
  const sig = await sign(SECRET, RAW_BODY);
  assertFalse(await verifyNotaasSignature('', RAW_BODY, sig));
});

Deno.test('header ausente (null/undefined/vazio) => false', async () => {
  assertFalse(await verifyNotaasSignature(SECRET, RAW_BODY, null));
  assertFalse(await verifyNotaasSignature(SECRET, RAW_BODY, undefined));
  assertFalse(await verifyNotaasSignature(SECRET, RAW_BODY, ''));
});

// ---------------------------------------------------------------------------
// TIMING-SAFE: comprimentos diferentes => false; mesmo tamanho compara tudo
// ---------------------------------------------------------------------------
Deno.test('timingSafeEqual: comprimentos diferentes => false', () => {
  assertFalse(timingSafeEqual('abc', 'abcd'));
  assertFalse(timingSafeEqual('', 'x'));
});

Deno.test('timingSafeEqual: iguais => true; 1 byte diferente => false', () => {
  const hex = 'a3f0'.repeat(16); // 64 chars, formato de um HMAC-SHA256 hex
  assert(timingSafeEqual(hex, hex));
  // Difere só no ÚLTIMO caractere: um `===` short-circuita cedo em outros casos,
  // mas aqui o ponto é o resultado — a implementação varre todos os bytes.
  const quaseIgual = hex.slice(0, -1) + (hex.at(-1) === '0' ? '1' : '0');
  assertEquals(hex.length, quaseIgual.length);
  assertFalse(timingSafeEqual(hex, quaseIgual));
});

Deno.test('timingSafeEqual: difere no PRIMEIRO byte => false (sem short-circuit observavel)', () => {
  const a = 'f' + '0'.repeat(63);
  const b = '0' + '0'.repeat(63);
  assertEquals(a.length, b.length);
  assertFalse(timingSafeEqual(a, b));
});

// ---------------------------------------------------------------------------
// Normalização do header
// ---------------------------------------------------------------------------
Deno.test('normalizeSignature: tira prefixo sha256=, apara e baixa a caixa', () => {
  assertEquals(normalizeSignature('sha256=ABCDEF'), 'abcdef');
  assertEquals(normalizeSignature('  ABCDEF  '), 'abcdef');
  assertEquals(normalizeSignature('SHA256=AbCdEf'), 'abcdef');
  assertEquals(normalizeSignature(null), '');
  assertEquals(normalizeSignature(undefined), '');
});

// ---------------------------------------------------------------------------
// Determinismo (base do dedup lógico): a MESMA (secret, body) => MESMA assinatura.
// O dedup ATÔMICO real é o UNIQUE(org, delivery_id) do banco; aqui garantimos
// que a assinatura é estável entre re-entregas idênticas (não-flaky).
// ---------------------------------------------------------------------------
Deno.test('HMAC determinista: mesmo (secret, body) => mesma assinatura em 2 calls', async () => {
  const s1 = await sign(SECRET, RAW_BODY);
  const s2 = await sign(SECRET, RAW_BODY);
  assertEquals(s1, s2);
  assert(await verifyNotaasSignature(SECRET, RAW_BODY, s1));
  assert(await verifyNotaasSignature(SECRET, RAW_BODY, s2));
});

// Sanidade do formato: HMAC-SHA256 hex tem 64 caracteres [0-9a-f].
Deno.test('formato do HMAC: 64 chars hex minusculo', async () => {
  const sig = await sign(SECRET, RAW_BODY);
  assertEquals(sig.length, 64);
  assert(/^[0-9a-f]{64}$/.test(sig), 'HMAC deve ser 64 hex minusculos');
});
