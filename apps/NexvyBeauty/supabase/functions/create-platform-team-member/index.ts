// create-platform-team-member
//
// Provisiona um usuário da EQUIPE do CRM de PLATAFORMA (super_admin), PRODUCT-SCOPED
// e SEM organization_id. É a edge que faltava para a tela "Equipes" do gestao: o
// hook `useCreatePlatformCrmTeamMember` (src/components/superadmin/crm/data/
// usePlatformCrmTeam.ts) invoca EXATAMENTE este nome via `supabase.functions.invoke`.
//
// Diferença essencial em relação a `create-team-member` / `create-organization-admin`
// (que são ORG/TENANT-scoped): aqui NÃO se grava `profiles.organization_id`, não se
// usa `sector_members`/`evolution_instances`/`initialize_user_permissions` do tenant.
// O universo é `platform_crm_*` (super_admin-only por RLS), então o gate super_admin
// é reaplicado em código porque o edge roda com SERVICE_ROLE.
//
// 🔒 Seção 11 (segurança SaaS): a senha só transita server-side; NUNCA é logada nem
//    devolvida. Provisionamento é 100% server-side (service-role).
//
// Tabelas gravadas (todas verificadas no proj fzhlbwhdejumkyqosuvq em 2026-07-12):
//   - auth.users                              (admin.auth.admin.createUser)
//   - profiles                                (upsert; SEM organization_id)
//   - user_roles                              (delete + insert; UNIQUE user_id,role)
//   - platform_crm_user_product_assignments   (upsert; UNIQUE user_id,product_id) [quando product_id != null]
//   - platform_crm_sector_members             (upsert; UNIQUE sector_id,user_id)  [quando sector_ids]
//   - platform_crm_squad_members              (upsert; UNIQUE squad_id,user_id)   [quando squad_id != null]
//
// NOTA sobre `profiles` (verificado 2026-07-12): NÃO há trigger `handle_new_user`
// em `auth.users` neste projeto, portanto a linha de profile precisa ser criada
// aqui explicitamente. Usamos `upsert(onConflict:id)` — cria quando ausente e
// atualiza caso já exista (robusto a ambos os cenários). `profiles.full_name` e
// `profiles.email` são NOT NULL; `organization_id` é nullable.
//
// Contrato de resposta consumido pelo hook: { success:true, user_id } em caso de
// sucesso; { error:string } (HTTP 200) em erro de negócio/validação — 200 é
// proposital: o supabase-js só expõe o corpo da resposta em status 2xx, então
// devolver 4xx faria o usuário ver a mensagem genérica "non-2xx status code" em
// vez do motivo real (ex.: e-mail já existe). Erros de AUTH (401/403/503) vêm do
// helper compartilhado e mantêm o status HTTP padrão.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

type AppRole = 'seller' | 'manager' | 'admin' | 'super_admin';
const ALLOWED_ROLES: AppRole[] = ['seller', 'manager', 'admin', 'super_admin'];

interface CreatePlatformCrmTeamMemberInput {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  recovery_whatsapp?: string;
  /** Produto ativo (effectiveProductId). null = "Todos os produtos" (sem atribuição). */
  product_id: string | null;
  monthly_goal?: number | null;
  sector_ids?: string[];
  squad_id?: string | null;
  avatar_url?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = (await req.json().catch(() => ({}))) as Partial<CreatePlatformCrmTeamMemberInput>;

  // 1) Gate super_admin — mesma fonte de verdade do RLS (user_roles), reaplicada
  //    porque o edge roda com service-role. Retorna também o caller (assigned_by).
  const { user: caller, errorResponse } = await authenticatePlatformAgent(
    req,
    admin,
    serviceRoleKey,
    body,
  );
  if (errorResponse) return errorResponse;

  // 2) Validação server-side (defesa; o dialog também valida no client).
  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  const fullName = (body.full_name ?? '').trim();
  const role = body.role as AppRole;

  if (!email || !password || !fullName || !role) {
    return json({ error: 'Campos obrigatórios ausentes (nome, email, senha, perfil).' });
  }
  if (password.length < 6) {
    return json({ error: 'Senha mínima de 6 caracteres.' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return json({ error: `Perfil inválido: ${String(role)}.` });
  }

  // 3) Cria a identidade no Auth (service-role). ⚠️ Seção 11: senha nunca logada.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created?.user) {
    const raw = createErr?.message ?? '';
    const alreadyExists =
      /already been registered|already registered|already exists|duplicate/i.test(raw);
    // Log sem PII sensível e SEM senha.
    console.error('[create-platform-team-member] createUser falhou:', raw);
    return json({
      error: alreadyExists
        ? 'Já existe um usuário com este e-mail.'
        : raw || 'Falha ao criar usuário no Auth.',
    });
  }

  const userId = created.user.id;

  // 4) Perfil — SEM organization_id (usuário é da plataforma, não de tenant).
  //    upsert porque não há trigger handle_new_user neste projeto (ver cabeçalho).
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      email,
      avatar_url: body.avatar_url ?? null,
      recovery_whatsapp: body.recovery_whatsapp ?? null,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (profileErr) {
    // Rollback: remove a identidade órfã para não travar o retry pelo mesmo e-mail.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error('[create-platform-team-member] profiles upsert falhou:', profileErr.message);
    return json({ error: `Falha ao gravar perfil: ${profileErr.message}` });
  }

  // 5) Papel — substitui o default (delete + insert; UNIQUE (user_id, role)).
  await admin.from('user_roles').delete().eq('user_id', userId);
  const { error: roleErr } = await admin.from('user_roles').insert({ user_id: userId, role });
  if (roleErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error('[create-platform-team-member] user_roles insert falhou:', roleErr.message);
    return json({ error: `Falha ao gravar papel: ${roleErr.message}` });
  }

  // 6) Enriquecimento (não-crítico): produto, setores e squad. Falhas aqui NÃO
  //    derrubam o usuário (já tem perfil+papel) — viram warnings honestos no
  //    retorno + log (Seção 5: nunca silenciar erro).
  const warnings: string[] = [];

  // 6a) Atribuição de produto (product-scoped) — só quando há produto concreto.
  if (body.product_id) {
    const mg = body.monthly_goal;
    const monthlyGoal =
      mg === undefined || mg === null || Number.isNaN(mg) ? null : mg;
    const { error: paErr } = await admin
      .from('platform_crm_user_product_assignments')
      .upsert(
        {
          user_id: userId,
          product_id: body.product_id,
          assigned_by: caller?.id ?? null,
          monthly_goal: monthlyGoal,
        },
        { onConflict: 'user_id,product_id' },
      );
    if (paErr) warnings.push(`Atribuição de produto falhou: ${paErr.message}`);
  }

  // 6b) Setores.
  const sectorIds = Array.isArray(body.sector_ids) ? body.sector_ids.filter(Boolean) : [];
  if (sectorIds.length > 0) {
    const { error: secErr } = await admin.from('platform_crm_sector_members').upsert(
      sectorIds.map((sid) => ({ sector_id: sid, user_id: userId })),
      { onConflict: 'sector_id,user_id' },
    );
    if (secErr) warnings.push(`Vínculo de setores falhou: ${secErr.message}`);
  }

  // 6c) Squad.
  if (body.squad_id) {
    const { error: sqErr } = await admin.from('platform_crm_squad_members').upsert(
      { squad_id: body.squad_id, user_id: userId, role: 'member' },
      { onConflict: 'squad_id,user_id' },
    );
    if (sqErr) warnings.push(`Vínculo de squad falhou: ${sqErr.message}`);
  }

  if (warnings.length > 0) {
    console.warn('[create-platform-team-member] concluído com warnings:', warnings.join(' | '));
  }

  return json({ success: true, user_id: userId, ...(warnings.length ? { warnings } : {}) });
});
