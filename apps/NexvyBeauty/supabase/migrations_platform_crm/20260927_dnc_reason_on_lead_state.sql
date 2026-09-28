-- Motivo canônico da etapa Não contatar.
-- O motivo é parte do estado do funil; não deve ser inferido de telefone,
-- perfil ou da tabela legada de opt-out.
ALTER TABLE public.platform_crm_lead_state
  ADD COLUMN IF NOT EXISTS dnc_reason text;

DO $dnc_reason_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_crm_lead_state_dnc_reason_check'
      AND conrelid = 'public.platform_crm_lead_state'::regclass
  ) THEN
    ALTER TABLE public.platform_crm_lead_state
      ADD CONSTRAINT platform_crm_lead_state_dnc_reason_check
      CHECK (dnc_reason IS NULL OR dnc_reason IN (
        'hard_stop', 'cadence_exhausted', 'closed_lost', 'unknown'
      ));
  END IF;
END;
$dnc_reason_constraint$;

COMMENT ON COLUMN public.platform_crm_lead_state.dnc_reason IS
  'Motivo da etapa do_not_contact: hard_stop, cadence_exhausted, closed_lost ou unknown.';

CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_state_product_dnc_reason
  ON public.platform_crm_lead_state (product_id, dnc_reason)
  WHERE derived_stage = 'do_not_contact';

UPDATE public.platform_crm_lead_state
SET dnc_reason = 'unknown'
WHERE derived_stage = 'do_not_contact'
  AND dnc_reason IS NULL;

CREATE OR REPLACE FUNCTION public.platform_crm_lead_state_cas_patch(
  p_lead_id          uuid,
  p_product_id       uuid,
  p_expected_version integer,
  p_patch            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current integer;
  v_new     integer;
  v_stage   text;
  v_reason  text;
BEGIN
  IF jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_patch');
  END IF;

  IF p_patch ? 'dnc_reason' AND
     NULLIF(p_patch->>'dnc_reason', '') IS NOT NULL AND
     p_patch->>'dnc_reason' NOT IN ('hard_stop', 'cadence_exhausted', 'closed_lost', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dnc_reason');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_crm_leads
    WHERE id = p_lead_id AND product_id = p_product_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_product_mismatch');
  END IF;

  SELECT version INTO v_current
  FROM public.platform_crm_lead_state
  WHERE lead_id = p_lead_id AND product_id = p_product_id
  FOR UPDATE;

  v_stage := p_patch->>'derived_stage';
  v_reason := NULLIF(p_patch->>'dnc_reason', '');

  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true,
        'current_version', 0, 'expected_version', p_expected_version);
    END IF;
    INSERT INTO public.platform_crm_lead_state
      (lead_id, product_id, version, summary, derived_stage, dnc_reason, next_action,
       facts, objections, commitments, consents)
    VALUES
      (p_lead_id, p_product_id, 1, p_patch->>'summary', v_stage,
       CASE WHEN v_stage = 'do_not_contact' THEN COALESCE(v_reason, 'unknown') ELSE NULL END,
       p_patch->>'next_action', COALESCE(p_patch->'facts', '{}'::jsonb),
       COALESCE(p_patch->'objections', '[]'::jsonb), COALESCE(p_patch->'commitments', '[]'::jsonb),
       COALESCE(p_patch->'consents', '{}'::jsonb))
    ON CONFLICT (lead_id, product_id) DO NOTHING
    RETURNING version INTO v_new;
    IF v_new IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'version', v_new, 'created', true);
    END IF;
    SELECT version INTO v_current
    FROM public.platform_crm_lead_state
    WHERE lead_id = p_lead_id AND product_id = p_product_id
    FOR UPDATE;
  END IF;

  IF v_current != p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true,
      'current_version', v_current, 'expected_version', p_expected_version);
  END IF;

  v_new := v_current + 1;
  UPDATE public.platform_crm_lead_state SET
    version       = v_new,
    summary       = CASE WHEN p_patch ? 'summary' THEN p_patch->>'summary' ELSE summary END,
    derived_stage = CASE WHEN p_patch ? 'derived_stage' THEN p_patch->>'derived_stage' ELSE derived_stage END,
    dnc_reason    = CASE
      WHEN p_patch ? 'dnc_reason' THEN
        CASE WHEN COALESCE(p_patch->>'derived_stage', derived_stage) = 'do_not_contact'
          THEN COALESCE(NULLIF(p_patch->>'dnc_reason', ''), 'unknown') ELSE NULL END
      WHEN p_patch ? 'derived_stage' AND p_patch->>'derived_stage' <> 'do_not_contact' THEN NULL
      WHEN p_patch ? 'derived_stage' AND p_patch->>'derived_stage' = 'do_not_contact' THEN COALESCE(dnc_reason, 'unknown')
      ELSE dnc_reason
    END,
    next_action   = CASE WHEN p_patch ? 'next_action' THEN p_patch->>'next_action' ELSE next_action END,
    facts         = CASE WHEN p_patch ? 'facts' THEN facts || COALESCE(p_patch->'facts', '{}'::jsonb) ELSE facts END,
    objections    = CASE WHEN p_patch ? 'objections' THEN COALESCE(p_patch->'objections', '[]'::jsonb) ELSE objections END,
    commitments   = CASE WHEN p_patch ? 'commitments' THEN COALESCE(p_patch->'commitments', '[]'::jsonb) ELSE commitments END,
    consents      = CASE WHEN p_patch ? 'consents' THEN consents || COALESCE(p_patch->'consents', '{}'::jsonb) ELSE consents END,
    updated_at    = now()
  WHERE lead_id = p_lead_id AND product_id = p_product_id AND version = p_expected_version
  RETURNING version INTO v_new;

  IF v_new IS NULL THEN
    SELECT version INTO v_current FROM public.platform_crm_lead_state
    WHERE lead_id = p_lead_id AND product_id = p_product_id;
    RETURN jsonb_build_object('ok', false, 'conflict', true,
      'current_version', v_current, 'expected_version', p_expected_version);
  END IF;
  RETURN jsonb_build_object('ok', true, 'version', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_lead_state_cas_patch(uuid, uuid, integer, jsonb)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_lead_state_cas_patch(uuid, uuid, integer, jsonb)
  TO service_role;
