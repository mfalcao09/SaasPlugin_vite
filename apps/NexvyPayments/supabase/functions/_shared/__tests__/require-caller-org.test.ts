// _shared/__tests__/require-caller-org.test.ts
//
// Suíte `deno test` PURA (mocks, zero rede) para o helper anti-IDOR
// `requireCallerOrg`. Cobre os casos binários do spec do Entregável A2:
//   - body com organization_id de OUTRA org -> 403 (cross-org)
//   - sem JWT (sem header Authorization)    -> 401
//   - JWT válido                            -> retorna o org do TOKEN (não o do body)
//   - service_role + actorUserId            -> org do actorUserId
// Extras (robustez do mesmo contrato): token inválido -> 401; caller sem org -> 403;
// falha de infra na consulta profiles -> 503; body sem organization_id -> aceita.
//
// Todos os "JWTs" são fakes: o mock `getClaims` devolve claims decodificados,
// nunca há validação criptográfica real nem chamada de rede.

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { requireCallerOrg } from '../require-caller-org.ts';

// ---------------------------------------------------------------------------
// Fixtures sintéticas
// ---------------------------------------------------------------------------
const ORG_TOKEN = 'org-token-real-1111'; // org REAL do caller (vem de profiles)
const ORG_OTHER = 'org-outra-9999'; // org de outro tenant (tentativa IDOR)
const USER_ID = 'user-123';
const ACTOR_ID = 'actor-456';
const FAKE_JWT = 'header.payloadfake.sig'; // string qualquer; o mock ignora o conteúdo
const SERVICE_ROLE_KEY = 'svc-role-key-fake';

/**
 * Constrói um mock do client Supabase (`supabaseAdmin`) com injeção total:
 *  - `auth.getClaims(token)` -> claims fake mapeados por token (ou erro).
 *  - `from('profiles').select().eq().maybeSingle()` -> profile fake / erro.
 * Zero rede: tudo resolvido em memória.
 */
function makeSupabaseMock(cfg: {
  // token -> claims (sub); ausente => getClaims retorna erro (token inválido)
  claimsByToken?: Record<string, { sub: string; email?: string }>;
  // userId -> organization_id devolvido por profiles
  orgByUser?: Record<string, string | null>;
  // se true, a query profiles retorna { error }
  profilesError?: boolean;
} = {}) {
  const calls = { getClaims: 0, profiles: 0, lastProfileId: null as string | null };
  return {
    calls,
    auth: {
      // deno-lint-ignore require-await
      getClaims: async (token: string) => {
        calls.getClaims++;
        const claims = cfg.claimsByToken?.[token];
        if (!claims) {
          return { data: null, error: { message: 'invalid token' } };
        }
        return { data: { claims }, error: null };
      },
    },
    from(table: string) {
      assertEquals(table, 'profiles', 'org real deve ser resolvido via profiles');
      let filteredId: string | null = null;
      const builder: any = {
        select: (_cols: string) => builder,
        eq: (_col: string, val: string) => {
          filteredId = val;
          return builder;
        },
        // deno-lint-ignore require-await
        maybeSingle: async () => {
          calls.profiles++;
          calls.lastProfileId = filteredId;
          if (cfg.profilesError) {
            return { data: null, error: { message: 'upstream 502' } };
          }
          const org = cfg.orgByUser?.[filteredId ?? ''];
          if (org === undefined) return { data: null, error: null }; // sem perfil
          return { data: { organization_id: org }, error: null };
        },
      };
      return builder;
    },
  };
}

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request('https://edge.local/charge', { method: 'POST', headers });
}

async function readErrorBody(res: Response): Promise<{ error?: string }> {
  return await res.json();
}

// ---------------------------------------------------------------------------
// CASO 1 (spec): body com organization_id de OUTRA org -> 403
// ---------------------------------------------------------------------------
Deno.test('cross-org: body.organization_id de outro tenant -> 403 e nao vaza org', async () => {
  const supabase = makeSupabaseMock({
    claimsByToken: { [FAKE_JWT]: { sub: USER_ID } },
    orgByUser: { [USER_ID]: ORG_TOKEN },
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: { organization_id: ORG_OTHER } }, // tentativa IDOR explícita
  );

  assertEquals(res.organizationId, null);
  assertEquals(res.userId, null);
  assert(res.errorResponse instanceof Response);
  assertEquals(res.errorResponse!.status, 403);
  assertEquals((await readErrorBody(res.errorResponse!)).error, 'Forbidden');
  // Confirma que o org real foi resolvido do banco (não do body).
  assertEquals(supabase.calls.lastProfileId, USER_ID);
});

// ---------------------------------------------------------------------------
// CASO 2 (spec): sem JWT (sem header Authorization) -> 401
// ---------------------------------------------------------------------------
Deno.test('sem Authorization header -> 401 e nao consulta o banco', async () => {
  const supabase = makeSupabaseMock();
  const res = await requireCallerOrg(reqWith({}), supabase, {
    body: { organization_id: ORG_OTHER },
  });

  assertEquals(res.errorResponse!.status, 401);
  assertEquals((await readErrorBody(res.errorResponse!)).error, 'Unauthorized');
  assertEquals(res.organizationId, null);
  // Curto-circuito antes de qualquer round-trip.
  assertEquals(supabase.calls.getClaims, 0);
  assertEquals(supabase.calls.profiles, 0);
});

// ---------------------------------------------------------------------------
// CASO 3 (spec): JWT válido -> retorna o org do TOKEN (não o do body)
// ---------------------------------------------------------------------------
Deno.test('JWT valido -> retorna org do TOKEN mesmo com body divergente ausente', async () => {
  const supabase = makeSupabaseMock({
    claimsByToken: { [FAKE_JWT]: { sub: USER_ID } },
    orgByUser: { [USER_ID]: ORG_TOKEN },
  });
  // Body SEM organization_id: aceita e devolve o org do token.
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: {} },
  );

  assertEquals(res.errorResponse, null);
  assertEquals(res.userId, USER_ID);
  assertEquals(res.organizationId, ORG_TOKEN);
});

Deno.test('JWT valido + body.organization_id IGUAL ao do token -> ok, org do token', async () => {
  const supabase = makeSupabaseMock({
    claimsByToken: { [FAKE_JWT]: { sub: USER_ID } },
    orgByUser: { [USER_ID]: ORG_TOKEN },
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: { organization_id: ORG_TOKEN } },
  );

  assertEquals(res.errorResponse, null);
  assertEquals(res.organizationId, ORG_TOKEN); // sempre o resolvido do banco
});

// ---------------------------------------------------------------------------
// CASO 4 (bônus obrigatório): service_role + actorUserId -> org do actorUserId
// ---------------------------------------------------------------------------
Deno.test('service_role + actorUserId -> resolve org do actorUserId (nao chama getClaims)', async () => {
  const supabase = makeSupabaseMock({
    orgByUser: { [ACTOR_ID]: ORG_TOKEN, [USER_ID]: ORG_OTHER },
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
    supabase,
    { serviceRoleKey: SERVICE_ROLE_KEY, body: { actorUserId: ACTOR_ID } },
  );

  assertEquals(res.errorResponse, null);
  assertEquals(res.userId, ACTOR_ID);
  assertEquals(res.organizationId, ORG_TOKEN); // org do ACTOR, não do USER_ID
  // service_role bypassa o JWT: getClaims nunca é chamado.
  assertEquals(supabase.calls.getClaims, 0);
  assertEquals(supabase.calls.lastProfileId, ACTOR_ID);
});

Deno.test('service_role aceita fallback created_by quando actorUserId ausente', async () => {
  const supabase = makeSupabaseMock({
    orgByUser: { [ACTOR_ID]: ORG_TOKEN },
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
    supabase,
    { serviceRoleKey: SERVICE_ROLE_KEY, body: { created_by: ACTOR_ID } },
  );
  assertEquals(res.errorResponse, null);
  assertEquals(res.organizationId, ORG_TOKEN);
});

Deno.test('service_role SEM actorUserId/created_by -> 401 (nao ha em nome de quem atuar)', async () => {
  const supabase = makeSupabaseMock();
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
    supabase,
    { serviceRoleKey: SERVICE_ROLE_KEY, body: {} },
  );
  assertEquals(res.errorResponse!.status, 401);
  assertEquals((await readErrorBody(res.errorResponse!)).error, 'Invalid token');
});

// ---------------------------------------------------------------------------
// Extras de robustez (mesmo contrato do molde)
// ---------------------------------------------------------------------------
Deno.test('JWT invalido (getClaims falha) -> 401', async () => {
  const supabase = makeSupabaseMock({ orgByUser: { [USER_ID]: ORG_TOKEN } }); // sem claimsByToken
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: {} },
  );
  assertEquals(res.errorResponse!.status, 401);
  assertEquals((await readErrorBody(res.errorResponse!)).error, 'Invalid token');
});

Deno.test('caller autenticado mas sem organizacao -> 403', async () => {
  const supabase = makeSupabaseMock({
    claimsByToken: { [FAKE_JWT]: { sub: USER_ID } },
    orgByUser: { [USER_ID]: null }, // profile existe, org nulo
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: {} },
  );
  assertEquals(res.errorResponse!.status, 403);
  assertEquals((await readErrorBody(res.errorResponse!)).error, 'User has no organization');
});

Deno.test('falha de infra na consulta profiles -> 503', async () => {
  const supabase = makeSupabaseMock({
    claimsByToken: { [FAKE_JWT]: { sub: USER_ID } },
    profilesError: true,
  });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${FAKE_JWT}` }),
    supabase,
    { body: {} },
  );
  assertEquals(res.errorResponse!.status, 503);
});

Deno.test('token que casa serviceRoleKey mas SEM serviceRoleKey configurada -> tratado como JWT', async () => {
  // Sem opts.serviceRoleKey, o token é tratado como JWT humano -> getClaims falha -> 401.
  const supabase = makeSupabaseMock({ orgByUser: { [USER_ID]: ORG_TOKEN } });
  const res = await requireCallerOrg(
    reqWith({ Authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
    supabase,
    { body: { actorUserId: USER_ID } }, // sem serviceRoleKey nas opts
  );
  assertEquals(res.errorResponse!.status, 401);
  assertEquals(supabase.calls.getClaims, 1);
});
