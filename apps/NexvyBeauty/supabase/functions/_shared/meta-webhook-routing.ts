// Roteamento unificado do webhook Cloud API entre as DUAS tabelas de conexão.
//
// Um App Meta entrega tudo na mesma callback. `phone_number_id` é a fonte de
// verdade. COLISÃO (mesmo número nas duas tabelas) é ERRO, nunca preferência:
// escolher um lado vazaria a mensagem para o CRM errado.
//
// Inbox:
//   platform-only → inbox de plataforma (`platform_crm_*`)
//   tenant-only   → inbox do salão
//   collision     → 4xx, nenhuma inbox

export const SCOPE_COLLISION_STATUS = 409;
export const SCOPE_COLLISION_ERROR = 'scope_collision';

export type WebhookScope = 'platform' | 'tenant' | 'collision' | 'none';
export type WebhookInbox = 'platform' | 'tenant' | null;

export type PlatformConnHit = {
  id: string;
  product_id?: string | null;
};

export type TenantConnHit = {
  id: string;
  organization_id?: string | null;
};

export type RouteDecision = {
  scope: WebhookScope;
  connectionId: string | null;
  productId: string | null;
  organizationId: string | null;
  inbox: WebhookInbox;
  httpStatus: number;
};

export function decideMetaWebhookRoute(
  platform: PlatformConnHit | null | undefined,
  tenant: TenantConnHit | null | undefined,
): RouteDecision {
  const platId = platform?.id ? String(platform.id) : '';
  const tenId = tenant?.id ? String(tenant.id) : '';

  if (platId && tenId) {
    return {
      scope: 'collision',
      connectionId: null,
      productId: null,
      organizationId: null,
      inbox: null,
      httpStatus: SCOPE_COLLISION_STATUS,
    };
  }

  if (platId) {
    return {
      scope: 'platform',
      connectionId: platId,
      productId: platform?.product_id ?? null,
      organizationId: null,
      inbox: 'platform',
      httpStatus: 200,
    };
  }

  if (tenId) {
    return {
      scope: 'tenant',
      connectionId: tenId,
      productId: null,
      organizationId: tenant?.organization_id ?? null,
      inbox: 'tenant',
      httpStatus: 200,
    };
  }

  return {
    scope: 'none',
    connectionId: null,
    productId: null,
    organizationId: null,
    inbox: null,
    httpStatus: 200,
  };
}

export function scopeCollisionResponse(): Response {
  return new Response(JSON.stringify({ error: SCOPE_COLLISION_ERROR }), {
    status: SCOPE_COLLISION_STATUS,
    headers: { 'Content-Type': 'application/json' },
  });
}

type MaybeSingle = Promise<{ data: Record<string, unknown> | null; error: unknown }>;

export async function lookupMetaWebhookConnections(
  supabase: { from: (table: string) => unknown },
  phoneNumberId: string,
): Promise<{ platform: PlatformConnHit | null; tenant: TenantConnHit | null }> {
  const from = supabase.from.bind(supabase);
  const platformQ = from('platform_crm_whatsapp_meta_connections') as {
    select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => MaybeSingle } };
  };
  const tenantQ = from('whatsapp_meta_connections') as {
    select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => MaybeSingle } };
  };

  const [plat, tenant] = await Promise.all([
    platformQ.select('id, product_id').eq('phone_number_id', phoneNumberId).maybeSingle(),
    tenantQ.select('id, organization_id').eq('phone_number_id', phoneNumberId).maybeSingle(),
  ]);

  return {
    platform: plat.data?.id
      ? { id: String(plat.data.id), product_id: (plat.data.product_id as string | null) ?? null }
      : null,
    tenant: tenant.data?.id
      ? {
        id: String(tenant.data.id),
        organization_id: (tenant.data.organization_id as string | null) ?? null,
      }
      : null,
  };
}
