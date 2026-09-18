// Mapa canônico: derived_stage ↔ listas do WhatsApp Business (Z-API /tags).
// IDs mudam; o nome da lista é a chave estável.

export type FunnelTagCatalogItem = { id: string; name: string };

export type FunnelPaintStage = "do_not_contact" | "remarketing_pool";

const HARD_NAME = /n[aã]o\s*contatar|hard\s*opt-?out/i;
const RMKT_NAME = /remarketing/i;

export function isHardOptOutTagName(name: string): boolean {
  return HARD_NAME.test(name);
}

export function isRemarketingTagName(name: string): boolean {
  return RMKT_NAME.test(name) && !HARD_NAME.test(name);
}

export function resolveFunnelTagIds(
  catalog: readonly FunnelTagCatalogItem[],
): { hardId: string | null; remarketingId: string | null } {
  let hardId: string | null = null;
  let remarketingId: string | null = null;
  for (const item of catalog) {
    const name = String(item.name ?? "");
    if (!hardId && isHardOptOutTagName(name)) hardId = String(item.id);
    if (!remarketingId && isRemarketingTagName(name)) {
      remarketingId = String(item.id);
    }
  }
  return { hardId, remarketingId };
}

export function impliedStageFromChatTags(
  chatTagIds: readonly string[],
  ids: { hardId: string | null; remarketingId: string | null },
): FunnelPaintStage | null {
  const set = new Set(chatTagIds.map(String));
  if (ids.hardId && set.has(ids.hardId)) return "do_not_contact";
  if (ids.remarketingId && set.has(ids.remarketingId)) return "remarketing_pool";
  return null;
}

/**
 * Funil manda. Lista do celular NÃO escreve derived_stage.
 * DNC/REMARKETING no CRM pintam a lista (add + tira a outra).
 * contacted/service/preselected não apagam tags do aparelho.
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
  const paintAdd: string[] = [];
  const paintRemove: string[] = [];

  if (stage === "do_not_contact") {
    if (ids.hardId && !set.has(ids.hardId)) paintAdd.push(ids.hardId);
    if (ids.remarketingId && set.has(ids.remarketingId)) {
      paintRemove.push(ids.remarketingId);
    }
  } else if (stage === "remarketing_pool") {
    if (ids.remarketingId && !set.has(ids.remarketingId)) {
      paintAdd.push(ids.remarketingId);
    }
    if (ids.hardId && set.has(ids.hardId)) paintRemove.push(ids.hardId);
  }

  return { casStage: null, paintAdd, paintRemove };
}

export function nextActionForFunnelStage(stage: FunnelPaintStage): string {
  return stage === "do_not_contact" ? "do_not_contact" : "remarketing_pool_idle";
}
