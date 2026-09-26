-- Persisted evidence for successful Nova Prospecção Ativa snapshot refreshes.
-- The Edge Function writes this row only after the complete snapshot and
-- operational summary have been read successfully.

CREATE TABLE IF NOT EXISTS public.platform_crm_snapshot_refresh_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name     text NOT NULL,
  product_id        uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  requested_at      timestamptz NOT NULL,
  completed_at      timestamptz NOT NULL,
  status            text NOT NULL CHECK (status IN ('success')),
  snapshot_version  uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_snapshot_refresh_audit_time_order_chk
    CHECK (completed_at >= requested_at)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_snapshot_refresh_audit_product_completed
  ON public.platform_crm_snapshot_refresh_audit
    (product_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pcrm_snapshot_refresh_audit_function_requested
  ON public.platform_crm_snapshot_refresh_audit
    (function_name, requested_at DESC);

ALTER TABLE public.platform_crm_snapshot_refresh_audit ENABLE ROW LEVEL SECURITY;

-- Reads and writes are intentionally mediated by the authenticated Edge
-- Function. No client role receives direct access to this audit ledger.
REVOKE ALL ON public.platform_crm_snapshot_refresh_audit FROM anon, authenticated;
GRANT ALL ON public.platform_crm_snapshot_refresh_audit TO service_role;

COMMENT ON TABLE public.platform_crm_snapshot_refresh_audit IS
  'Persisted proof of successful operational snapshot refreshes requested by the Nova Prospecção Ativa UI.';

COMMENT ON COLUMN public.platform_crm_snapshot_refresh_audit.snapshot_version IS
  'Unique version identifier returned to the UI as proof of the persisted refresh result.';
