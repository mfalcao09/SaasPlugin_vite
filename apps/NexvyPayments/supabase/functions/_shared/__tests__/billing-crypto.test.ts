// _shared/__tests__/billing-crypto.test.ts
//
// Suíte `deno test` PURA (zero rede real) para o wrapper de cofre `billing-crypto.ts`,
// que embrulha o envelope AES-256-GCM herdado de `meta-crypto.ts`. Contrato do
// Entregável A4:
//   - round-trip: cifra -> 'v1:...' -> decifra === plaintext
//   - o valor cifrado != plaintext E começa com 'v1:'
//   - decifrar input inválido (sem 'v1:') falha de forma CONTROLADA (throw)
//   - cifrar plaintext vazio falha de forma controlada
//
// ISOLAMENTO DE REDE: `meta-crypto.ts` obtém a chave-mestra via
// `supabase.rpc('get_or_create_meta_master_key')` — uma chamada HTTP do client
// supabase-js, que lê SUPABASE_URL/SERVICE_ROLE_KEY de `Deno.env`. Aqui NÃO usamos
// chave nem projeto reais: injetamos env FAKE e interceptamos `globalThis.fetch`
// para devolver uma chave-mestra SINTÉTICA (32 bytes base64). Assim exercitamos a
// cifra AES real (crypto.subtle, local) SEM nenhum egress de rede. O `fetch`
// stub estoura em qualquer URL != RPC, provando que não há outra chamada.
//
// FLAGS: precisa de `--allow-env` (o helper `getServiceClient` lê Deno.env);
// NÃO precisa de `--allow-net` (fetch monkey-patched). Os testes que instanciam
// o client supabase-js usam `sanitizeResources/Ops:false` porque o client cria
// timers/intervals de reconexão em background que vivem FORA do escopo do teste
// (herança do supabase-js, não do nosso código) — o sanitizer os sinalizaria
// como "leak" mesmo com a lógica 100% correta.

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// --- Env FAKE (nunca valores reais). Necessário antes de qualquer import que
//     instancie o client supabase-js. ---------------------------------------
Deno.env.set('SUPABASE_URL', 'https://fake-local.supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc-role-key-fake-para-teste');

// Chave-mestra SINTÉTICA: 32 bytes AES-256, base64 (o que a RPC devolveria).
const FAKE_MASTER_KEY_B64 = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256)),
);

// --- Intercepta o fetch do supabase-js para a RPC da chave-mestra e contabiliza
//     o egress. A RPC recebe a chave sintética (função escalar -> valor bare).
//     Qualquer OUTRA URL é a) contada como egress-fora-de-contrato e b) resolvida
//     de forma benigna (204) — NUNCA sai da máquina. Não lançamos erro no path
//     de "outra URL" porque o client supabase-js herdado agenda timers de
//     reconexão em background: lançar ali transformaria esses timers em falhas
//     aleatórias entre testes. Em vez disso ASSERTAMOS `unexpectedEgress === 0`
//     ao final (prova positiva de zero-rede, sem flakiness). O patch é global e
//     vive por todo o processo; o Deno derruba tudo no exit (sem teardown que
//     mutaria estado global no meio da suíte). ---------------------------------
const fetchStats = { rpc: 0, unexpectedEgress: 0 };
globalThis.fetch = ((input: Request | URL | string, _init?: RequestInit) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.href
    : input.url;
  if (url.includes('/rest/v1/rpc/get_or_create_meta_master_key')) {
    fetchStats.rpc++;
    return Promise.resolve(
      new Response(JSON.stringify(FAKE_MASTER_KEY_B64), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  // Egress fora de contrato (ex.: timer de reconexão do client): conta e neutraliza.
  fetchStats.unexpectedEgress++;
  return Promise.resolve(new Response(null, { status: 204 }));
}) as typeof globalThis.fetch;

// Import DEPOIS do env/stub estarem no lugar.
const { encryptBillingSecret, decryptBillingSecret, BILLING_CIPHER_PREFIX } =
  await import('../billing-crypto.ts');

// Opções para testes que instanciam o client supabase-js (timers de background
// herdados — ver cabeçalho). Não desliga nenhuma asserção, só o leak-checker.
const clientBackedTest = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// Round-trip: cifra -> 'v1:...' -> decifra === plaintext
// ---------------------------------------------------------------------------
Deno.test({
  name: 'round-trip: encrypt -> decrypt devolve o plaintext original',
  ...clientBackedTest,
  async fn() {
    const plaintext = 'client_secret_c6_sintetico_9f3a';
    const cifrado = await encryptBillingSecret(plaintext);
    const decifrado = await decryptBillingSecret(cifrado);
    assertEquals(decifrado, plaintext);
  },
});

// ---------------------------------------------------------------------------
// Formato: cifrado != plaintext E começa com 'v1:'
// ---------------------------------------------------------------------------
Deno.test({
  name: "cifrado difere do plaintext e comeca com 'v1:'",
  ...clientBackedTest,
  async fn() {
    const plaintext = 'ntaas_org_chave_sintetica_abcd';
    const cifrado = await encryptBillingSecret(plaintext);
    assert(cifrado.startsWith(BILLING_CIPHER_PREFIX), "deve comecar com 'v1:'");
    assertEquals(BILLING_CIPHER_PREFIX, 'v1:');
    assertNotEquals(cifrado, plaintext);
    assert(!cifrado.includes(plaintext), 'plaintext nao pode aparecer em claro no envelope');
  },
});

// IV aleatório: cifrar o mesmo segredo duas vezes gera envelopes diferentes,
// ambos decifrando para o mesmo plaintext (não-determinismo do AES-GCM).
Deno.test({
  name: 'IV aleatorio: dois encrypts do mesmo valor diferem mas decifram igual',
  ...clientBackedTest,
  async fn() {
    const plaintext = 'senha_a1_pfx_sintetica';
    const c1 = await encryptBillingSecret(plaintext);
    const c2 = await encryptBillingSecret(plaintext);
    assertNotEquals(c1, c2);
    assertEquals(await decryptBillingSecret(c1), plaintext);
    assertEquals(await decryptBillingSecret(c2), plaintext);
  },
});

// ---------------------------------------------------------------------------
// Falhas controladas
// ---------------------------------------------------------------------------
// Este NÃO chega a instanciar o client (falha no guard de prefixo antes) —
// mas mantemos o sanitizer relaxado por consistência de execução em lote.
Deno.test({
  name: 'decrypt de input invalido (sem v1:) falha de forma controlada',
  ...clientBackedTest,
  async fn() {
    await assertRejects(
      () => decryptBillingSecret('nao-tem-prefixo-versionado'),
      Error,
      'v1:',
    );
  },
});

Deno.test('decrypt de string vazia falha de forma controlada', async () => {
  await assertRejects(() => decryptBillingSecret(''), Error, 'v1:');
});

Deno.test('encrypt de plaintext vazio falha de forma controlada', async () => {
  await assertRejects(() => encryptBillingSecret(''), Error, 'vazio');
});

Deno.test({
  name: 'decrypt de v1: com corpo corrompido falha (nao devolve lixo silencioso)',
  ...clientBackedTest,
  async fn() {
    // Prefixo correto, base64 inválido/curto -> a decifra AES deve estourar.
    await assertRejects(() => decryptBillingSecret('v1:@@@nao-base64@@@'));
  },
});

// PROVA de zero-rede: só a RPC da chave-mestra foi chamada; nenhum egress fora
// de contrato de fato saiu (foi contado e neutralizado em 204).
Deno.test({
  name: 'zero-rede: apenas a RPC da chave-mestra foi chamada (egress fora de contrato neutralizado)',
  ...clientBackedTest,
  fn() {
    assert(fetchStats.rpc >= 1, 'a RPC da chave-mestra deveria ter sido exercitada');
    assertEquals(
      fetchStats.unexpectedEgress,
      0,
      `houve ${fetchStats.unexpectedEgress} tentativa(s) de egress fora do contrato da RPC`,
    );
  },
});
