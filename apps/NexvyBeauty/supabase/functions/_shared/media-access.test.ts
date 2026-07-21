// media-access.test.ts — GOLDEN SUITE da autorização de assinatura de mídia.
//
// Prova, sem deploy e sem banco, as garantias que sustentam o bucket privado:
//   (1) tenant só assina mídia da PRÓPRIA org (o vazamento cross-tenant morre aqui);
//   (2) path de formato desconhecido é NEGADO (fail-closed), nunca atribuído a uma org;
//   (3) bucket fora da allowlist é negado, mesmo para super_admin;
//   (4) path traversal / absoluto / nulo é recusado antes de qualquer decisão;
//   (5) service_role passa (chamada interna), super_admin atravessa tenants.
// Roda: deno test supabase/functions/_shared/media-access.test.ts

import {
  BUCKET_POLICY,
  denyReason,
  normalizePath,
  orgFromChatMediaPath,
  type MediaAccessAuth,
} from './media-access.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} — esperado ${e}, veio ${a}`);
}

// UUIDs sintéticos. ORG_A é "a nossa"; ORG_B é o vizinho que não pode ser lido.
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const CONV = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

const tenantA: MediaAccessAuth = {
  organizationId: ORG_A,
  isSuperAdmin: false,
  isServiceRole: false,
};
const superAdmin: MediaAccessAuth = {
  organizationId: null,
  isSuperAdmin: true,
  isServiceRole: false,
};
const serviceRole: MediaAccessAuth = {
  organizationId: null,
  isSuperAdmin: false,
  isServiceRole: true,
};
/** Usuário autenticado sem org resolvida (perfil órfão / super_admin rebaixado). */
const orphan: MediaAccessAuth = {
  organizationId: null,
  isSuperAdmin: false,
  isServiceRole: false,
};

// Paths reais que o código de hoje escreve.
const inboundA = `whatsapp-inbound/${ORG_A}/${CONV}/wamid.ABC-foto.jpg`;
const inboundB = `whatsapp-inbound/${ORG_B}/${CONV}/wamid.ABC-foto.jpg`;
const outboundA = `${ORG_A}/${USER}/1750000000000-orcamento.pdf`;
const outboundB = `${ORG_B}/${USER}/1750000000000-orcamento.pdf`;
const crmPath = `conv/${CONV}/1750000000000-a1b2c3-foto.jpg`;

// ── orgFromChatMediaPath ────────────────────────────────────────────────────

Deno.test('orgFromChatMediaPath — formato inbound (evolution-webhook)', () => {
  eq(orgFromChatMediaPath(inboundA), ORG_A, 'org é o 2º segmento no inbound');
});

Deno.test('orgFromChatMediaPath — formato outbound (useMediaUpload)', () => {
  eq(orgFromChatMediaPath(outboundA), ORG_A, 'org é o 1º segmento no outbound');
});

Deno.test('orgFromChatMediaPath — FAIL-CLOSED em formato desconhecido', () => {
  eq(orgFromChatMediaPath('legado/foto.jpg'), null, 'prefixo não-UUID → null');
  eq(orgFromChatMediaPath('foto.jpg'), null, 'arquivo solto na raiz → null');
  eq(orgFromChatMediaPath(''), null, 'vazio → null');
  eq(orgFromChatMediaPath('whatsapp-inbound/nao-uuid/x/y.jpg'), null, 'inbound com org inválida → null');
  // Regressão do fail-closed: um path que "parece" ter org mas não é UUID
  // JAMAIS pode ser aceito — seria atribuir mídia a uma org arbitrária.
  eq(orgFromChatMediaPath('admin/config/backup.zip'), null, 'segmento não-UUID → null');
});

// ── normalizePath ───────────────────────────────────────────────────────────

Deno.test('normalizePath — recusa path hostil', () => {
  eq(normalizePath('../../etc/passwd'), null, 'traversal → null');
  eq(normalizePath(`${ORG_A}/../${ORG_B}/x.jpg`), null, 'traversal no meio → null');
  eq(normalizePath('a\\b.jpg'), null, 'backslash → null');
  eq(normalizePath('a\0b.jpg'), null, 'byte nulo → null');
  eq(normalizePath(''), null, 'vazio → null');
  eq(normalizePath(null), null, 'não-string → null');
  eq(normalizePath(123), null, 'número → null');
  eq(normalizePath('x'.repeat(1025)), null, 'acima de 1024 chars → null');
});

Deno.test('normalizePath — normaliza barra inicial sem perder o resto', () => {
  eq(normalizePath(`/${outboundA}`), outboundA, 'barra inicial removida');
  eq(normalizePath(`  ${outboundA}  `), outboundA, 'espaços aparados');
});

// ── denyReason: o coração da coisa ──────────────────────────────────────────

Deno.test('denyReason — tenant assina mídia da PRÓPRIA org', () => {
  eq(denyReason('chat-media', inboundA, tenantA), null, 'inbound da própria org: liberado');
  eq(denyReason('chat-media', outboundA, tenantA), null, 'outbound da própria org: liberado');
});

Deno.test('denyReason — tenant NÃO assina mídia de outra org (cross-tenant)', () => {
  eq(denyReason('chat-media', inboundB, tenantA), 'forbidden', 'inbound do vizinho: negado');
  eq(denyReason('chat-media', outboundB, tenantA), 'forbidden', 'outbound do vizinho: negado');
});

Deno.test('denyReason — path irreconhecível é negado, não atribuído', () => {
  eq(
    denyReason('chat-media', 'legado/foto.jpg', tenantA),
    'unrecognized_path_shape',
    'fail-closed: sem org no path, ninguém assina',
  );
});

Deno.test('denyReason — usuário sem org não assina nada de chat-media', () => {
  eq(denyReason('chat-media', outboundA, orphan), 'forbidden', 'sem organizationId: negado');
});

Deno.test('denyReason — platform-crm-media é só de super_admin', () => {
  eq(denyReason('platform-crm-media', crmPath, superAdmin), null, 'super_admin: liberado');
  eq(denyReason('platform-crm-media', crmPath, tenantA), 'forbidden', 'tenant comum: negado');
  eq(denyReason('platform-crm-media', crmPath, orphan), 'forbidden', 'sem privilégio: negado');
});

Deno.test('denyReason — inbox-media é só service_role', () => {
  eq(denyReason('inbox-media', 'x/y.bin', serviceRole), null, 'service_role: liberado');
  eq(denyReason('inbox-media', 'x/y.bin', superAdmin), 'forbidden', 'nem super_admin pelo client');
  eq(denyReason('inbox-media', 'x/y.bin', tenantA), 'forbidden', 'tenant: negado');
});

Deno.test('denyReason — bucket fora da allowlist é negado para TODOS', () => {
  for (const [label, auth] of [
    ['tenant', tenantA],
    ['super_admin', superAdmin],
  ] as const) {
    eq(
      denyReason('form-media', 'qualquer/coisa.jpg', auth),
      'bucket_not_allowed',
      `bucket não listado negado para ${label}`,
    );
  }
  // service_role também não fura a allowlist: o gate de bucket vem ANTES do
  // atalho de confiança interna.
  eq(
    denyReason('form-media', 'qualquer/coisa.jpg', serviceRole),
    'bucket_not_allowed',
    'nem service_role assina bucket fora da lista',
  );
  eq(denyReason('', outboundA, tenantA), 'bucket_not_allowed', 'bucket vazio: negado');
});

Deno.test('denyReason — super_admin atravessa tenants em chat-media', () => {
  eq(denyReason('chat-media', inboundB, superAdmin), null, 'suporte enxerga qualquer org');
});

Deno.test('denyReason — service_role passa em todos os buckets da allowlist', () => {
  for (const bucket of Object.keys(BUCKET_POLICY)) {
    eq(denyReason(bucket, `${ORG_A}/${USER}/x.jpg`, serviceRole), null, `service_role em ${bucket}`);
  }
});

Deno.test('BUCKET_POLICY — os 3 buckets da frente estão cobertos e nada mais', () => {
  eq(
    Object.keys(BUCKET_POLICY).sort(),
    ['chat-media', 'inbox-media', 'platform-crm-media'],
    'allowlist exata — crescer a lista exige decisão consciente',
  );
});
