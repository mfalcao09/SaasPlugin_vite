// AES-256-GCM envelope encryption para credenciais Meta.
// A chave-mestre é auto-gerada em platform_settings via RPC SECURITY DEFINER.
// Service role only — nunca exposta ao client.

import { createClient } from 'npm:@supabase/supabase-js@2';

let cachedKey: CryptoKey | null = null;

async function getMasterKey(supabase: ReturnType<typeof getServiceClient>): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const { data, error } = await supabase.rpc('get_or_create_meta_master_key');
  if (error || !data) throw new Error(`master-key error: ${error?.message ?? 'no key'}`);
  const raw = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return cachedKey;
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function encryptSecret(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await getMasterKey(getServiceClient());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc),
  );
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  let s = '';
  for (const b of combined) s += String.fromCharCode(b);
  return 'v1:' + btoa(s);
}

export async function decryptSecret(payload: string): Promise<string> {
  if (!payload) return '';
  if (!payload.startsWith('v1:')) throw new Error('unknown cipher version');
  const key = await getMasterKey(getServiceClient());
  const raw = Uint8Array.from(atob(payload.slice(3)), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const cipher = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export function maskSecret(s: string | null | undefined): string {
  if (!s) return '';
  if (s.length <= 6) return '••••';
  return '••••' + s.slice(-4);
}

export function generateVerifyToken(): string {
  const arr = crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/[+/=]/g, '').slice(0, 32);
}
