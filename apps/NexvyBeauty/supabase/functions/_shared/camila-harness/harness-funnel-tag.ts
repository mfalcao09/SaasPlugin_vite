// Mapa canônico: derived_stage ↔ listas do WhatsApp Business (Z-API /tags).
// IDs mudam; o nome da lista é a chave estável.

export type FunnelTagCatalogItem = { id: string; name: string };

export type FunnelPaintStage =
  | "do_not_contact"
  | "remarketing_pool"
  | "contacted"
  | "service";

const HARD_NAME = /n[aã]o\s*contatar|hard\s*opt-?out/i;
const RMKT_NAME = /remarketing/i;
const CONTACTED_NAME = /^contatado$/i;
const SERVICE_NAME = /^em\s*atendimento$/i;

export function isHardOptOutTagName(name: string): boolean {
  return HARD_NAME.test(name);
}

export function isRemarketingTagName(name: string): boolean {
  return RMKT_NAME.test(name) && !HARD_NAME.test(name);
}

export function isContactedTagName(name: string): boolean {
  return CONTACTED_NAME.test(name.trim());
}

export function isServiceTagName(name: string): boolean {
  return SERVICE_NAME.test(name.trim());
}

export function resolveFunnelTagIds(
  catalog: readonly FunnelTagCatalogItem[],
): {
  hardId: string | null;
  remarketingId: string | null;
  contactedId: string | null;
  serviceId: string | null;
} {
  let hardId: string | null = null;
  let remarketingId: string | null = null;
  let contactedId: string | null = null;
  let serviceId: string | null = null;
  for (const item of catalog) {
    const name = String(item.name ?? "");
    if (!hardId && isHardOptOutTagName(name)) hardId = String(item.id);
    if (!remarketingId && isRemarketingTagName(name)) {
      remarketingId = String(item.id);
    }
    if (!contactedId && isContactedTagName(name)) contactedId = String(item.id);
    if (!serviceId && isServiceTagName(name)) serviceId = String(item.id);
  }
  return { hardId, remarketingId, contactedId, serviceId };
}

export function impliedStageFromChatTags(
  chatTagIds: readonly string[],
  ids: {
    hardId: string | null;
    remarketingId: string | null;
    contactedId?: string | null;
    serviceId?: string | null;
  },
): FunnelPaintStage | null {
  const set = new Set(chatTagIds.map(String));
  if (ids.hardId && set.has(ids.hardId)) return "do_not_contact";
  if (ids.remarketingId && set.has(ids.remarketingId)) return "remarketing_pool";
  if (ids.serviceId && set.has(ids.serviceId)) return "service";
  if (ids.contactedId && set.has(ids.contactedId)) return "contacted";
  return null;
}

function exclusivePaint(
  want: string | null,
  others: Array<string | null>,
  set: Set<string>,
): { paintAdd: string[]; paintRemove: string[] } {
  const paintAdd: string[] = [];
  const paintRemove: string[] = [];
  if (want && !set.has(want)) paintAdd.push(want);
  for (const id of others) {
    if (id && set.has(id)) paintRemove.push(id);
  }
  return { paintAdd, paintRemove };
}

/**
 * Funil manda. Lista do celular NÃO escreve derived_stage.
 * Cada estágio pinta UMA tag e tira as outras do funil.
 */
export function planFunnelTagSync(input: {
  crmStage: string | null | undefined;
  chatTagIds: readonly string[];
  catalog: readonly FunnelTagCatalogItem[];
}): {
  casStage: FunnelPaintStage | null;
  paintAdd: string[];
  paintRemove: string[];
} {
  const ids = resolveFunnelTagIds(input.catalog);
  const stage = String(input.crmStage ?? "");
  const set = new Set(input.chatTagIds.map(String));

  if (stage === "do_not_contact") {
    const p = exclusivePaint(ids.hardId, [
      ids.remarketingId,
      ids.contactedId,
      ids.serviceId,
    ], set);
    return { casStage: null, ...p };
  }
  if (stage === "remarketing_pool") {
    const p = exclusivePaint(ids.remarketingId, [
      ids.hardId,
      ids.contactedId,
      ids.serviceId,
    ], set);
    return { casStage: null, ...p };
  }
  if (stage === "contacted") {
    const p = exclusivePaint(ids.contactedId, [
      ids.hardId,
      ids.remarketingId,
      ids.serviceId,
    ], set);
    return { casStage: null, ...p };
  }
  if (stage === "service") {
    const p = exclusivePaint(ids.serviceId, [
      ids.hardId,
      ids.remarketingId,
      ids.contactedId,
    ], set);
    return { casStage: null, ...p };
  }

  return { casStage: null, paintAdd: [], paintRemove: [] };
}

export function nextActionForFunnelStage(stage: FunnelPaintStage): string {
  if (stage === "do_not_contact") return "do_not_contact";
  if (stage === "service") return "attend";
  if (stage === "contacted") return "await_reply_or_complete_package";
  return "remarketing_pool_idle";
}
