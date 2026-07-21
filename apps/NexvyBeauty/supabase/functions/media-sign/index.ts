// media-sign — assina URLs de mídia de conversa (PII) sob demanda.
//
// ⚠️ POR QUE ISTO EXISTE (frente "guardar path, não URL", 2026-07-20):
// Os buckets de mídia de conversa nasceram `public=true`. O endpoint
// /storage/v1/object/public/<bucket>/<path> IGNORA RLS por design — logo, com
// bucket público, QUALQUER path conhecido é baixável pelo mundo, para sempre.
// A migration 20260720g fechou a ENUMERAÇÃO (dropou a policy SELECT {public}),
// mas não a confidencialidade: quem já teve o path continua com acesso vitalício.
// E o path do chat-media outbound (`<org>/<user>/<epoch>-<nome>`) não tem
// componente aleatório — seus únicos "segredos" são dois UUIDs que todo membro
// ATUAL E EX-MEMBRO da org possui.
//
// A correção é bucket privado + signed URL de TTL curto. Só que createSignedUrl
// exige SELECT sob RLS, e a 20260720g dropou exatamente essa policy nesses
// buckets. Repor a policy reabriria o `list`. Daí esta edge: assina com
// service_role (ignora RLS, mantém a enumeração fechada) e reautentica por
// conta própria — o gateway do Supabase aceita a anon key pública como
// Authorization, então verify_jwt NÃO é autenticação (ver _shared/tenant-auth).
//
// Contrato:
//   POST { items: [{ bucket, path }], ttl_seconds? }
//   200  { urls: { "<bucket>/<path>": "<signedUrl>" }, failed: { "<k>": "<motivo>" } }
// Erro por item NUNCA derruba o lote: mídia que sumiu vira `failed`, a UI
// degrada aquele balão e o resto da conversa renderiza.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { authenticateTenant } from '../_shared/tenant-auth.ts';
// Decisão de acesso mora em _shared para ter golden suite própria
// (media-access.test.ts) — um bug ali é vazamento cross-tenant de PII.
import { denyReason, normalizePath } from '../_shared/media-access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** TTL padrão. Curto o bastante para que um link vazado morra rápido, longo o
 *  bastante para cobrir a leitura de uma conversa sem re-assinar a cada scroll. */
const DEFAULT_TTL_SECONDS = 60 * 60; // 1h
const MAX_TTL_SECONDS = 60 * 60 * 6; // teto duro — nunca vira "quase público"
/** Teto de itens por request: uma página de conversa carrega ~50 mensagens. */
const MAX_ITEMS = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const auth = await authenticateTenant(req, admin, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) return json({ error: 'items_required' }, 400);
  if (items.length > MAX_ITEMS) return json({ error: `too_many_items (máx ${MAX_ITEMS})` }, 400);

  const ttl = Math.min(
    Math.max(Number(body?.ttl_seconds) || DEFAULT_TTL_SECONDS, 60),
    MAX_TTL_SECONDS,
  );

  const urls: Record<string, string> = {};
  const failed: Record<string, string> = {};

  // Assina em paralelo — uma conversa carrega dezenas de mídias e serializar
  // transformaria o scroll em espera linear.
  await Promise.all(
    items.map(async (item: any, i: number) => {
      const bucket = typeof item?.bucket === 'string' ? item.bucket : '';
      const path = normalizePath(item?.path);
      const key = `${bucket}/${path ?? `#${i}`}`;

      if (!path) {
        failed[key] = 'invalid_path';
        return;
      }
      const deny = denyReason(bucket, path, auth);
      if (deny) {
        failed[key] = deny;
        return;
      }

      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, ttl);
      if (error || !data?.signedUrl) {
        // createSignedUrl com service_role só falha se o objeto não existe —
        // validação de existência de graça.
        failed[key] = `not_found: ${error?.message ?? 'sem signed url'}`;
        return;
      }
      urls[key] = data.signedUrl;
    }),
  );

  // Log sem PII: contagens e motivos agregados, nunca o path (que carrega
  // org/conversa/nome de arquivo do cliente).
  console.log(
    `[media-sign] user=${auth.userId ?? 'service_role'} ok=${Object.keys(urls).length} ` +
      `failed=${Object.keys(failed).length} ttl=${ttl}s`,
  );

  return json({ urls, failed, ttl_seconds: ttl });
});
