-- PRD-08 — Learning Controller schema (strategies / experiments / promote).
-- Created: 2026-09-13 | Apply only after PRD-08 approval.
-- Learning Controller MUST NOT edit safety kernel, payments, or evaluator tables.

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_strategies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  slug         text NOT NULL CHECK (length(btrim(slug)) > 0),
  version      integer NOT NULL CHECK (version >= 1),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  active       boolean NOT NULL DEFAULT false,
  immutable    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_agent_strategies_slug_version_unique
    UNIQUE (agent_id, slug, version)
);

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_experiments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  holdout_bps     integer NOT NULL DEFAULT 1500
    CHECK (holdout_bps >= 0 AND holdout_bps <= 10000),
  control_strategy_id   uuid REFERENCES public.platform_crm_agent_strategies(id),
  treatment_strategy_id uuid REFERENCES public.platform_crm_agent_strategies(id),
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'shadow', 'canary', 'active', 'frozen', 'rolled_back')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, slug)
);

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_experiment_assignments (
  experiment_id   uuid NOT NULL REFERENCES public.platform_crm_agent_experiments(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  arm             text NOT NULL CHECK (arm IN ('holdout', 'control', 'treatment')),
  bucket          integer NOT NULL CHECK (bucket >= 0 AND bucket < 10000),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, lead_id)
);

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_strategy_promotions (
  op_id                    text PRIMARY KEY,
  agent_id                 uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  from_strategy_version_id uuid,
  to_strategy_version_id   uuid NOT NULL REFERENCES public.platform_crm_agent_strategies(id),
  action                   text NOT NULL CHECK (action IN ('promote', 'rollback')),
  applied_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_crm_agent_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_agent_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_agent_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_agent_strategy_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcrm_agent_strategies_super_admin_only ON public.platform_crm_agent_strategies;
CREATE POLICY pcrm_agent_strategies_super_admin_only
  ON public.platform_crm_agent_strategies FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS pcrm_agent_experiments_super_admin_only ON public.platform_crm_agent_experiments;
CREATE POLICY pcrm_agent_experiments_super_admin_only
  ON public.platform_crm_agent_experiments FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS pcrm_agent_experiment_assignments_super_admin_only
  ON public.platform_crm_agent_experiment_assignments;
CREATE POLICY pcrm_agent_experiment_assignments_super_admin_only
  ON public.platform_crm_agent_experiment_assignments FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS pcrm_agent_strategy_promotions_super_admin_only
  ON public.platform_crm_agent_strategy_promotions;
CREATE POLICY pcrm_agent_strategy_promotions_super_admin_only
  ON public.platform_crm_agent_strategy_promotions FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

REVOKE ALL ON public.platform_crm_agent_strategies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_crm_agent_experiments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_crm_agent_experiment_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_crm_agent_strategy_promotions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_crm_agent_strategies TO service_role;
GRANT ALL ON public.platform_crm_agent_experiments TO service_role;
GRANT ALL ON public.platform_crm_agent_experiment_assignments TO service_role;
GRANT ALL ON public.platform_crm_agent_strategy_promotions TO service_role;

-- At most one active strategy per agent (concurrent promote safety).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcrm_agent_strategies_one_active
  ON public.platform_crm_agent_strategies (agent_id)
  WHERE active = true;

-- Reject constitution keys in strategy payload (top-level + nested text scan).
CREATE OR REPLACE FUNCTION public.pcrm_assert_learnable_strategy_payload(p jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  banned text[] := ARRAY[
    'price','checkout_url','identity','opt_out','channel','hard_caps','metrics',
    'history','kill_switch','release_state','safety_kernel','action_ledger',
    'evaluator','payment_events'
  ];
  learnable text[] := ARRAY['strategy','beat_order','tone','cadence_within_caps'];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'strategy payload must be object';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p)
  LOOP
    IF NOT (k = ANY (learnable)) THEN
      RAISE EXCEPTION 'strategy payload key not learnable: %', k;
    END IF;
  END LOOP;
  -- Deep walk: any nested constitution key fails closed.
  PERFORM public.pcrm_assert_no_banned_json_keys(p, banned);
END;
$$;

CREATE OR REPLACE FUNCTION public.pcrm_assert_no_banned_json_keys(p jsonb, banned text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  el jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p) = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p)
    LOOP
      IF k = ANY (banned) THEN
        RAISE EXCEPTION 'strategy payload contains constitution key: %', k;
      END IF;
      PERFORM public.pcrm_assert_no_banned_json_keys(p -> k, banned);
    END LOOP;
  ELSIF jsonb_typeof(p) = 'array' THEN
    FOR el IN SELECT value FROM jsonb_array_elements(p)
    LOOP
      PERFORM public.pcrm_assert_no_banned_json_keys(el, banned);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pcrm_trg_agent_strategies_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.pcrm_assert_learnable_strategy_payload(NEW.payload);
  IF TG_OP = 'UPDATE' AND OLD.immutable IS TRUE THEN
    IF NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      RAISE EXCEPTION 'immutable strategy content cannot change';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_agent_strategies_guard
  ON public.platform_crm_agent_strategies;
CREATE TRIGGER trg_pcrm_agent_strategies_guard
  BEFORE INSERT OR UPDATE ON public.platform_crm_agent_strategies
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_trg_agent_strategies_guard();

REVOKE ALL ON FUNCTION public.pcrm_assert_learnable_strategy_payload(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_assert_learnable_strategy_payload(jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.pcrm_assert_no_banned_json_keys(jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_assert_no_banned_json_keys(jsonb, text[])
  TO service_role;

-- Idempotent promote/rollback: only flips strategy.active for this agent.
-- Explicitly does NOT touch release_controls, action_ledger, payments, or evaluator.
CREATE OR REPLACE FUNCTION public.pcrm_promote_agent_strategy(
  p_op_id text,
  p_agent_id uuid,
  p_to_strategy_id uuid,
  p_action text DEFAULT 'promote'
)
RETURNS TABLE (
  applied boolean,
  active_strategy_id uuid,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing text;
  v_from uuid;
BEGIN
  -- Serialize promotes per agent (distinct op_ids cannot dual-activate).
  PERFORM pg_advisory_xact_lock(hashtext('pcrm_promote:' || p_agent_id::text));

  IF p_action NOT IN ('promote', 'rollback') THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid_action';
    RETURN;
  END IF;

  SELECT op_id INTO v_existing
  FROM public.platform_crm_agent_strategy_promotions
  WHERE op_id = p_op_id;
  IF FOUND THEN
    SELECT s.id INTO v_from
    FROM public.platform_crm_agent_strategies s
    WHERE s.agent_id = p_agent_id AND s.active = true
    ORDER BY s.version DESC
    LIMIT 1;
    RETURN QUERY SELECT false, v_from, 'idempotent_noop';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_agent_strategies
    WHERE id = p_to_strategy_id AND agent_id = p_agent_id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'strategy_not_found';
    RETURN;
  END IF;

  SELECT s.id INTO v_from
  FROM public.platform_crm_agent_strategies s
  WHERE s.agent_id = p_agent_id AND s.active = true
  ORDER BY s.version DESC
  LIMIT 1;

  UPDATE public.platform_crm_agent_strategies
  SET active = false
  WHERE agent_id = p_agent_id AND active = true;

  UPDATE public.platform_crm_agent_strategies
  SET active = true
  WHERE id = p_to_strategy_id;

  INSERT INTO public.platform_crm_agent_strategy_promotions (
    op_id, agent_id, from_strategy_version_id, to_strategy_version_id, action
  ) VALUES (
    p_op_id, p_agent_id, v_from, p_to_strategy_id, p_action
  );

  RETURN QUERY SELECT true, p_to_strategy_id, 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.pcrm_promote_agent_strategy(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_promote_agent_strategy(text, uuid, uuid, text)
  TO service_role;
