// _shared/media-access.ts
//
// Decisão de ACESSO a objetos de mídia de conversa — funções PURAS, extraídas
// da edge `media-sign` para poderem ser provadas sem deploy e sem banco.
//
// ⚠️ Um bug aqui é vazamento cross-tenant de PII de cliente final: é a mesma
// classe de falha que a frente inteira existe para fechar. Por isso a lógica
// mora fora do handler HTTP e tem golden suite (media-access.test.ts).

export type BucketPolicy = 'super_admin' | 'org_scoped' | 'service_role';

/** Allowlist EXPLÍCITA. Bucket fora daqui é negado — nunca assinamos por default. */
export const BUCKET_POLICY: Record<string, BucketPolicy> = {
  // CRM da plataforma: single-org, operado só por super_admin.
  'platform-crm-media': 'super_admin',
  // Mídia de WhatsApp do tenant: PII de cliente final, escopo por org no path.
  'chat-media': 'org_scoped',
  // Inbox server-side: hoje sem consumidor no client (0 objetos).
  'inbox-media': 'service_role',
};

export interface MediaAccessAuth {
  organizationId: string | null;
  isSuperAdmin: boolean;
  isServiceRole: boolean;
}

export type DenyReason =
  | 'bucket_not_allowed'
  | 'forbidden'
  | 'unrecognized_path_shape';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extrai a organization_id de um path do bucket `chat-media`.
 *
 * FAIL-CLOSED por decisão: formato desconhecido devolve null e o item é negado.
 * Um path malformado NUNCA pode "cair" numa org por acidente — preferimos uma
 * mídia que não renderiza a uma mídia entregue ao tenant errado.
 *
 * Formatos gravados pelo código atual:
 *   whatsapp-inbound/<orgId>/<conversationId>/<arquivo>   (evolution-webhook:801)
 *   <orgId>/<userId>/<epoch>-<nome>.<ext>                 (useMediaUpload.ts:109)
 *
 * TODO(marcelo): confirmar contra os paths REAIS do bucket quando o MCP do
 * Supabase voltar — este mapa cobre o que o código de HOJE escreve, mas o
 * bucket tem histórico e pode conter formatos de versões anteriores que já não
 * aparecem no repo. Formato não listado deixa de renderizar (falha VISÍVEL, não
 * silenciosa) assim que o bucket virar privado.
 */
export function orgFromChatMediaPath(path: string): string | null {
  const seg = path.split('/').filter(Boolean);
  if (seg.length >= 3 && seg[0] === 'whatsapp-inbound' && UUID_RE.test(seg[1])) return seg[1];
  if (seg.length >= 2 && UUID_RE.test(seg[0])) return seg[0];
  return null;
}

/** Normaliza e recusa path hostil. Traversal e path absoluto morrem aqui. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.replace(/^\/+/, '').trim();
  if (!p || p.length > 1024) return null;
  if (p.includes('..') || p.includes('\\') || p.includes('\0')) return null;
  return p;
}

/**
 * Decide se ESTE chamador pode assinar ESTE objeto.
 * Retorna o motivo da negativa, ou null quando liberado.
 */
export function denyReason(
  bucket: string,
  path: string,
  auth: MediaAccessAuth,
): DenyReason | null {
  const policy = BUCKET_POLICY[bucket];
  if (!policy) return 'bucket_not_allowed';

  if (auth.isServiceRole) return null; // chamada interna server-to-server

  switch (policy) {
    case 'service_role':
      return 'forbidden';
    case 'super_admin':
      return auth.isSuperAdmin ? null : 'forbidden';
    case 'org_scoped': {
      if (auth.isSuperAdmin) return null; // super_admin enxerga qualquer tenant
      const pathOrg = orgFromChatMediaPath(path);
      if (!pathOrg) return 'unrecognized_path_shape';
      if (!auth.organizationId) return 'forbidden';
      return pathOrg === auth.organizationId ? null : 'forbidden';
    }
  }
}
