-- C9 Nível 3: marca hubs de beleza (≥50k seguidores, não-descarte) como SEMENTES
-- para a mineração de seguidores. Dimensão ortogonal ao segmento.
-- Aplicada via MCP em 2026-07-13 (migration extracted_leads_is_seed).
ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS is_seed boolean;

CREATE INDEX IF NOT EXISTS idx_extracted_leads_is_seed
  ON public.platform_crm_extracted_leads (extraction_id, is_seed)
  WHERE is_seed = true;
