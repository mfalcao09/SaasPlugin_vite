// platform-crm-find-create-lead.ts — PRD-03 unified find/create lead helper
//
// Módulo compartilhado para caminhos QR e cold-outreach da Camila.
// Garante que lead_id existe ANTES da resposta do brain.
//
// Padrões:
//   • phone nas colunas +E.164 (platform_crm_leads.phone) via phoneVariantsWithPlusBR.
//   • product_id scoped: busca e INSERT sempre filtram por produto.
//   • manual start semantics: status só é escrito no INSERT, nunca sobrescreve.
//   • Fail-safe: erros de DB logam e devolvem null; o caller decide se é fatal.
//
// Testability: as funções buildPhoneLookupVariants, buildLeadInsertPayload e
// shouldOverrideLeadName são puras (sem I/O). findOrCreateLeadByPhone injeta
// supabase como parâmetro.

import { phoneVariantsWithPlusBR } from "./phone-e164-variants.ts";
import { buildLeadName } from "./platform-crm-lead-context.ts";
import { waQrCanonicalVisitorPhone } from "./wa-qr-conversation-resolve.ts";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface FindOrCreateLeadParams {
  phone: string;
  pushName: string | null | undefined;
  productId: string | null;
  source: string;
  leadChannel: string;
  /** @deprecated platform_crm_leads não possui status; mantido no input legado. */
  status?: string;
  assignedTo?: string | null;
}

export interface LeadInsertPayload {
  name: string;
  phone: string;
  source: string;
  lead_channel: string;
  product_id: string;
  assigned_to?: string;
}

// ── Funções puras (testáveis sem DB) ─────────────────────────────────────────

/**
 * Variantes de telefone para casamento em coluna +E.164.
 * Reusa phoneVariantsWithPlusBR; retorna [] para entradas inválidas.
 */
export function buildPhoneLookupVariants(input: unknown): string[] {
  if (!input) return [];
  return phoneVariantsWithPlusBR(input);
}

/**
 * Normaliza o telefone para +E.164 para INSERT em platform_crm_leads.phone.
 * Garante que o resultado tenha prefixo "+".
 */
function toCanonicalPhone(phone: string): string {
  return waQrCanonicalVisitorPhone(phone);
}

/**
 * Monta o payload de INSERT para platform_crm_leads.
 * Puro — sem acesso a DB.
 */
export function buildLeadInsertPayload(
  params: FindOrCreateLeadParams,
): LeadInsertPayload {
  if (!params.productId) {
    throw new Error("product_id is required for platform CRM lead");
  }
  const canonicalPhone = toCanonicalPhone(params.phone);
  if (!canonicalPhone) {
    throw new Error("valid phone is required for platform CRM lead");
  }
  const name = buildLeadName(params.pushName, canonicalPhone);

  const payload: LeadInsertPayload = {
    name,
    phone: canonicalPhone,
    source: params.source,
    lead_channel: params.leadChannel,
    product_id: params.productId,
  };
  if (params.assignedTo) payload.assigned_to = params.assignedTo;

  return payload;
}

/**
 * Decide se o nome existente deve ser substituído pelo novo nome.
 * Semântica: upgrades são permitidos (WhatsApp-fallback → nome real);
 * downgrades (nome real → genérico) são proibidos.
 *
 * Regras:
 *   1. Se o existingName é um nome real (não é prefixo "WhatsApp ")
 *      e o newName é genérico ou também fallback → false.
 *   2. Se o existingName é fallback "WhatsApp ..." e o newName é um nome
 *      real → true.
 *   3. Same → false.
 */
export function shouldOverrideLeadName(
  existingName: string,
  newName: string,
): boolean {
  const existingIsFallback = existingName.startsWith("WhatsApp ") ||
    buildLeadName(existingName, "").startsWith("WhatsApp ");
  const newIsFallback = newName.startsWith("WhatsApp ") ||
    buildLeadName(newName, "").startsWith("WhatsApp ");

  if (existingIsFallback && !newIsFallback) return true;
  return false;
}

// ── findOrCreateLeadByPhone — DB-coupled (injeção de supabase) ────────────────

/**
 * Busca lead existente por (product_id, phone variants) ou cria um novo.
 * Retorna lead_id (string) ou null se falhar.
 *
 * Idempotente: chamadas subsequentes com o mesmo phone+product devolvem o
 * mesmo lead_id sem INSERT duplo.
 */
export async function findOrCreateLeadByPhone(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: FindOrCreateLeadParams,
): Promise<string | null> {
  try {
    if (!params.productId) {
      console.error("[findOrCreateLeadByPhone] product_id is required");
      return null;
    }
    const variants = buildPhoneLookupVariants(params.phone);
    if (variants.length === 0) {
      console.warn("[findOrCreateLeadByPhone] empty phone variants, skipping");
      return null;
    }

    const lookup = () =>
      supabase
        .from("platform_crm_leads")
        .select("id, name")
        .in("phone", variants)
        .eq("product_id", params.productId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    // ── 1. Busca existente ───────────────────────────────────────────────────
    const { data: existing, error: lookupError } = await lookup();
    if (lookupError) {
      console.error(
        "[findOrCreateLeadByPhone] lookup error:",
        lookupError.message,
      );
      return null;
    }

    if (existing?.id) {
      // Upgrade de nome é best-effort e nunca pode esconder um ID já resolvido.
      try {
        const candidateName = buildLeadName(
          params.pushName,
          toCanonicalPhone(params.phone),
        );
        if (
          existing.name &&
          shouldOverrideLeadName(existing.name, candidateName)
        ) {
          await supabase
            .from("platform_crm_leads")
            .update({
              name: candidateName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
      } catch (nameError) {
        console.warn(
          "[findOrCreateLeadByPhone] name upgrade skipped:",
          (nameError as Error).message,
        );
      }
      return existing.id as string;
    }

    // ── 2. Cria novo ─────────────────────────────────────────────────────────
    const insertPayload = buildLeadInsertPayload(params);
    const { data: created, error } = await supabase
      .from("platform_crm_leads")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      if (String(error.code) === "23505") {
        const { data: raced, error: raceLookupError } = await lookup();
        if (!raceLookupError && raced?.id) return raced.id as string;
      }
      console.error("[findOrCreateLeadByPhone] INSERT error:", error.message);
      return null;
    }

    const leadId = created?.id ?? null;
    return leadId;
  } catch (e) {
    console.error(
      "[findOrCreateLeadByPhone] unexpected error:",
      (e as Error).message,
    );
    return null;
  }
}

/**
 * Garante lead_id para abertura de cold outreach.
 * Wrapper semântico sobre findOrCreateLeadByPhone com source=cold_outreach.
 * Retorna null (não lança) se DB falhar — o caller decide se é fatal.
 */
export async function ensureLeadForColdOpening(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: {
    phone: string;
    pushName?: string | null;
    productId: string;
  },
): Promise<string | null> {
  return findOrCreateLeadByPhone(supabase, {
    phone: params.phone,
    pushName: params.pushName ?? null,
    productId: params.productId,
    source: "cold_outreach",
    leadChannel: "cold_outreach",
    status: "manual_start",
  });
}
