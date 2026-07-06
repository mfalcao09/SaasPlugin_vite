// _shared/billing-crypto.ts
//
// Wrapper FINO de domínio sobre o envelope AES-256-GCM herdado do Beauty/Vendus
// (`_shared/meta-crypto.ts`). NÃO reimplementa a cifra: importa direto
// `encryptSecret`/`decryptSecret` e apenas dá nomes de domínio de COBRANÇA
// (`encryptBillingSecret`/`decryptBillingSecret`) + valida o contrato de formato
// `v1:` que alimenta `billing_credentials.cred_cifrada` (blueprint §3 / §266).
//
// A chave-mestra e o formato `v1:'+base64` vêm 100% do meta-crypto — este arquivo
// é uma camada de nomenclatura + guarda de invariante, para que as Edge Functions
// do cofre (cobranca-onboarding, billing-dispatch-worker) leiam "billing" e não
// "meta" ao lidar com segredos de C6/NotaAS/A1.

import { decryptSecret, encryptSecret } from './meta-crypto.ts';

/** Prefixo de versão do envelope (meta-crypto.ts:38/43). Contrato de `cred_cifrada`. */
export const BILLING_CIPHER_PREFIX = 'v1:';

/**
 * Cifra um segredo de cobrança (client_secret C6, API key NotaAS, senha do A1…)
 * para armazenar em `billing_credentials.cred_cifrada`.
 *
 * Delega em `encryptSecret` (meta-crypto.ts:25) — mesmo envelope AES-256-GCM,
 * mesma chave-mestra. Garante, por contrato, que o retorno é um envelope `v1:`.
 *
 * @throws se o plaintext for vazio (não faz sentido cifrar segredo vazio no cofre).
 */
export async function encryptBillingSecret(plaintext: string): Promise<string> {
  if (!plaintext) {
    throw new Error('billing-crypto: plaintext vazio — nada a cifrar');
  }
  const payload = await encryptSecret(plaintext);
  // Invariante defensiva: o cofre só aceita envelope versionado.
  if (!payload.startsWith(BILLING_CIPHER_PREFIX)) {
    throw new Error('billing-crypto: envelope inesperado (prefixo != v1:)');
  }
  return payload;
}

/**
 * Decifra um valor de `billing_credentials.cred_cifrada` de volta ao segredo em claro.
 *
 * Valida o prefixo `v1:` ANTES de delegar (falha controlada em input inválido/corrompido),
 * depois usa `decryptSecret` (meta-crypto.ts:41). Nunca loga o segredo.
 *
 * @throws se o payload não estiver no formato `v1:` (input inválido) ou a decifra falhar.
 */
export async function decryptBillingSecret(payload: string): Promise<string> {
  if (!payload || !payload.startsWith(BILLING_CIPHER_PREFIX)) {
    throw new Error('billing-crypto: cred_cifrada invalida (esperado prefixo v1:)');
  }
  return await decryptSecret(payload);
}
