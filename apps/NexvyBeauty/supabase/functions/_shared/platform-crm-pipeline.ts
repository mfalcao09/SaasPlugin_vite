// _shared/platform-crm-pipeline.ts
//
// Porte 1:1 do `_shared/ensureLeadInPipeline.ts` do CRM Vendus para o CRM de
// PLATAFORMA. Desacoplamento: sem organization_id e sem product_id — o pipeline
// da plataforma é único e global (platform_crm_pipeline_stages não tem produto),
// então todo o bloco de resolução de produto do original cai fora.
//
// Garante que um lead esteja posicionado no pipeline (primeiro estágio).
// Idempotente: se o lead já tem current_stage_id, não faz nada.

export async function ensurePlatformLeadInPipeline(
  supabase: any,
  leadId: string,
): Promise<{ stage_id: string | null }> {
  try {
    const { data: lead } = await supabase
      .from('platform_crm_leads')
      .select('id, current_stage_id')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead) return { stage_id: null };
    if (lead.current_stage_id) {
      return { stage_id: lead.current_stage_id };
    }

    // Primeiro estágio (menor order_index, ignorando won/lost)
    const { data: stage } = await supabase
      .from('platform_crm_pipeline_stages')
      .select('id')
      .or('is_won.is.null,is_won.eq.false')
      .or('is_lost.is.null,is_lost.eq.false')
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!stage?.id) return { stage_id: null };

    await supabase
      .from('platform_crm_leads')
      .update({
        current_stage_id: stage.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // Auditoria (não-fatal se falhar)
    try {
      await supabase.from('platform_crm_lead_stage_history').insert({
        lead_id: leadId,
        stage_id: stage.id,
      });
    } catch (_) {
      /* ignore */
    }

    return { stage_id: stage.id };
  } catch (e) {
    console.warn('[ensurePlatformLeadInPipeline] error:', (e as Error).message);
    return { stage_id: null };
  }
}
