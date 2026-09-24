// Resolução de identidade do inventário de prospecção.
//
// A tabela extracted_leads é 1 linha por perfil/extração; o CRM é 1 card por
// identidade comercial. A rotina abaixo faz a ponte sem usar handle como
// identidade exclusiva e sem criar card para revisão/remoção.

import { findOrCreateLeadByPhone } from "./platform-crm-find-create-lead.ts";
import { phoneVariantsWithPlusBR } from "./phone-e164-variants.ts";
import { isPromotableTriage, triageFromLegacySegment } from "./platform-crm-triage.ts";

export type ExtractedLeadForResolution = {
  id: string;
  product_id: string;
  handle: string | null;
  name: string | null;
  telefone: string | null;
  segment: string | null;
  triagem?: string | null;
  imported_to_lead_id: string | null;
};

export type IdentityResolutionResult = {
  status: "linked_existing" | "created" | "not_promotable" | "skipped";
  leadId: string | null;
  groupedByPhone: boolean;
};

export function normalizeExtractedHandle(value: unknown): string | null {
  const handle = String(value ?? "").trim().replace(/^@/, "").toLowerCase();
  return handle || null;
}

/** O vocabulário legado é convertido aqui; a UI não decide por cor/badge. */
export function isPromotableSegment(segment: unknown): boolean {
  return isPromotableTriage(triageFromLegacySegment(segment));
}

function displayName(row: ExtractedLeadForResolution): string {
  return row.name?.trim() || `Instagram @${row.handle ?? "perfil"}`;
}

async function ensureLeadState(sb: any, leadId: string, productId: string) {
  const { error } = await sb
    .from("platform_crm_lead_state")
    .upsert({ lead_id: leadId, product_id: productId, derived_stage: "db" }, {
      onConflict: "lead_id,product_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`lead state: ${error.message}`);
}

async function createLeadWithoutPhone(sb: any, row: ExtractedLeadForResolution) {
  const { data, error } = await sb
    .from("platform_crm_leads")
    .insert({
      product_id: row.product_id,
      name: displayName(row),
      source: "prospectagram",
      lead_channel: "instagram",
      metadata: { created_from: "prospecting_triage", handle: row.handle },
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(`create lead without phone: ${error?.message ?? "missing id"}`);
  }
  return String(data.id);
}

/**
 * Promove uma linha elegível e liga-a ao card canônico.
 *
 * Ordem de identidade:
 * 1. vínculo já gravado na própria linha;
 * 2. outro perfil do mesmo handle já ligado;
 * 3. lead existente pelo telefone;
 * 4. novo card.
 *
 * Assim, telefone igual + handles diferentes cai no mesmo card, enquanto
 * handle+telefone repetidos permanecem idempotentes.
 */
export async function resolveExtractedLeadIdentity(
  sb: any,
  row: ExtractedLeadForResolution,
): Promise<IdentityResolutionResult> {
  if (row.imported_to_lead_id) {
    return {
      status: "skipped",
      leadId: row.imported_to_lead_id,
      groupedByPhone: false,
    };
  }
  const triagem = row.triagem ?? triageFromLegacySegment(row.segment);
  if (!isPromotableTriage(triagem) || !row.handle) {
    return { status: "not_promotable", leadId: null, groupedByPhone: false };
  }

  const handle = normalizeExtractedHandle(row.handle);
  if (!handle) return { status: "not_promotable", leadId: null, groupedByPhone: false };

  const { data: handleRows, error: handleError } = await sb
    .from("platform_crm_extracted_leads")
    .select("id, imported_to_lead_id, created_at")
    .eq("product_id", row.product_id)
    .eq("handle", handle)
    .neq("id", row.id)
    .not("imported_to_lead_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (handleError) throw new Error(`lookup handle identity: ${handleError.message}`);

  let leadId: string | null = handleRows?.[0]?.imported_to_lead_id ?? null;
  let groupedByPhone = false;
  let status: IdentityResolutionResult["status"] = "linked_existing";

  if (!leadId && row.telefone) {
    const phoneVariants = phoneVariantsWithPlusBR(row.telefone);
    const { data: existingPhones, error: existingPhoneError } = await sb
      .from("platform_crm_leads")
      .select("id")
      .in("phone", phoneVariants)
      .eq("product_id", row.product_id)
      .limit(1);
    if (existingPhoneError) throw new Error(`lookup canonical phone: ${existingPhoneError.message}`);
    const hadExistingPhone = (existingPhones?.length ?? 0) > 0;

    leadId = await findOrCreateLeadByPhone(sb, {
      phone: row.telefone,
      pushName: row.name,
      productId: row.product_id,
      source: "prospectagram",
      leadChannel: "instagram",
    });
    if (!leadId) throw new Error("resolve lead by phone returned null");
    status = hadExistingPhone ? "linked_existing" : "created";

    // Se o telefone já existia, o novo handle virou um perfil do mesmo card.
    const { data: phoneRows, error: phoneError } = await sb
      .from("platform_crm_extracted_leads")
      .select("id")
      .eq("product_id", row.product_id)
      .eq("telefone", row.telefone)
      .eq("imported_to_lead_id", leadId)
      .neq("id", row.id)
      .limit(1);
    if (phoneError) throw new Error(`lookup phone identity: ${phoneError.message}`);
    groupedByPhone = (phoneRows?.length ?? 0) > 0;
  }

  if (!leadId) {
    leadId = await createLeadWithoutPhone(sb, { ...row, handle });
    status = "created";
  }

  await ensureLeadState(sb, leadId, row.product_id);

  const { error: linkError } = await sb
    .from("platform_crm_extracted_leads")
    .update({ imported_to_lead_id: leadId })
    .eq("id", row.id);
  if (linkError) throw new Error(`link extracted lead: ${linkError.message}`);

  return { status, leadId, groupedByPhone };
}
