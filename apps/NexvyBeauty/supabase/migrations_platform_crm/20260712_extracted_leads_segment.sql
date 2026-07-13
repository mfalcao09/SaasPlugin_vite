-- C9: ICP evoluiu de gate → classificador. Cada lead carrega seu segmento:
-- salao_cliente | afiliado_infoproduto | revisao | descarte.
-- qualified = pronto p/ contato de VENDA (só salao_cliente).
-- Aplicada via MCP em 2026-07-12 (migration extracted_leads_segment_classifier).
ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS is_infoproduto boolean;

CREATE INDEX IF NOT EXISTS idx_extracted_leads_segment
  ON public.platform_crm_extracted_leads (extraction_id, segment);
