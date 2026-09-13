-- ============================================================================
-- PRD-04 — Immutable Safety Kernel + Action Ledger
-- Created: 2026-09-12. Apply only with production approval.
-- ============================================================================

DO $prd04_prerequisite$
BEGIN
  IF to_regclass('public.platform_crm_lead_state') IS NULL THEN
    RAISE EXCEPTION
      'PRD-04 prerequisite missing: apply PRD-03 lead state migration first';
  END IF;
END;
$prd04_prerequisite$;

ALTER TABLE public.platform_crm_lead_optout
  ADD COLUMN IF NOT EXISTS telefone_digits text
  GENERATED ALWAYS AS (
    regexp_replace(COALESCE(telefone, ''), '\D', '', 'g')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_pcrm_lead_optout_product_phone_digits
  ON public.platform_crm_lead_optout (product_id, telefone_digits)
  WHERE telefone_digits <> '';

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_release_controls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL
    REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  release_state   text NOT NULL DEFAULT 'OFF'
    CHECK (release_state IN ('OFF', 'SHADOW', 'TEST', 'CANARY', 'LIVE')),
  kill_switch     boolean NOT NULL DEFAULT false,
  kernel_version  text NOT NULL DEFAULT 'camila-kernel-v1',
  kernel_hash     text,
  reason          text,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_action_ledger (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id               uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  conversation_id       uuid
    REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  agent_id               uuid NOT NULL
    REFERENCES public.platform_crm_product_agents(id) ON DELETE RESTRICT,
  instance_id            uuid
    REFERENCES public.platform_crm_wa_qr_instances(id) ON DELETE SET NULL,
  strategy_version_id   uuid,
  experiment_id          uuid,
  idempotency_key        text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  action_type            text NOT NULL
    CHECK (action_type IN ('opening', 'followup', 'resume', 'reply')),
  channel                text NOT NULL,
  proactive              boolean NOT NULL DEFAULT false,
  bubble_count           integer NOT NULL,
  content_hash           text NOT NULL CHECK (length(btrim(content_hash)) > 0),
  status                 text NOT NULL
    CHECK (status IN (
      'reserved', 'denied', 'accepted', 'delivered', 'read', 'failed', 'cancelled'
    )),
  deny_reason            text,
  failure_reason         text,
  provider_message_id    text,
  policy_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reserved_at            timestamptz,
  accepted_at            timestamptz,
  delivered_at           timestamptz,
  read_at                timestamptz,
  failed_at              timestamptz,
  cancelled_at           timestamptz,
  expires_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'denied' OR bubble_count BETWEEN 1 AND 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_pcrm_agent_action_idempotency
  ON public.platform_crm_agent_action_ledger (product_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pcrm_agent_action_provider_message
  ON public.platform_crm_agent_action_ledger (instance_id, provider_message_id)
  WHERE instance_id IS NOT NULL AND provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_action_lead_time
  ON public.platform_crm_agent_action_ledger (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_action_conversation_time
  ON public.platform_crm_agent_action_ledger (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_action_agent_id
  ON public.platform_crm_agent_action_ledger (agent_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_action_instance_id
  ON public.platform_crm_agent_action_ledger (instance_id)
  WHERE instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_action_status
  ON public.platform_crm_agent_action_ledger (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_pcrm_agent_release_control_updated_at
  ON public.platform_crm_agent_release_controls;
CREATE TRIGGER trg_pcrm_agent_release_control_updated_at
  BEFORE UPDATE ON public.platform_crm_agent_release_controls
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_pcrm_agent_action_ledger_updated_at
  ON public.platform_crm_agent_action_ledger;
CREATE TRIGGER trg_pcrm_agent_action_ledger_updated_at
  BEFORE UPDATE ON public.platform_crm_agent_action_ledger
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

ALTER TABLE public.platform_crm_agent_release_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_agent_action_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcrm_agent_release_controls_super_admin_only
  ON public.platform_crm_agent_release_controls;
CREATE POLICY pcrm_agent_release_controls_super_admin_only
  ON public.platform_crm_agent_release_controls
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS pcrm_agent_action_ledger_super_admin_only
  ON public.platform_crm_agent_action_ledger;
CREATE POLICY pcrm_agent_action_ledger_super_admin_only
  ON public.platform_crm_agent_action_ledger
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

REVOKE SELECT ON public.platform_crm_agent_release_controls FROM authenticated;
REVOKE SELECT ON public.platform_crm_agent_action_ledger FROM authenticated;
REVOKE SELECT ON public.platform_crm_lead_state FROM authenticated;
REVOKE SELECT ON public.platform_crm_lead_memory FROM authenticated;
GRANT ALL ON public.platform_crm_agent_release_controls TO service_role;
GRANT ALL ON public.platform_crm_agent_action_ledger TO service_role;

-- Every prospector starts OFF. Re-running never changes an existing state.
INSERT INTO public.platform_crm_agent_release_controls (
  product_id, agent_id, release_state, kill_switch, reason
)
SELECT product_id, id, 'OFF', false, 'PRD-04 default deny'
FROM public.platform_crm_product_agents
WHERE agent_type = 'prospector' AND product_id IS NOT NULL
ON CONFLICT (product_id, agent_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pcrm_expire_agent_action_reservations(
  p_lead_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.platform_crm_agent_action_ledger
  SET status = 'cancelled',
      cancelled_at = now(),
      failure_reason = 'reservation_expired'
  WHERE status = 'reserved'
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND (p_lead_id IS NULL OR lead_id = p_lead_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pcrm_expire_agent_action_reservations(uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_expire_agent_action_reservations(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pcrm_authorize_and_reserve_agent_action(
  p_idempotency_key      text,
  p_product_id           uuid,
  p_lead_id              uuid,
  p_conversation_id      uuid,
  p_agent_id             uuid,
  p_instance_id          uuid,
  p_channel              text,
  p_action_type          text,
  p_proactive            boolean,
  p_bubble_count         integer,
  p_content_hash         text,
  p_strategy_version_id  uuid DEFAULT NULL,
  p_experiment_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p_max_openings constant integer := 1;
  p_max_followups constant integer := 2;
  v_existing           record;
  v_release_state      text := 'OFF';
  v_kill_switch        boolean := false;
  v_kernel_version     text := 'camila-kernel-v1';
  v_reason             text;
  v_phone_digits       text;
  v_openings           integer := 0;
  v_followups          integer := 0;
  v_proactive_24h      integer := 0;
  v_last_proactive     timestamptz;
  v_last_outbound      timestamptz;
  v_human_replied      boolean := false;
  v_local_time         timestamp;
  v_policy             jsonb;
  v_id                 uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_product_id::text || ':' || p_lead_id::text, 0)
  );
  PERFORM public.pcrm_expire_agent_action_reservations(p_lead_id);

  SELECT * INTO v_existing
  FROM public.platform_crm_agent_action_ledger
  WHERE product_id = p_product_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action_id', v_existing.id,
      'status', v_existing.status,
      'allowed', false,
      'reason', COALESCE(
        v_existing.deny_reason,
        CASE
          WHEN v_existing.status = 'reserved' THEN 'reservation_in_progress'
          ELSE 'action_already_processed'
        END
      ),
      'idempotent', true
    );
  END IF;

  SELECT release_state, kill_switch, kernel_version
    INTO v_release_state, v_kill_switch, v_kernel_version
  FROM public.platform_crm_agent_release_controls
  WHERE product_id = p_product_id AND agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND OR v_release_state = 'OFF' THEN
    v_reason := 'release_off';
  ELSIF v_release_state = 'SHADOW' THEN
    v_reason := 'shadow_no_provider';
  ELSIF v_kill_switch THEN
    v_reason := 'kill_switch';
  ELSIF p_action_type NOT IN ('opening', 'followup', 'resume', 'reply') THEN
    v_reason := 'invalid_action';
  ELSIF p_bubble_count NOT BETWEEN 1 AND 2 THEN
    v_reason := 'bubble_cap';
  ELSIF length(btrim(COALESCE(p_content_hash, ''))) = 0 THEN
    v_reason := 'content_hash_missing';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_leads
    WHERE id = p_lead_id AND product_id = p_product_id
  ) THEN
    v_reason := 'lead_missing';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_lead_state
    WHERE lead_id = p_lead_id AND product_id = p_product_id
  ) THEN
    v_reason := 'ficha_missing';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_product_agents
    WHERE id = p_agent_id AND product_id = p_product_id
      AND is_active = true AND active_in_whatsapp = true
  ) THEN
    v_reason := 'owner_inactive';
  ELSIF p_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_crm_conversations
    WHERE id = p_conversation_id
      AND product_id = p_product_id
      AND lead_id = p_lead_id
      AND current_agent_id = p_agent_id
      AND status = 'bot_active'
  ) THEN
    v_reason := 'owner_mismatch';
  ELSIF p_instance_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_crm_wa_qr_instances
    WHERE id = p_instance_id AND product_id = p_product_id
      AND status = 'connected'
  ) THEN
    v_reason := 'provider_unhealthy';
  END IF;

  IF v_reason IS NULL THEN
    SELECT regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
      INTO v_phone_digits
    FROM public.platform_crm_leads
    WHERE id = p_lead_id;

    IF v_phone_digits = '' THEN
      v_reason := 'lead_no_phone';
    ELSIF v_phone_digits <> '' AND EXISTS (
      SELECT 1 FROM public.platform_crm_lead_optout
      WHERE product_id = p_product_id
        AND telefone_digits = v_phone_digits
    ) THEN
      v_reason := 'opted_out';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    v_local_time := now() AT TIME ZONE 'America/Sao_Paulo';
    IF extract(isodow FROM v_local_time) NOT BETWEEN 1 AND 5
       OR extract(hour FROM v_local_time) < 9
       OR extract(hour FROM v_local_time) >= 18 THEN
      v_reason := 'outside_window';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    SELECT
      count(*) FILTER (WHERE action_type = 'opening'),
      count(*) FILTER (WHERE action_type = 'followup'),
      count(*) FILTER (WHERE proactive AND created_at >= now() - interval '24 hours'),
      max(created_at) FILTER (WHERE proactive)
    INTO v_openings, v_followups, v_proactive_24h, v_last_proactive
    FROM public.platform_crm_agent_action_ledger
    WHERE product_id = p_product_id
      AND lead_id = p_lead_id
      AND status IN ('reserved', 'accepted', 'delivered', 'read')
      AND (status <> 'reserved' OR expires_at > now());

    IF p_action_type = 'opening' AND v_openings >= p_max_openings THEN
      v_reason := 'opening_cap';
    ELSIF p_action_type = 'followup' AND v_followups >= p_max_followups THEN
      v_reason := 'followup_cap';
    ELSIF p_proactive AND v_proactive_24h >= 1 THEN
      v_reason := 'proactive_daily_cap';
    ELSIF p_proactive
       AND v_last_proactive IS NOT NULL
       AND v_last_proactive > now() - interval '24 hours' THEN
      v_reason := 'proactive_interval';
    END IF;
  END IF;

  IF v_reason IS NULL AND p_conversation_id IS NOT NULL
     AND p_action_type IN ('opening', 'followup') THEN
    SELECT max(created_at) INTO v_last_outbound
    FROM public.platform_crm_messages
    WHERE conversation_id = p_conversation_id AND direction = 'outbound';
    SELECT EXISTS (
      SELECT 1 FROM public.platform_crm_messages
      WHERE conversation_id = p_conversation_id
        AND direction = 'inbound'
        AND sender_type = 'visitor'
        AND (v_last_outbound IS NULL OR created_at > v_last_outbound)
    ) INTO v_human_replied;
    IF v_human_replied THEN v_reason := 'human_replied'; END IF;
  END IF;

  v_policy := jsonb_build_object(
    'kernel_version', v_kernel_version,
    'release_state', v_release_state,
    'max_openings', p_max_openings,
    'max_followups', p_max_followups,
    'min_proactive_interval_hours', 24,
    'max_proactive_per_day', 1,
    'max_bubbles', 2
  );

  INSERT INTO public.platform_crm_agent_action_ledger (
    product_id, lead_id, conversation_id, agent_id, instance_id,
    strategy_version_id, experiment_id, idempotency_key,
    action_type, channel, proactive, bubble_count, content_hash,
    status, deny_reason, policy_snapshot, reserved_at, expires_at
  ) VALUES (
    p_product_id, p_lead_id, p_conversation_id, p_agent_id, p_instance_id,
    p_strategy_version_id, p_experiment_id, p_idempotency_key,
    p_action_type, p_channel, p_proactive, p_bubble_count, p_content_hash,
    CASE WHEN v_reason IS NULL THEN 'reserved' ELSE 'denied' END,
    v_reason, v_policy,
    CASE WHEN v_reason IS NULL THEN now() ELSE NULL END,
    CASE WHEN v_reason IS NULL THEN now() + interval '15 minutes' ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_id', v_id,
    'status', CASE WHEN v_reason IS NULL THEN 'reserved' ELSE 'denied' END,
    'allowed', v_reason IS NULL,
    'reason', v_reason,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pcrm_authorize_and_reserve_agent_action(
  text, uuid, uuid, uuid, uuid, uuid, text, text, boolean, integer, text, uuid, uuid
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_authorize_and_reserve_agent_action(
  text, uuid, uuid, uuid, uuid, uuid, text, text, boolean, integer, text, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.pcrm_transition_agent_action(
  p_action_id            uuid,
  p_expected_status      text,
  p_next_status          text,
  p_provider_message_id  text DEFAULT NULL,
  p_failure_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.platform_crm_agent_action_ledger%ROWTYPE;
BEGIN
  IF NOT (
    (p_expected_status = 'reserved' AND p_next_status IN ('accepted', 'failed', 'cancelled'))
    OR (p_expected_status = 'accepted' AND p_next_status IN ('delivered', 'failed'))
    OR (p_expected_status = 'delivered' AND p_next_status = 'read')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
  END IF;

  UPDATE public.platform_crm_agent_action_ledger
  SET status = p_next_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      failure_reason = CASE WHEN p_next_status = 'failed' THEN p_failure_reason ELSE failure_reason END,
      accepted_at = CASE WHEN p_next_status = 'accepted' THEN now() ELSE accepted_at END,
      delivered_at = CASE WHEN p_next_status = 'delivered' THEN now() ELSE delivered_at END,
      read_at = CASE WHEN p_next_status = 'read' THEN now() ELSE read_at END,
      failed_at = CASE WHEN p_next_status = 'failed' THEN now() ELSE failed_at END,
      cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE id = p_action_id AND status = p_expected_status
    AND (p_expected_status <> 'reserved' OR expires_at > now())
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'action_id', v_row.id, 'status', v_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.pcrm_transition_agent_action(uuid, text, text, text, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_transition_agent_action(uuid, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pcrm_cancel_pending_agent_actions(
  p_conversation_id uuid,
  p_inbound_message_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.platform_crm_agent_action_ledger
  SET status = 'cancelled',
      cancelled_at = now(),
      failure_reason = 'human_inbound:' || p_inbound_message_id::text
  WHERE conversation_id = p_conversation_id
    AND status = 'reserved';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pcrm_cancel_pending_agent_actions(uuid, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pcrm_cancel_pending_agent_actions(uuid, uuid)
  TO service_role;
