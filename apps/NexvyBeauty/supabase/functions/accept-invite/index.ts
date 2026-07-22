// accept-invite — cadastro-e-aceite de convite de equipe, 100% server-side.
//
// Fecha o exploit do accept_invitation (takeover cross-tenant): o cliente NÃO faz
// mais signUp + accept_invitation direto. Esta Edge (service_role, verify_jwt=false)
// valida o convite pendente + e-mail, cria o usuário via admin API (email_confirm:true
// — a posse do token de 64 hex prova a caixa de e-mail) e faz o vínculo ATÔMICO via
// accept_invitation_service (RPC restrita a service_role). O front então faz
// signInWithPassword para obter sessão. Independe do toggle mailer_autoconfirm.
//
// NÃO é signup aberto: só cria conta quando existe um convite pendente cujo e-mail bate.
// Parte B do PACOTE (migration A + Edge B + diff AcceptInvite.tsx C) — deploy junto.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const fullName = String(body?.full_name ?? body?.fullName ?? '').trim();

    if (token.length < 32 || !email || password.length < 6) {
      return json({ error: 'invalid_input' }, 400);
    }

    // 1) valida convite (service_role ignora RLS)
    const { data: inv } = await admin
      .from('team_invitations')
      .select('id,email,status,expires_at,organization_id')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!inv) return json({ error: 'invalid_or_expired' }, 400);

    // 2) e-mail de cadastro TEM que ser o e-mail convidado
    if (email !== String(inv.email).toLowerCase()) {
      return json({ error: 'email_mismatch' }, 403);
    }

    // 3) cria o usuário (email_confirm:true — posse do token prova a caixa de e-mail)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split('@')[0] },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      if (/already.*registered|already exists|duplicate|email_exists/i.test(msg)) {
        return json({ error: 'already_registered' }, 409);
      }
      return json({ error: 'signup_failed', detail: msg }, 400);
    }

    // 4) vínculo ATÔMICO via RPC restrita a service_role
    const { data: bound, error: bindErr } = await admin.rpc('accept_invitation_service', {
      p_token: token,
      p_user_id: created.user.id,
      p_email: email,
    });
    if (bindErr || bound !== true) {
      // rollback: remove a conta recém-criada (sem dados) para não deixar órfã
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return json({ error: 'bind_failed', detail: bindErr?.message ?? null }, 400);
    }

    return json({ success: true, user_id: created.user.id });
  } catch (e) {
    console.error('[accept-invite] error', e);
    return json({ error: 'internal', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
