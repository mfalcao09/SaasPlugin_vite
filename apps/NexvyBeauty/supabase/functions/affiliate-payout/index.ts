// affiliate-payout — motor de payout de comissões de afiliado (Fase 5).
//
// Seleciona affiliate_commissions status='approved' (sem item ainda), agrupa por afiliado,
// cria lote (batch) idempotente e marca approved → paid via adapter de PIX-out
// (manual por default; STUB do automatizado). Toda a lógica testável mora em payout-core.ts.
//
// Gate: super admin (Bearer → getUser → rpc is_super_admin), espelhando cakto-proxy.
// Despacho por body.action. Não é público (verify_jwt=true no deploy).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  confirmItem,
  createBatch,
  listApproved,
  listBatches,
  processBatch,
  type CommissionRow,
  type PayoutBatchRow,
  type PayoutDb,
  type PayoutItemRow,
} from './payout-core.ts';

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

// deno-lint-ignore no-explicit-any
function makeDb(admin: any): PayoutDb {
  return {
    async listApprovedCommissions(): Promise<CommissionRow[]> {
      const { data } = await admin
        .from('affiliate_commissions')
        .select('id, affiliate_id, amount_cents, status, payout_item_id')
        .eq('status', 'approved')
        .is('payout_item_id', null)
        .order('created_at', { ascending: true });
      return (data ?? []) as CommissionRow[];
    },

    async getAffiliates(ids: string[]) {
      const { data } = await admin
        .from('affiliates')
        .select('id, name, pix_key')
        .in('id', ids);
      const map: Record<string, { name: string; pix_key: string | null }> = {};
      // deno-lint-ignore no-explicit-any
      for (const a of (data ?? []) as any[]) {
        map[a.id] = { name: a.name, pix_key: a.pix_key ?? null };
      }
      return map;
    },

    async insertBatch(row): Promise<PayoutBatchRow> {
      const { data, error } = await admin
        .from('payout_batches')
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PayoutBatchRow;
    },

    async insertItems(rows): Promise<PayoutItemRow[]> {
      if (rows.length === 0) return [];
      const { data, error } = await admin
        .from('payout_items')
        .insert(rows)
        .select();
      if (error) throw new Error(error.message);
      return (data ?? []) as PayoutItemRow[];
    },

    async getBatch(batchId): Promise<PayoutBatchRow | null> {
      const { data } = await admin
        .from('payout_batches')
        .select('*')
        .eq('id', batchId)
        .maybeSingle();
      return (data ?? null) as PayoutBatchRow | null;
    },

    async getItem(itemId): Promise<PayoutItemRow | null> {
      const { data } = await admin
        .from('payout_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();
      return (data ?? null) as PayoutItemRow | null;
    },

    async listItemsByBatch(batchId): Promise<PayoutItemRow[]> {
      const { data } = await admin
        .from('payout_items')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });
      return (data ?? []) as PayoutItemRow[];
    },

    async listBatches(limit, offset) {
      const { data, count } = await admin
        .from('payout_batches')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return { batches: (data ?? []) as PayoutBatchRow[], total: count ?? 0 };
    },

    async updateItem(itemId, patch): Promise<PayoutItemRow | null> {
      const { data } = await admin
        .from('payout_items')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .select()
        .maybeSingle();
      return (data ?? null) as PayoutItemRow | null;
    },

    async updateBatch(batchId, patch): Promise<PayoutBatchRow | null> {
      const { data } = await admin
        .from('payout_batches')
        .update(patch)
        .eq('id', batchId)
        .select()
        .maybeSingle();
      return (data ?? null) as PayoutBatchRow | null;
    },

    async markCommissionsPaid(commissionIds, payoutItemId): Promise<number> {
      // Guard idempotente: só approved viram paid. Pago nunca é re-tocado.
      const { data } = await admin
        .from('affiliate_commissions')
        .update({ status: 'paid', payout_item_id: payoutItemId, updated_at: new Date().toISOString() })
        .in('id', commissionIds)
        .eq('status', 'approved')
        .select('id');
      // deno-lint-ignore no-explicit-any
      return Array.isArray(data) ? (data as any[]).length : 0;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: userId });
    if (isSuper !== true) return json({ error: 'Apenas super admin' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const db = makeDb(admin);

    switch (action) {
      case 'list_approved': {
        const res = await listApproved(db);
        return json(res);
      }

      case 'create_batch': {
        const res = await createBatch(db, {
          provider: body.provider,
          affiliateIds: Array.isArray(body.affiliate_ids) ? body.affiliate_ids : undefined,
          notes: body.notes ?? null,
          createdBy: userId,
        });
        if (!res.ok) return json({ error: res.error }, res.status);
        return json(res);
      }

      case 'process_batch': {
        if (!body.batch_id) return json({ error: 'batch_id obrigatório' }, 400);
        const res = await processBatch(db, body.batch_id);
        if (!res.ok) return json({ error: res.error }, res.status);
        return json(res);
      }

      case 'confirm_item': {
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400);
        const res = await confirmItem(db, { itemId: body.item_id, providerRef: body.provider_ref ?? null });
        if (!res.ok) return json({ error: res.error }, res.status);
        return json(res);
      }

      case 'list_batches': {
        const res = await listBatches(db, { limit: body.limit, offset: body.offset });
        return json(res);
      }

      default:
        return json({ error: `Ação inválida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('affiliate-payout error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
