// platform-check-whatsapp-number — verifica se um telefone EXISTE no WhatsApp,
// CRM de PLATAFORMA (super_admin). Motor: Z-API (sanitização A+B 2026-09-01).
//
// Contrato: POST { phone: string }
//   → { supported: boolean, exists: boolean|null, checked_via: 'zapi'|'none' }
//
// 🔒 NUNCA envia mensagem — só phone-exists.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { normalizePhoneBR, phoneVariantsBR } from '../_shared/phone.ts';
import {
  extractLidFromPhoneExists,
  zapiPhoneExists,
} from '../_shared/zapi-client.ts';
import {
  instanceLooksZapi,
  loadPlatformQrProviderConfig,
  zapiCredsFromInstance,
} from '../_shared/platform-qr-provider.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unsupported(detail?: string) {
  return { supported: false, exists: null, checked_via: 'none' as const, ...(detail ? { detail } : {}) };
}

function providerPhoneVariantsBR(phone: string): string[] {
  return phoneVariantsBR(phone).filter((v) => v.startsWith('55'));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceRoleKey, body);
    if (errorResponse) return errorResponse;

    const phone = String(body?.phone ?? '').trim();
    if (!phone) return json({ error: 'phone is required' }, 400);

    const digits = phone.replace(/\D/g, '');
    const canonical = normalizePhoneBR(digits);
    if (!canonical) {
      return json({ error: 'invalid_phone', detail: `telefone inválido: '${phone}'` }, 400);
    }

    const qrCfg = await loadPlatformQrProviderConfig(supabase);
    if (qrCfg.provider !== 'zapi' || !qrCfg.zapi) {
      return json(unsupported('zapi_not_configured'));
    }

    const { data: instance, error: instErr } = await supabase
      .from('platform_crm_wa_qr_instances')
      .select('id, name, instance_id, instance_token, status, metadata')
      .eq('status', 'connected')
      .order('is_default', { ascending: false })
      .order('last_connected_at', { ascending: false, nullsFirst: false })
      .limit(5);

    if (instErr) {
      console.error('[platform-check-whatsapp-number] instance lookup error:', instErr.message);
      return json(unsupported('instance_lookup_failed'));
    }

    const zapiInst = (instance ?? []).find((r: any) => instanceLooksZapi(r)) ?? (instance ?? [])[0];
    if (!zapiInst) return json(unsupported());

    const creds = zapiCredsFromInstance(zapiInst);
    if (!creds) return json(unsupported('instance_missing_zapi_creds'));

    const variants = providerPhoneVariantsBR(digits);
    const checked: Array<{ number: string; exists: boolean; lid: string | null }> = [];
    let found: { number: string; lid: string | null } | null = null;
    let anySuccess = false;

    for (const v of variants) {
      try {
        const res = await zapiPhoneExists(qrCfg.zapi, creds, v);
        if (!res.ok) {
          console.error('[platform-check-whatsapp-number] zapi phone-exists', res.status, String(res.message ?? '').slice(0, 160));
          continue;
        }
        anySuccess = true;
        const bodyObj = res.body && typeof res.body === 'object' ? res.body as Record<string, unknown> : {};
        const exists = bodyObj.exists === true || bodyObj.exists === 'true' ||
          Boolean(extractLidFromPhoneExists(res.body)) ||
          String(bodyObj.phone ?? '').length > 0;
        const lid = extractLidFromPhoneExists(res.body) || null;
        // Z-API às vezes devolve só { exists: true } / lid
        const reallyExists = exists || Boolean(lid) || bodyObj.exists === true;
        checked.push({ number: v, exists: reallyExists, lid });
        if (reallyExists) {
          found = { number: v, lid };
          break;
        }
      } catch (e) {
        console.error('[platform-check-whatsapp-number] fetch error:', String(e).slice(0, 200));
      }
    }

    if (!anySuccess) {
      return json(unsupported('zapi_unreachable'));
    }

    return json({
      supported: true,
      exists: !!found,
      checked_via: 'zapi',
      normalized_phone: found?.number ?? null,
      jid: found?.lid ?? null,
      checked_variants: checked,
      instance: { id: zapiInst.id, name: zapiInst.name },
    });
  } catch (e) {
    console.error('[platform-check-whatsapp-number] exception:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
