-- Nova Prospecção Ativa — índices aditivos para a leitura paginada do snapshot.
-- Não altera dados, estados do Harness ou contratos de escrita.

CREATE INDEX IF NOT EXISTS idx_pcrm_extracted_imported_lead_created
  ON public.platform_crm_extracted_leads (imported_to_lead_id, created_at, id)
  WHERE imported_to_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_state_product_lead_stage
  ON public.platform_crm_lead_state (product_id, lead_id, derived_stage);

CREATE INDEX IF NOT EXISTS idx_pcrm_leads_product_updated
  ON public.platform_crm_leads (product_id, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_pcrm_operations_product_lead_status_requested
  ON public.platform_crm_lead_operations (product_id, lead_id, status, requested_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcrm_optout_product_phone_handle
  ON public.platform_crm_lead_optout (product_id, telefone, handle);
