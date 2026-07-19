// platform-meta-whatsapp-register — registra (ou RE-registra) um número na Cloud API.
//
// POR QUE ISTO EXISTE: quando a Meta aprova um novo "display name" para o número, o nome
// NÃO passa a valer sozinho — o número precisa ser registrado de novo na Cloud API. Até lá
// o WhatsApp Manager mostra o número como "Conectado" mas com ⚠️, e a cliente continua
// vendo o nome ANTIGO. Não há botão confiável para isso na UI, e nenhuma outra edge cobria
// essa operação — daí esta função. (Descoberto em 2026-07-19 ao trocar NEXVY_VENDAS →
// "NexvyBeauty - Comercial" no número de vendas.)
//
// O token de acesso NÃO é passado pelo chamador: sai de `access_token_encrypted` da própria
// conexão (AES-GCM, mesma chave das irmãs). O escopo necessário é `whatsapp_business_management`
// — o mesmo que a `-templates-sync` já usa, então uma conexão que sincroniza template registra.
//
// PIN: é o código de 6 dígitos da verificação em duas etapas do número. `register` exige ele.
// Se o PIN foi perdido, mande `set_pin: true` que a função define o `pin` informado ANTES de
// registrar (POST /{phone_number_id} { pin }) — é o caminho suportado para recuperar o acesso.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface PhoneInfo {
  verified_name?: string;
  display_phone_number?: string;
  status?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const { connection_id, pin, set_pin } = body ?? {};
  if (!connection_id) return json({ error: 'connection_id required' }, 400);
  // A Meta só aceita PIN numérico de 6 dígitos; validar aqui evita gastar uma chamada.
  if (!pin || !/^\d{6}$/.test(String(pin))) {
    return json({ error: 'pin required (exatamente 6 digitos numericos)' }, 400);
  }

  const { data: conn, error } = await sb
    .from('platform_crm_whatsapp_meta_connections')
    .select('id, display_name, phone_number, phone_number_id, waba_id, access_token_encrypted, status')
    .eq('id', connection_id)
    .maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);
  if (!conn.access_token_encrypted) return json({ error: 'connection sem access_token' }, 400);

  const accessToken = await decryptSecret(conn.access_token_encrypted);
  const pid = conn.phone_number_id;
  const steps: Record<string, unknown> = {};

  // Estado ANTES — serve de prova do antes/depois (o verified_name é o que a cliente vê).
  try {
    steps.before = await graphFetch<PhoneInfo>(
      `/${pid}?fields=verified_name,display_phone_number,status,quality_rating,code_verification_status`,
      accessToken,
    );
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'falha lendo o numero na Meta', detail: ge.message, status: ge.status }, 502);
  }

  // (opcional) Redefine o PIN da verificação em duas etapas antes de registrar.
  if (set_pin) {
    try {
      steps.set_pin = await graphFetch(`/${pid}`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ pin: String(pin) }),
      });
    } catch (e) {
      const ge = e as GraphError;
      return json({ error: 'falha definindo o PIN', detail: ge.message, status: ge.status, steps }, 502);
    }
  }

  // O registro em si — é o que aplica o display name aprovado.
  try {
    steps.register = await graphFetch(`/${pid}/register`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(pin) }),
    });
  } catch (e) {
    const ge = e as GraphError;
    // PIN incorreto é o erro mais comum aqui — devolve dica acionável em vez do erro cru.
    const dica = /pin/i.test(ge.message)
      ? 'PIN incorreto. Reenvie com set_pin=true para redefinir o PIN antes de registrar.'
      : undefined;
    return json({ error: 'falha no register', detail: ge.message, status: ge.status, dica, steps }, 502);
  }

  // Estado DEPOIS — é aqui que se prova que o nome novo valeu.
  try {
    steps.after = await graphFetch<PhoneInfo>(
      `/${pid}?fields=verified_name,display_phone_number,status,quality_rating,code_verification_status`,
      accessToken,
    );
  } catch { /* registro já foi; leitura de confirmação é best-effort */ }

  // Espelha o nome novo no nosso banco para a UI do CRM não ficar mostrando o antigo.
  const novoNome = (steps.after as PhoneInfo | undefined)?.verified_name;
  if (novoNome && novoNome !== conn.display_name) {
    await sb
      .from('platform_crm_whatsapp_meta_connections')
      .update({ business_account_name: novoNome, updated_at: new Date().toISOString() })
      .eq('id', conn.id);
    steps.db_sincronizado = novoNome;
  }

  return json({
    ok: true,
    connection: { id: conn.id, phone_number: conn.phone_number, phone_number_id: pid, waba_id: conn.waba_id },
    steps,
  });
});
