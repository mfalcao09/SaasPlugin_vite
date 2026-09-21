// Espelho UI: derived_stage → platform_crm_pipeline_stages.name (funil NexvyBeauty).
// A tela lê current_stage_id; o harness só escrevia derived_stage — daí o Kanban mudo.

export const UI_STAGE_LEADS_IN_DB = "Leads no DB";
export const UI_STAGE_PRESELECTED = "Pré-selecionado";
export const UI_STAGE_CONTACTED = "Contatado";
export const UI_STAGE_IN_SERVICE = "Em Atendimento";
export const UI_STAGE_REMARKETING = "Remarketing";
export const UI_STAGE_DNC = "Perdido - Não contatar";

const DERIVED_TO_UI_NAME: Record<string, string> = {
  db: UI_STAGE_LEADS_IN_DB,
  preselected: UI_STAGE_PRESELECTED,
  contacted: UI_STAGE_CONTACTED,
  service: UI_STAGE_IN_SERVICE,
  remarketing_pool: UI_STAGE_REMARKETING,
  do_not_contact: UI_STAGE_DNC,
};

export function uiStageNameForDerived(stage: string | null | undefined): string {
  if (!stage) return UI_STAGE_LEADS_IN_DB;
  return DERIVED_TO_UI_NAME[stage] ?? UI_STAGE_LEADS_IN_DB;
}

type Sb = { from: (t: string) => any };

export async function paintLeadCurrentStage(
  sb: Sb,
  input: { leadId: string; productId: string; derivedStage: string | null },
): Promise<{ ok: boolean; name?: string; error?: string }> {
  if (!input.leadId || !input.productId) {
    return { ok: false, error: "missing_ids" };
  }
  const name = uiStageNameForDerived(input.derivedStage);
  const { data: stage, error } = await sb
    .from("platform_crm_pipeline_stages")
    .select("id")
    .eq("product_id", input.productId)
    .eq("name", name)
    .maybeSingle();
  if (error) return { ok: false, error: error.message ?? "stage_lookup_failed" };
  if (!stage?.id) return { ok: false, error: `stage_not_found:${name}` };
  const { error: upErr } = await sb
    .from("platform_crm_leads")
    .update({
      current_stage_id: stage.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId)
    .eq("product_id", input.productId);
  if (upErr) return { ok: false, error: upErr.message ?? "paint_failed" };
  return { ok: true, name };
}
