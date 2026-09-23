/** Fonte de verdade do funil piloto = derived_stage. Colunas do Kanban só espelham. */

export const UI_STAGE_LEADS_IN_DB = 'Leads no DB';
export const UI_STAGE_PRESELECTED = 'Pré-selecionado';
export const UI_STAGE_CONTACTED = 'Contatado';
export const UI_STAGE_IN_SERVICE = 'Em Atendimento';
export const UI_STAGE_REMARKETING = 'Remarketing';
export const UI_STAGE_DNC = 'Perdido - Não contatar';

const DERIVED_TO_UI: Record<string, string> = {
  db: UI_STAGE_LEADS_IN_DB,
  preselected: UI_STAGE_PRESELECTED,
  contacted: UI_STAGE_CONTACTED,
  service: UI_STAGE_IN_SERVICE,
  remarketing_pool: UI_STAGE_REMARKETING,
  do_not_contact: UI_STAGE_DNC,
};

export function uiStageNameForDerived(stage: string | null | undefined): string {
  if (!stage) return UI_STAGE_LEADS_IN_DB;
  return DERIVED_TO_UI[stage] ?? UI_STAGE_LEADS_IN_DB;
}

export function derivedStageFromLead(lead: {
  product_id?: string | null;
  platform_crm_lead_state?:
    | { derived_stage?: string | null; product_id?: string | null }
    | Array<{ derived_stage?: string | null; product_id?: string | null }>
    | null;
}): string | null {
  const raw = lead.platform_crm_lead_state;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = rows.find((r) => !lead.product_id || !r.product_id || r.product_id === lead.product_id);
  const stage = match?.derived_stage;
  return typeof stage === 'string' && stage.length > 0 ? stage : null;
}

export function kanbanStageKeyForLead(
  lead: {
    current_stage_id?: string | null;
    product_id?: string | null;
    platform_crm_lead_state?:
      | { derived_stage?: string | null; product_id?: string | null }
      | Array<{ derived_stage?: string | null; product_id?: string | null }>
      | null;
  },
  stages: readonly { id: string; name: string }[],
): string | null {
  const derived = derivedStageFromLead(lead);
  if (derived) {
    const want = uiStageNameForDerived(derived);
    const hit = stages.find((s) => s.name === want);
    if (hit) return hit.id;
  }
  return lead.current_stage_id ?? null;
}
