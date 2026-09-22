-- PRD-07 — coortes versionadas do conductor Camila.
-- Created: 2026-09-13 | Apply only after PRD-07 approval.
-- Allowlist hardcoded deixa de ser fonte de verdade.

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_cohorts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (length(btrim(slug)) > 0),
  version     integer NOT NULL CHECK (version >= 1),
  active      boolean NOT NULL DEFAULT false,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_agent_cohorts_slug_version_unique
    UNIQUE (product_id, agent_id, slug, version)
);

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_cohort_members (
  cohort_id        uuid NOT NULL
    REFERENCES public.platform_crm_agent_cohorts(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL
    REFERENCES public.platform_crm_conversations(id) ON DELETE CASCADE,
  added_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_agent_cohort_members_conversation
  ON public.platform_crm_agent_cohort_members (conversation_id);

ALTER TABLE public.platform_crm_agent_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_agent_cohort_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcrm_agent_cohorts_super_admin_only
  ON public.platform_crm_agent_cohorts;
CREATE POLICY pcrm_agent_cohorts_super_admin_only
  ON public.platform_crm_agent_cohorts
  FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS pcrm_agent_cohort_members_super_admin_only
  ON public.platform_crm_agent_cohort_members;
CREATE POLICY pcrm_agent_cohort_members_super_admin_only
  ON public.platform_crm_agent_cohort_members
  FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

REVOKE ALL ON public.platform_crm_agent_cohorts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_crm_agent_cohort_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_crm_agent_cohorts TO service_role;
GRANT ALL ON public.platform_crm_agent_cohort_members TO service_role;

-- Seed coorte incident-v1 (5 conversas do incidente) ativa=false até GO.
-- product_id/agent_id da Camila prospector.
DO $prd07_seed$
DECLARE
  v_agent uuid := '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7';
  v_product uuid;
  v_cohort uuid;
BEGIN
  SELECT product_id INTO v_product
  FROM public.platform_crm_product_agents
  WHERE id = v_agent;
  IF v_product IS NULL THEN
    RAISE NOTICE 'PRD-07: Camila agent missing — cohort seed skipped';
    RETURN;
  END IF;

  INSERT INTO public.platform_crm_agent_cohorts (
    product_id, agent_id, slug, version, active, reason
  ) VALUES (
    v_product, v_agent, 'incident-piloto-20260901', 1, false,
    'PRD-07 seed from incident allowlist; activate only after Master Gate staging'
  )
  ON CONFLICT (product_id, agent_id, slug, version) DO UPDATE
    SET reason = EXCLUDED.reason
  RETURNING id INTO v_cohort;

  INSERT INTO public.platform_crm_agent_cohort_members (cohort_id, conversation_id)
  SELECT v_cohort, x.id
  FROM (VALUES
    ('7e427cd4-5181-445d-9eb1-f05906b8f42d'::uuid),
    ('e882518f-5ebd-457d-8c3c-dc33f400a7a1'::uuid),
    ('01385b74-29ab-4044-bf10-3a2bcc26928c'::uuid),
    ('db870f09-54d1-4e1b-a221-6af8fb24788f'::uuid),
    ('db7991a9-df6c-4665-8d9b-481b1cc48d53'::uuid)
  ) AS x(id)
  WHERE EXISTS (
    SELECT 1 FROM public.platform_crm_conversations c WHERE c.id = x.id
  )
  ON CONFLICT DO NOTHING;
END;
$prd07_seed$;

CREATE OR REPLACE FUNCTION public.pcrm_list_active_conductor_cohort_members(
  p_agent_id uuid
)
RETURNS TABLE (
  cohort_id uuid,
  cohort_slug text,
  cohort_version integer,
  conversation_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH chosen AS (
    SELECT c.id, c.slug, c.version
    FROM public.platform_crm_agent_cohorts c
    WHERE c.agent_id = p_agent_id
      AND c.active = true
    ORDER BY c.version DESC, c.created_at DESC
    LIMIT 1
  )
  SELECT chosen.id, chosen.slug, chosen.version, m.conversation_id
  FROM chosen
  JOIN public.platform_crm_agent_cohort_members m ON m.cohort_id = chosen.id
  ORDER BY m.conversation_id;
$$;

REVOKE ALL ON FUNCTION public.pcrm_list_active_conductor_cohort_members(uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_list_active_conductor_cohort_members(uuid)
  TO service_role;
