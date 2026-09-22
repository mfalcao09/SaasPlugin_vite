-- PRD-08 follow-up — canário 15% (Marcelo 2026-09-13).
-- Created: 2026-09-14 | holdout_bps column = canary share for treatment (new strategy).
-- Created: apply after 20260913_camila_learning_controller.sql

ALTER TABLE public.platform_crm_agent_experiments
  ALTER COLUMN holdout_bps SET DEFAULT 1500;

COMMENT ON COLUMN public.platform_crm_agent_experiments.holdout_bps IS
  'Canary bps: fraction assigned to treatment (new strategy). Default 1500 = 15%. Rest = control/stable.';
