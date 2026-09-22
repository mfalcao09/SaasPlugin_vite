-- Path A F2: soft/hard opt-out + reopen grants (additive, deny-safe defaults)
-- Does NOT drop legacy do_not_contact behavior; extends optout + policy metadata keys.

ALTER TABLE public.platform_crm_lead_optout
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by_event_id text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'cold';

COMMENT ON COLUMN public.platform_crm_lead_optout.kind IS
  'soft | hard — Path A: hard never cleared by reopen classifier';
COMMENT ON COLUMN public.platform_crm_lead_optout.active IS
  'false when soft revoked by reopen_intent; history retained';

-- Backfill: incident / PARE-style reasons → hard; else soft
UPDATE public.platform_crm_lead_optout
SET kind = CASE
  WHEN lower(coalesce(reason, '')) ~ '(incident|pare|sair|stop|lgpd|hard)' THEN 'hard'
  ELSE 'soft'
END
WHERE kind = 'soft' OR kind IS NULL;

-- Partial index for active suppressions
CREATE INDEX IF NOT EXISTS idx_pcrm_lead_optout_active
  ON public.platform_crm_lead_optout (product_id, telefone_digits)
  WHERE active = true;

-- Note: pcrm_authorize_and_reserve_agent_action still denies metadata.do_not_contact
-- (emergency). Path A F3+ will refine to dnc_hard / cold_suppressed / reply_grant.
-- Flags REOPEN_INTENT_V1_MODE / R2_AUTO_V1_MODE default OFF (app config, not SQL).
