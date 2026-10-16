import { createClient } from 'npm:@supabase/supabase-js@2';

const PRODUCT_ID = '74da87e0-c6f2-11f1-9559-e7839c973a23';
const EVENTS = new Set(['order_approved', 'order_refunded', 'chargeback']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function equalHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{40}$/i.test(a) || !/^[a-f0-9]{40}$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < 40; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha1Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('KIWIFY_LT_WEBHOOK_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !supabaseUrl || !serviceRoleKey) return json({ error: 'not_configured' }, 503);

  const signature = new URL(req.url).searchParams.get('signature') ?? '';
  if (!/^[a-f0-9]{40}$/i.test(signature)) return json({ error: 'invalid_signature' }, 401);
  const raw = await req.text();
  if (raw.length > 128_000) return json({ error: 'payload_too_large' }, 413);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('invalid');
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // A Kiwify documenta HMAC sobre JSON.stringify(body). Aceita o corpo cru
  // também, pois proxies podem preservar bytes sem reserialização.
  const signedRaw = await hmacSha1Hex(secret, raw);
  const signedJson = await hmacSha1Hex(secret, JSON.stringify(payload));
  if (!equalHex(signature, signedRaw) && !equalHex(signature, signedJson)) {
    return json({ error: 'invalid_signature' }, 401);
  }

  const product = payload.Product as Record<string, unknown> | undefined;
  if (product?.product_id !== PRODUCT_ID) return json({ error: 'unexpected_product' }, 403);
  const event = String(payload.webhook_event_type ?? '').toLowerCase();
  if (!EVENTS.has(event)) return json({ ignored: true, event }, 200);
  if (typeof payload.order_id !== 'string' || !payload.order_id.trim()) {
    return json({ error: 'missing_order_id' }, 422);
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('platform_crm_ingest_beauty_lt_order', { p_payload: payload });
  if (error) {
    // Sem payload/PII no log. Não responde 2xx: a Kiwify pode tentar novamente.
    console.error('kiwify-beauty-lt-webhook ingest_failed', {
      event,
      order_id: payload.order_id,
      code: error.code,
      message: error.message,
    });
    return json({ error: 'ingest_failed' }, 500);
  }
  return json({ received: true, order: data }, 200);
});
