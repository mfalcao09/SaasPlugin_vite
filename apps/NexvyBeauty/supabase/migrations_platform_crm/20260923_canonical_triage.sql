-- Triagem canônica do CRM.
-- A lixeira (`excluded_at` + platform_crm_lead_excluded) continua sendo uma
-- operação LGPD destrutiva. Remoção confirmada é um balde operacional reversível.

ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS triagem text,
  ADD COLUMN IF NOT EXISTS triagem_reason text,
  ADD COLUMN IF NOT EXISTS triagem_source text,
  ADD COLUMN IF NOT EXISTS triagem_at timestamptz,
  ADD COLUMN IF NOT EXISTS triagem_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.platform_crm_extracted_leads
SET triagem = CASE segment
  WHEN 'salao_cliente' THEN 'principal'
  WHEN 'afiliado_infoproduto' THEN 'semente'
  WHEN 'descarte' THEN 'remocao_confirmada'
  ELSE 'nao_classificado'
END
WHERE triagem IS NULL;

ALTER TABLE public.platform_crm_extracted_leads
  ALTER COLUMN triagem SET DEFAULT 'nao_classificado',
  ALTER COLUMN triagem SET NOT NULL;

DO $triage_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_crm_extracted_leads_triagem_check'
  ) THEN
    ALTER TABLE public.platform_crm_extracted_leads
      ADD CONSTRAINT platform_crm_extracted_leads_triagem_check
      CHECK (triagem IN ('principal', 'semente', 'nao_classificado', 'remocao_confirmada'));
  END IF;
END;
$triage_constraint$;

CREATE INDEX IF NOT EXISTS idx_extracted_leads_triagem
  ON public.platform_crm_extracted_leads (product_id, triagem, excluded_at);

CREATE TABLE IF NOT EXISTS public.platform_crm_extracted_lead_triage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_lead_id uuid NOT NULL
    REFERENCES public.platform_crm_extracted_leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  from_triagem text,
  to_triagem text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'human',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_triagem IN ('principal', 'semente', 'nao_classificado', 'remocao_confirmada'))
);

CREATE INDEX IF NOT EXISTS idx_extracted_lead_triage_history_lead
  ON public.platform_crm_extracted_lead_triage_history (extracted_lead_id, created_at DESC);

ALTER TABLE public.platform_crm_extracted_lead_triage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_extracted_lead_triage_history_super_admin_only
  ON public.platform_crm_extracted_lead_triage_history;
CREATE POLICY platform_crm_extracted_lead_triage_history_super_admin_only
  ON public.platform_crm_extracted_lead_triage_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

REVOKE ALL ON public.platform_crm_extracted_lead_triage_history FROM authenticated;
GRANT ALL ON public.platform_crm_extracted_lead_triage_history TO service_role;
