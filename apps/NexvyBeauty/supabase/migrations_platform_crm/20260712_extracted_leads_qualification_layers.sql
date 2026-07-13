-- C9 F1: colunas de qualificação por camada no staging de leads extraídos.
-- Cada lead carrega o veredito das 4 camadas (ICP/idioma/GEO/telefone) + o
-- booleano final `qualified`, pra UI de Prospecção filtrar e pra medir precisão.
-- Aplicada via MCP em 2026-07-12 (migration platform_crm_extracted_leads_qualification_layers).
ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS qualified boolean,
  ADD COLUMN IF NOT EXISTS phone_is_br boolean,
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS bio_lang text,
  ADD COLUMN IF NOT EXISTS filter_verdicts jsonb;

-- Índice pra listar só os qualificados por extração (query da UI/relatório).
CREATE INDEX IF NOT EXISTS idx_extracted_leads_qualified
  ON public.platform_crm_extracted_leads (extraction_id, qualified);
