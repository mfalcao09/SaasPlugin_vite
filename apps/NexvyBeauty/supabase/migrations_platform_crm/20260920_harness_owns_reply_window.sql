-- Harness owns inbound reply (kill/release) and ALL attendance windows.
-- Ledger keeps DNC/opt-out/caps. Do not invent a second clock.

-- Harden: do_not_contact on conversation must deny even if status wrongly bot_active
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
AS $fn$
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
  v_opening_parts      integer := 0;
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
    IF v_existing.status = 'denied' THEN
      DELETE FROM public.platform_crm_agent_action_ledger WHERE id = v_existing.id;
    ELSE
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
  END IF;

  SELECT release_state, kill_switch, kernel_version
    INTO v_release_state, v_kill_switch, v_kernel_version
  FROM public.platform_crm_agent_release_controls
  WHERE product_id = p_product_id AND agent_id = p_agent_id
  FOR UPDATE;

  -- Inbound reply: Kill/OFF não cala reação. Proativo continua fail-closed.
  IF NOT (p_action_type = 'reply' AND COALESCE(p_proactive, false) = false) THEN
    IF NOT FOUND OR v_release_state = 'OFF' THEN
      v_reason := 'release_off';
    ELSIF v_release_state = 'SHADOW' THEN
      v_reason := 'shadow_no_provider';
    ELSIF v_kill_switch THEN
      v_reason := 'kill_switch';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
  IF p_action_type NOT IN ('opening', 'opening_part', 'followup', 'resume', 'reply') THEN
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
  ELSIF p_conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_crm_conversations
    WHERE id = p_conversation_id
      AND (metadata->>'do_not_contact') = 'true'
  ) THEN
    v_reason := 'do_not_contact';
  ELSIF p_instance_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_crm_wa_qr_instances
    WHERE id = p_instance_id AND product_id = p_product_id
      AND status = 'connected'
  ) THEN
    v_reason := 'provider_unhealthy';
  END IF;
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

  -- Janela vive no Harness (attendance-window.ts). Ledger não duplica relógio.

  IF v_reason IS NULL THEN
    SELECT
      count(*) FILTER (WHERE action_type = 'opening'),
      count(*) FILTER (WHERE action_type = 'followup'),
      count(*) FILTER (WHERE action_type = 'opening_part'),
      count(*) FILTER (WHERE proactive AND created_at >= now() - interval '24 hours'),
      max(created_at) FILTER (WHERE proactive)
    INTO v_openings, v_followups, v_opening_parts, v_proactive_24h, v_last_proactive
    FROM public.platform_crm_agent_action_ledger
    WHERE product_id = p_product_id
      AND lead_id = p_lead_id
      AND status IN ('reserved', 'accepted', 'delivered', 'read')
      AND (status <> 'reserved' OR expires_at > now());

    IF p_action_type = 'opening' AND v_openings >= p_max_openings THEN
      v_reason := 'opening_cap';
    ELSIF p_action_type = 'followup' AND v_followups >= p_max_followups THEN
      v_reason := 'followup_cap';
    ELSIF p_action_type = 'opening_part' THEN
      IF v_openings < 1 THEN
        v_reason := 'opening_part_without_opening';
      ELSIF v_opening_parts >= 3 THEN
        v_reason := 'opening_part_cap';
      END IF;
    ELSIF p_proactive AND v_proactive_24h >= 1 THEN
      v_reason := 'proactive_daily_cap';
    ELSIF p_proactive
       AND v_last_proactive IS NOT NULL
       AND v_last_proactive > now() - interval '24 hours' THEN
      v_reason := 'proactive_interval';
    END IF;
  END IF;

  IF v_reason IS NULL AND p_conversation_id IS NOT NULL
     AND p_action_type IN ('opening', 'opening_part', 'followup') THEN
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
    'max_bubbles', 2,
    'max_approach_span_seconds', 120
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
$fn$;
