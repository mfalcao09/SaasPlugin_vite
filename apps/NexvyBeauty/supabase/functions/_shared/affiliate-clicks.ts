// Incremento de affiliate_links.clicks — chamado na captura ?ref= (capture-lead)
// e no page-load (RPC direta). Dedup: se o page-load já gravou, capture-lead pula.

import { shouldIncrementClicks } from './affiliate-policy.ts';

export interface ClickAdmin {
  rpc: (name: string, args: { p_ref: string }) => Promise<{ data: unknown; error: unknown }>;
}

export interface IncrementResult {
  incremented: boolean;
  affiliateId: string | null;
}

export async function incrementAffiliateLinkClicks(
  admin: ClickAdmin,
  ref: string | null | undefined,
  alreadyRecorded = false,
): Promise<IncrementResult> {
  if (!shouldIncrementClicks(ref, alreadyRecorded)) {
    return { incremented: false, affiliateId: null };
  }
  const { data, error } = await admin.rpc('record_affiliate_click', { p_ref: String(ref).trim() });
  if (error) throw error;
  const affiliateId = typeof data === 'string' && data.length > 0 ? data : null;
  return { incremented: affiliateId != null, affiliateId };
}
