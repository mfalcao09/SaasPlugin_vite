-- ============================================================================
-- Nova Prospecção Ativa — camada operacional horizontal
--
-- Não move leads de tabela e não cria um segundo eixo vertical.
-- Fonte vertical canônica do Harness: platform_crm_lead_state.derived_stage.
-- A UI escreve via Edge Functions; esta migration cria apenas persistência e
-- uma projeção de leitura para operações horizontais.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_crm_lead_operations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id             uuid
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  extracted_lead_id   uuid
    REFERENCES public.platform_crm_extracted_leads(id) ON DELETE CASCADE,
  operation_type      text NOT NULL
    CHECK (operation_type IN ('enrichment','preselection','handoff','triage_review')),
  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  source_module       text NOT NULL DEFAULT 'nova_prospeccao',
  target_module       text,
  requested_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  idempotency_key     text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  result              jsonb,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_lead_operations_target_chk
    CHECK (lead_id IS NOT NULL OR extracted_lead_id IS NOT NULL),
  CONSTRAINT platform_crm_lead_operations_payload_object_chk
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT platform_crm_lead_operations_result_object_chk
    CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  CONSTRAINT platform_crm_lead_operations_product_idempotency_uniq
    UNIQUE (product_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_operations_product_status
  ON public.platform_crm_lead_operations (product_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_operations_lead
  ON public.platform_crm_lead_operations (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_operations_extracted
  ON public.platform_crm_lead_operations (extracted_lead_id, created_at DESC)
  WHERE extracted_lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pcrm_lead_operations_active_target
  ON public.platform_crm_lead_operations (
    product_id,
    COALESCE(lead_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(extracted_lead_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operation_type
  )
  WHERE status IN ('queued','running');

DROP TRIGGER IF EXISTS trg_pcrm_lead_operations_updated_at
  ON public.platform_crm_lead_operations;
CREATE TRIGGER trg_pcrm_lead_operations_updated_at
  BEFORE UPDATE ON public.platform_crm_lead_operations
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

ALTER TABLE public.platform_crm_lead_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_lead_operations_super_admin_only
  ON public.platform_crm_lead_operations;
CREATE POLICY platform_crm_lead_operations_super_admin_only
  ON public.platform_crm_lead_operations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.platform_crm_lead_operations TO authenticated;
GRANT ALL ON public.platform_crm_lead_operations TO service_role;

-- Snapshot de cards canônicos. Não contém regra de autorização de escrita.
-- Perfis sem imported_to_lead_id continuam consultáveis na tabela de staging;
-- esta projeção existe para a unidade operacional card/lead.
DROP VIEW IF EXISTS public.platform_crm_lead_operational_snapshot;
CREATE VIEW public.platform_crm_lead_operational_snapshot
WITH (security_invoker = true)
AS
SELECT
  l.product_id,
  l.id AS lead_id,
  l.name,
  l.phone,
  s.derived_stage,
  COALESCE(p.profile_count, 0)::integer AS profile_count,
  COALESCE(p.handles, '[]'::jsonb) AS profiles,
  COALESCE(p.triagem_summary, 'nao_classificado') AS triagem_summary,
  COALESCE(o.active_operation_count, 0)::integer AS active_operation_count,
  COALESCE(o.active_operations, '[]'::jsonb) AS active_operations,
  EXISTS (
    SELECT 1
    FROM public.platform_crm_campaign_targets ct
    WHERE ct.lead_id = l.id
      AND ct.status IN ('queued','sending','sent','responded')
  ) AS has_campaign_activity,
  EXISTS (
    SELECT 1
    FROM public.platform_crm_lead_optout lo
    WHERE lo.product_id = l.product_id
      AND (
        (lo.telefone IS NOT NULL AND lo.telefone = l.phone)
        OR (lo.telefone IS NULL AND lo.handle IS NOT NULL AND lo.handle IN (
          SELECT lower(trim(e.handle))
          FROM public.platform_crm_extracted_leads e
          WHERE e.imported_to_lead_id = l.id
        ))
      )
  ) AS is_suppressed,
  l.updated_at
FROM public.platform_crm_leads l
LEFT JOIN public.platform_crm_lead_state s
  ON s.lead_id = l.id AND s.product_id = l.product_id
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS profile_count,
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'handle', e.handle,
        'triagem', e.triagem,
        'telefone', e.telefone,
        'origem', e.extraction_id
      ) ORDER BY e.created_at, e.id
    ) AS handles,
    CASE
      WHEN bool_or(e.triagem = 'principal') THEN 'principal'
      WHEN bool_or(e.triagem = 'semente') THEN 'semente'
      WHEN bool_and(e.triagem = 'remocao_confirmada') THEN 'remocao_confirmada'
      ELSE 'nao_classificado'
    END AS triagem_summary
  FROM public.platform_crm_extracted_leads e
  WHERE e.imported_to_lead_id = l.id
) p ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS active_operation_count,
    jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'type', op.operation_type,
        'status', op.status,
        'requested_at', op.requested_at
      ) ORDER BY op.requested_at DESC
    ) AS active_operations
  FROM public.platform_crm_lead_operations op
  WHERE op.product_id = l.product_id
    AND op.lead_id = l.id
    AND op.status IN ('queued','running')
) o ON true;

GRANT SELECT ON public.platform_crm_lead_operational_snapshot TO authenticated;
GRANT SELECT ON public.platform_crm_lead_operational_snapshot TO service_role;

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_state_product_stage
  ON public.platform_crm_lead_state (product_id, derived_stage);

CREATE INDEX IF NOT EXISTS idx_pcrm_extracted_triagem_phone
  ON public.platform_crm_extracted_leads (product_id, triagem, telefone);

CREATE INDEX IF NOT EXISTS idx_pcrm_campaign_targets_lead_status
  ON public.platform_crm_campaign_targets (lead_id, status);

COMMENT ON TABLE public.platform_crm_lead_operations IS
  'Operações horizontais da Nova Prospecção Ativa. Não substitui o estágio vertical do Harness, campanhas ou disparos.';

COMMENT ON COLUMN public.platform_crm_lead_state.derived_stage IS
  'Fonte canônica do eixo vertical do Harness. Não duplicar como preselected boolean ou current_stage_id na nova UI.';
