import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  collectLinkedProductIds,
  listLinkableCatalogProducts,
  pickExistingLeadForProduct,
  validateLinkPartyProduct,
  visiblePartyMemberships,
} from '../leads/platformCrmPartyGraph';

/** types.ts ainda sem as tabelas novas — cliente local até regenerar. */
const db = supabase as any;

const PLATFORM_CRM_KEY = 'platform-crm';
const PARTY_KEY = [PLATFORM_CRM_KEY, 'party-graph'] as const;

export type PartyGraphLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  product_id: string | null;
  party_id?: string | null;
};

export type PartyProductLink = {
  id: string;
  party_id: string;
  product_id: string;
  lead_id: string | null;
};

export function leadPartyId(lead: { party_id?: string | null } | null | undefined): string | null {
  return lead?.party_id ?? null;
}

export function isMissingPartyRelation(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: string }).message)
      : String(err ?? '');
  return /could not find the table|relation .* does not exist|schema cache/i.test(msg);
}

async function ensurePartyId(lead: PartyGraphLead): Promise<string> {
  if (lead.party_id) return lead.party_id;

  const { data: party, error } = await db
    .from('platform_crm_parties')
    .insert({
      display_name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: updErr } = await db
    .from('platform_crm_leads')
    .update({ party_id: party.id })
    .eq('id', lead.id);
  if (updErr) throw updErr;

  return party.id as string;
}

async function ensureMembership(partyId: string, productId: string, leadId: string) {
  if (!productId) return;

  const { data: existing, error: selErr } = await db
    .from('platform_crm_party_products')
    .select('id, lead_id')
    .eq('party_id', partyId)
    .eq('product_id', productId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    if (!existing.lead_id && leadId) {
      const { error } = await db
        .from('platform_crm_party_products')
        .update({ lead_id: leadId })
        .eq('id', existing.id);
      if (error) throw error;
    }
    return;
  }

  const { error } = await db.from('platform_crm_party_products').insert({
    party_id: partyId,
    product_id: productId,
    lead_id: leadId,
  });
  if (error && error.code !== '23505') throw error;
}

async function findSiblingLeadId(
  productId: string,
  identity: { email: string | null; phone: string | null },
): Promise<string | null> {
  const email = identity.email?.trim() || '';
  const phone = identity.phone?.trim() || '';

  const load = async (column: 'email' | 'phone', value: string) => {
    const { data, error } = await db
      .from('platform_crm_leads')
      .select('id, product_id, email, phone')
      .eq('product_id', productId)
      .eq(column, value)
      .limit(8);
    if (error) throw error;
    return pickExistingLeadForProduct(data ?? [], productId, identity);
  };

  if (email) {
    const id = await load('email', email);
    if (id) return id;
  }
  if (phone) return load('phone', phone);
  return null;
}

export function usePlatformCrmPartyGraph(lead: PartyGraphLead | undefined) {
  const queryClient = useQueryClient();
  const { products } = useActivePlatformProduct();
  const partyId = leadPartyId(lead);

  const memberships = useQuery({
    queryKey: [...PARTY_KEY, 'memberships', lead?.id, partyId],
    enabled: !!lead,
    queryFn: async (): Promise<PartyProductLink[]> => {
      if (!lead) return [];

      const fromLead: PartyProductLink[] = lead.product_id
        ? [
            {
              id: `lead:${lead.id}`,
              party_id: partyId ?? '',
              product_id: lead.product_id,
              lead_id: lead.id,
            },
          ]
        : [];

      if (!partyId) return fromLead;

      const { data, error } = await db
        .from('platform_crm_party_products')
        .select('id, party_id, product_id, lead_id')
        .eq('party_id', partyId)
        .not('product_id', 'is', null);
      if (error) throw error;

      const rows = visiblePartyMemberships((data ?? []) as PartyProductLink[]);
      const byProduct = new Map<string, PartyProductLink>();
      for (const row of fromLead) byProduct.set(row.product_id, row);
      for (const row of rows) byProduct.set(row.product_id, row);
      return [...byProduct.values()];
    },
  });

  const links = memberships.data ?? [];
  const linkedIds = collectLinkedProductIds({
    leadProductId: lead?.product_id,
    membershipProductIds: links.map((l) => l.product_id),
  });
  const linkable = listLinkableCatalogProducts(
    products.map((p) => ({ id: p.id, name: p.name })),
    linkedIds,
  );

  const linkMutation = useMutation({
    mutationFn: async (selectedProductId: string) => {
      if (!lead) throw new Error('Lead ausente');
      const check = validateLinkPartyProduct({
        selectedProductId,
        catalogIds: products.map((p) => p.id),
        alreadyLinkedIds: linkedIds,
      });
      if (!check.ok) throw new Error(check.error);

      const ensuredPartyId = await ensurePartyId(lead);
      if (lead.product_id) {
        await ensureMembership(ensuredPartyId, lead.product_id, lead.id);
      }

      let siblingId = await findSiblingLeadId(check.productId, {
        email: lead.email,
        phone: lead.phone,
      });

      if (siblingId) {
        const { error } = await db
          .from('platform_crm_leads')
          .update({ party_id: ensuredPartyId })
          .eq('id', siblingId);
        if (error) throw error;
      } else {
        const { data: created, error } = await db
          .from('platform_crm_leads')
          .insert({
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            position: lead.position,
            product_id: check.productId,
            party_id: ensuredPartyId,
            source: 'cross_sell',
            lead_origin: 'cross_sell',
            lead_channel: 'manual',
            temperature: 'warm',
          })
          .select('id')
          .single();
        if (error) throw error;
        siblingId = created.id as string;
      }

      await ensureMembership(ensuredPartyId, check.productId, siblingId);
      return { partyId: ensuredPartyId, productId: check.productId, leadId: siblingId };
    },
    onSuccess: (_data, _vars) => {
      queryClient.invalidateQueries({ queryKey: PARTY_KEY });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      if (lead?.id) {
        queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'lead', lead.id] });
      }
    },
  });

  return {
    links,
    linkedIds,
    linkable,
    isLoading: memberships.isLoading,
    isError: memberships.isError,
    error: memberships.error,
    missingRelation: isMissingPartyRelation(memberships.error),
    linkToProduct: linkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
  };
}
