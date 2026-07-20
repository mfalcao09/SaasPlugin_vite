// Fecha o onboarding: a dona cria a SENHA dela no fim do wizard e entra já
// logada na conta do próprio espaço.
//
// Por que existe: o acesso vinha só pelo action link do e-mail (uso único, que
// morre em scanner de antispam) — quem terminava o wizard ficava sem senha e,
// se o navegador tivesse outra sessão (ex.: super_admin), caía no painel da
// conta errada.
//
// Prova de posse = TOKEN do link de implantação (32 bytes aleatórios) + o
// session_token da sessão corrente do wizard. Mesmo nível de confiança de um
// magic link — e o token é QUEIMADO ao definir a senha (revoked_at), então o
// link não abre nem troca senha de novo.
//
// ⚠️ Pública por design (a dona ainda não tem sessão): precisa de
// verify_jwt=false no config.toml — sem a entrada lá, um redeploy religa o JWT
// e mata o fluxo silenciosamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MIN_PASSWORD = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? '');
    const sessionToken = String(body.session_token ?? '');
    const password = String(body.password ?? '');

    if (token.length < 20) return json({ error: 'invalid_token' }, 400);
    if (password.length < MIN_PASSWORD) return json({ error: 'weak_password' }, 400);

    const { data: sub, error: subErr } = await admin
      .from('onboarding_submissions')
      .select('id, organization_id, session_token, revoked_at, expires_at')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle();
    if (subErr) return json({ error: 'lookup_failed' }, 500);
    if (!sub) return json({ error: 'invalid_token' }, 404);
    if (sub.revoked_at) return json({ error: 'link_revoked' }, 410);
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) return json({ error: 'expired_token' }, 410);
    // Sessão corrente do wizard: um token copiado sem a sessão ativa não troca
    // senha. O dono legítimo sempre reassume pelo botão "Usar neste navegador".
    if (!sub.session_token || sub.session_token !== sessionToken) {
      return json({ error: 'session_mismatch' }, 403);
    }

    const { data: org } = await admin
      .from('organizations')
      .select('id, cakto_customer_email')
      .eq('id', sub.organization_id)
      .maybeSingle();
    const email = org?.cakto_customer_email ?? null;
    if (!email) return json({ error: 'owner_email_not_found' }, 404);

    // generateLink devolve o usuário do e-mail sem paginar listUsers (mesmo
    // truque do provisionamento). O link em si é descartado.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    const userId = (linkData as any)?.user?.id ?? null;
    if (linkErr || !userId) {
      console.error('[onboarding-set-password] usuário não encontrado:', linkErr?.message);
      return json({ error: 'user_not_found' }, 404);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error('[onboarding-set-password] updateUser falhou:', updErr.message);
      return json({ error: 'password_update_failed' }, 500);
    }

    // Token queimado: o link de implantação não abre nem troca senha de novo.
    await admin.from('onboarding_submissions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sub.id);

    console.log(`[onboarding-set-password] senha definida para org=${sub.organization_id}`);
    return json({ ok: true, email });
  } catch (e: any) {
    console.error('[onboarding-set-password] erro:', e?.message ?? String(e));
    return json({ error: 'internal_error' }, 500);
  }
});
