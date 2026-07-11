// platform-check-whatsapp-number — verifica se um telefone EXISTE no WhatsApp,
// para o CRM de PLATAFORMA (super_admin). Paridade com `evolution-check-number`
// do V5, DESACOPLADO do tenant (SEM organization_id).
//
// Contrato: POST { phone: string }
//   → { supported: boolean, exists: boolean|null, checked_via: 'evolution'|'none' }
//
// A Cloud API (Meta) NÃO tem endpoint de verificação prévia — a checagem usa
// uma instância Evolution CONECTADA do servidor compartilhado da plataforma:
//   * Instâncias: platform_crm_evolution_instances (status='connected',
//     is_default primeiro — mesmo critério de escolha do proxy).
//   * Config: platform_settings.evolution_go_url + evolution_go_global_api_key
//     (MESMA fonte do platform-evolution-proxy; apikey efetiva = instance_token
//     da instância, fallback global key).
//   * Endpoint (Evolution API v2.3.7, instância endereçada pelo `name` no path,
//     padrão do platform-evolution-proxy): POST /chat/whatsappNumbers/{name}
//     body { numbers: [telefone] } → [{ exists, jid, number }].
//   * Testa variantes BR (com/sem 9º dígito) e para na primeira que existir.
//
// Sem instância conectada OU config ausente → { supported:false, exists:null,
// checked_via:'none' } (o front mostra "verificação indisponível").
// 🔒 NUNCA envia mensagem para verificar — só o endpoint de checagem.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { normalizePhoneBR, phoneVariantsBR } from '../_shared/phone.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CheckUnsupported {
  supported: false;
  exists: null;
  checked_via: 'none';
  detail?: string;
}

function unsupported(detail?: string): CheckUnsupported {
  return { supported: false, exists: null, checked_via: 'none', ...(detail ? { detail } : {}) };
}

/** Variantes que o provedor entende (sempre com DDI 55 — mesmo filtro do V5). */
function providerPhoneVariantsBR(phone: string): string[] {
  return phoneVariantsBR(phone).filter((v) => v.startsWith('55'));
}

function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = String(jid).match(/^(\d+)@/);
  return m ? m[1] : null;
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

    // 1) Instância Evolution conectada (is_default primeiro — critério do proxy)
    const { data: instance, error: instErr } = await supabase
      .from('platform_crm_evolution_instances')
      .select('id, name, instance_token, status')
      .eq('status', 'connected')
      .order('is_default', { ascending: false })
      .order('last_connected_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (instErr) {
      console.error('[platform-check-whatsapp-number] instance lookup error:', instErr.message);
      return json(unsupported('instance_lookup_failed'));
    }
    if (!instance?.name) {
      return json(unsupported());
    }

    // 2) Config do servidor Evolution compartilhado (MESMA fonte do proxy)
    const { data: cfg, error: cfgErr } = await supabase
      .from('platform_settings')
      .select('evolution_go_url, evolution_go_global_api_key')
      .limit(1)
      .maybeSingle();
    if (cfgErr) {
      console.error('[platform-check-whatsapp-number] platform_settings error:', cfgErr.message);
      return json(unsupported('settings_lookup_failed'));
    }
    const baseUrl = String(cfg?.evolution_go_url ?? '').replace(/\/$/, '');
    const globalKey = String(cfg?.evolution_go_global_api_key ?? '');
    const apikey = (instance.instance_token as string | null) || globalKey;
    if (!baseUrl || !apikey) {
      console.warn('[platform-check-whatsapp-number] Evolution não configurado (url/apikey ausente)');
      return json(unsupported('provider_not_configured'));
    }

    // 3) Checagem por variante (para na primeira que existir). 🔒 Só consulta —
    //    nunca envia mensagem.
    const variants = providerPhoneVariantsBR(digits);
    const checked: Array<{ number: string; exists: boolean; jid: string | null }> = [];
    let found: { number: string; jid: string | null } | null = null;
    let anySuccess = false;

    for (const v of variants) {
      try {
        const res = await fetch(
          `${baseUrl}/chat/whatsappNumbers/${encodeURIComponent(instance.name as string)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey },
            body: JSON.stringify({ numbers: [v] }),
          },
        );
        const text = await res.text();
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch { /* mantém texto cru */ }

        if (!res.ok) {
          console.error(
            '[platform-check-whatsapp-number] provider respondeu',
            res.status,
            typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200),
          );
          continue;
        }
        anySuccess = true;

        // Shapes conhecidos: [{...}] | { data: [...] } | { results: [...] }
        const arr = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.data) ? parsed.data
          : Array.isArray(parsed?.results) ? parsed.results
          : [];
        const first = arr[0] ?? {};
        const exists = !!(first.exists ?? first.isRegistered ?? first.registered);
        const jid = first.jid ?? first.wa_jid ?? null;
        checked.push({ number: v, exists, jid });
        if (exists) {
          found = { number: v, jid };
          break;
        }
      } catch (e) {
        console.error(
          '[platform-check-whatsapp-number] provider fetch error:',
          String(e).slice(0, 200),
        );
      }
    }

    // Nenhuma chamada completou (servidor fora do ar / rede) → verificação
    // indisponível, NÃO um "número não existe".
    if (!anySuccess) {
      return json(unsupported('evolution_unreachable'));
    }

    const normalizedPhone = found ? (jidToPhone(found.jid) || found.number) : null;

    return json({
      supported: true,
      exists: !!found,
      checked_via: 'evolution',
      normalized_phone: normalizedPhone,
      jid: found?.jid ?? null,
      checked_variants: checked,
      instance: { id: instance.id, name: instance.name },
    });
  } catch (e) {
    console.error('[platform-check-whatsapp-number] exception:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
