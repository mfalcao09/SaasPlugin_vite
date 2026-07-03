--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager',
    'seller',
    'super_admin'
);


--
-- Name: interaction_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interaction_channel AS ENUM (
    'whatsapp',
    'email',
    'phone',
    'instagram',
    'telegram',
    'other'
);


--
-- Name: lead_temperature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_temperature AS ENUM (
    'hot',
    'warm',
    'cold'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'cadence',
    'urgency',
    'opportunity',
    'audit',
    'system'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'draft',
    'review',
    'published',
    'archived'
);


--
-- Name: sector_rotation_strategy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sector_rotation_strategy AS ENUM (
    'round_robin',
    'least_busy',
    'random'
);


--
-- Name: support_ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: support_ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'overdue'
);


--
-- Name: webchat_conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.webchat_conversation_status AS ENUM (
    'bot_active',
    'waiting_human',
    'human_active',
    'closed'
);


--
-- Name: accept_invitation(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invitation(invitation_token text, user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM team_invitations 
  WHERE token = invitation_token 
  AND status = 'pending' 
  AND expires_at > now();
  
  IF inv IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update profile with organization
  UPDATE profiles 
  SET organization_id = inv.organization_id 
  WHERE id = user_id;
  
  -- Add user role
  INSERT INTO user_roles (user_id, role)
  VALUES (user_id, inv.role)
  ON CONFLICT DO NOTHING;
  
  -- Add to squad if specified
  IF inv.squad_id IS NOT NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (inv.squad_id, user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Initialize permissions based on role
  PERFORM public.initialize_user_permissions(user_id, inv.organization_id, inv.role::text);
  
  -- Mark invitation as accepted
  UPDATE team_invitations 
  SET status = 'accepted' 
  WHERE id = inv.id;
  
  RETURN TRUE;
END;
$$;


--
-- Name: apply_tag_automations(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_tag_automations(p_lead_id uuid, p_event_type text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid) RETURNS TABLE(tag_id uuid, action text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid := p_organization_id;
  v_automation RECORD;
  v_tag_name text;
  v_inserted boolean;
  v_deleted integer;
BEGIN
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN RETURN; END IF;
  END IF;

  FOR v_automation IN
    SELECT ta.id, ta.tag_id_to_add, ta.tag_id_to_remove, ta.product_id
    FROM tag_automations ta
    WHERE ta.organization_id = v_org_id
      AND ta.event_type = p_event_type
      AND ta.is_active = true
      AND (ta.product_id IS NULL OR ta.product_id = p_product_id)
    ORDER BY ta.product_id NULLS LAST
  LOOP
    -- ADD
    INSERT INTO lead_tag_assignments (lead_id, tag_id, source, applied_by)
    VALUES (p_lead_id, v_automation.tag_id_to_add, 'automation', NULL)
    ON CONFLICT (lead_id, tag_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted::int > 0 THEN
      SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_add;
      INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
      VALUES (p_lead_id, v_org_id,
        format('Etiqueta "%s" aplicada automaticamente (evento: %s)', COALESCE(v_tag_name,'desconhecida'), p_event_type),
        'system', NULL);
      tag_id := v_automation.tag_id_to_add; action := 'added'; RETURN NEXT;
    END IF;

    -- REMOVE (ordem de exclusão)
    IF v_automation.tag_id_to_remove IS NOT NULL THEN
      DELETE FROM lead_tag_assignments
      WHERE lead_id = p_lead_id AND tag_id = v_automation.tag_id_to_remove;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_remove;
        INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
        VALUES (p_lead_id, v_org_id,
          format('Etiqueta "%s" removida automaticamente (evento: %s)', COALESCE(v_tag_name,'desconhecida'), p_event_type),
          'system', NULL);
        tag_id := v_automation.tag_id_to_remove; action := 'removed'; RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: booking_log_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.booking_log_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (booking_id, organization_id, from_status, to_status, source)
    VALUES (NEW.id, NEW.organization_id, NULL, NEW.status, 'system');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history (booking_id, organization_id, from_status, to_status, source)
    VALUES (NEW.id, NEW.organization_id, OLD.status, NEW.status, 'system');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: calculate_commission(uuid, numeric, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_commission(p_deal_id uuid, p_deal_value numeric, p_product_id uuid, p_seller_id uuid, p_organization_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rule RECORD;
  v_commission NUMERIC;
BEGIN
  -- Buscar regra específica do vendedor ou regra padrão
  SELECT * INTO v_rule
  FROM public.commission_rules
  WHERE product_id = p_product_id
    AND organization_id = p_organization_id
    AND is_active = true
    AND (user_id = p_seller_id OR (user_id IS NULL AND is_default = true))
  ORDER BY user_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calcular comissão baseado no tipo de regra
  IF v_rule.rule_type = 'percentage' THEN
    v_commission := p_deal_value * (v_rule.base_value / 100);
  ELSE
    v_commission := v_rule.base_value;
  END IF;

  -- Aplicar limites min/max
  IF v_rule.min_value IS NOT NULL AND v_commission < v_rule.min_value THEN
    v_commission := v_rule.min_value;
  END IF;
  
  IF v_rule.max_value IS NOT NULL AND v_commission > v_rule.max_value THEN
    v_commission := v_rule.max_value;
  END IF;

  -- Inserir registro de comissão
  INSERT INTO public.commissions (
    deal_id, user_id, product_id, organization_id, 
    amount, percentage_applied, rule_id, status
  ) VALUES (
    p_deal_id, p_seller_id, p_product_id, p_organization_id,
    v_commission, v_rule.base_value, v_rule.id, 'pending'
  );

  RETURN v_commission;
END;
$$;


--
-- Name: cancel_booking_by_token(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_booking_by_token(p_token text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_booking RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  SELECT id, calendar_event_id, status
    INTO v_booking
  FROM public.booking_requests
  WHERE confirmation_token = p_token
  LIMIT 1;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true);
  END IF;

  UPDATE public.booking_requests
     SET status = 'cancelled',
         cancellation_reason = p_reason
   WHERE id = v_booking.id;

  IF v_booking.calendar_event_id IS NOT NULL THEN
    UPDATE public.calendar_events
       SET status = 'cancelled'
     WHERE id = v_booking.calendar_event_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_booking.id);
END;
$$;


--
-- Name: claim_first_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_first_super_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;


--
-- Name: create_product_tag_package(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product_tag_package(p_organization_id uuid, p_product_id uuid, p_product_label text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_specs jsonb := jsonb_build_array(
    jsonb_build_object('event','pix_gerado',          'name','PIX Gerado',          'color','#EAB308', 'lifecycle', true),
    jsonb_build_object('event','boleto_gerado',       'name','Boleto Gerado',       'color','#3B82F6', 'lifecycle', true),
    jsonb_build_object('event','pix_gerado',          'name','Aguardando Pagamento','color','#F97316', 'lifecycle', true, 'also_event','boleto_gerado'),
    jsonb_build_object('event','checkout_abandonado', 'name','Checkout Abandonado', 'color','#6B7280', 'lifecycle', true),
    jsonb_build_object('event','compra_aprovada',     'name','Cliente',             'color','#22C55E', 'lifecycle', false),
    jsonb_build_object('event','reembolso',           'name','Reembolso',           'color','#EF4444', 'lifecycle', false)
  );
  v_spec jsonb;
  v_tag_id uuid;
  v_full_name text;
  v_created jsonb := '[]'::jsonb;
  v_tag_pix uuid; v_tag_boleto uuid; v_tag_aguardando uuid;
  v_tag_abandonado uuid; v_tag_cliente uuid; v_tag_reembolso uuid;
BEGIN
  IF p_organization_id IS NULL OR p_product_id IS NULL OR p_product_label IS NULL THEN
    RAISE EXCEPTION 'organization_id, product_id e product_label são obrigatórios';
  END IF;

  FOR v_spec IN SELECT * FROM jsonb_array_elements(v_specs)
  LOOP
    v_full_name := (v_spec->>'name') || ' · ' || p_product_label;

    SELECT id INTO v_tag_id FROM lead_tags
    WHERE organization_id = p_organization_id AND name = v_full_name LIMIT 1;

    IF v_tag_id IS NULL THEN
      INSERT INTO lead_tags (organization_id, name, color, is_automatic, is_lifecycle_status)
      VALUES (p_organization_id, v_full_name, v_spec->>'color', true, (v_spec->>'lifecycle')::boolean)
      RETURNING id INTO v_tag_id;
    ELSE
      UPDATE lead_tags SET is_lifecycle_status = (v_spec->>'lifecycle')::boolean WHERE id = v_tag_id;
    END IF;

    -- Guarda referência por papel
    IF v_spec->>'name' = 'PIX Gerado' THEN v_tag_pix := v_tag_id;
    ELSIF v_spec->>'name' = 'Boleto Gerado' THEN v_tag_boleto := v_tag_id;
    ELSIF v_spec->>'name' = 'Aguardando Pagamento' THEN v_tag_aguardando := v_tag_id;
    ELSIF v_spec->>'name' = 'Checkout Abandonado' THEN v_tag_abandonado := v_tag_id;
    ELSIF v_spec->>'name' = 'Cliente' THEN v_tag_cliente := v_tag_id;
    ELSIF v_spec->>'name' = 'Reembolso' THEN v_tag_reembolso := v_tag_id;
    END IF;

    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
    SELECT p_organization_id, p_product_id, v_spec->>'event', v_tag_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM tag_automations
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = v_spec->>'event' AND tag_id_to_add = v_tag_id
    );

    IF v_spec ? 'also_event' THEN
      INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
      SELECT p_organization_id, p_product_id, v_spec->>'also_event', v_tag_id, true
      WHERE NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id AND product_id = p_product_id
          AND event_type = v_spec->>'also_event' AND tag_id_to_add = v_tag_id
      );
    END IF;

    v_created := v_created || jsonb_build_object('tag_id', v_tag_id, 'name', v_full_name);
  END LOOP;

  -- ORDEM DE EXCLUSÃO:
  -- compra_aprovada (Cliente) remove transitórias
  IF v_tag_cliente IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_pix
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = 'compra_aprovada' AND tag_id_to_add = v_tag_cliente
        AND tag_id_to_remove IS NULL;
  END IF;

  -- pix_gerado remove "Checkout Abandonado" via a tag "Aguardando Pagamento"
  IF v_tag_aguardando IS NOT NULL AND v_tag_abandonado IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_abandonado
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type IN ('pix_gerado','boleto_gerado') AND tag_id_to_add = v_tag_aguardando
        AND tag_id_to_remove IS NULL;
  END IF;

  -- reembolso remove Cliente
  IF v_tag_reembolso IS NOT NULL AND v_tag_cliente IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_cliente
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = 'reembolso' AND tag_id_to_add = v_tag_reembolso
        AND tag_id_to_remove IS NULL;
  END IF;

  -- Cliente também remove Boleto, PIX e Aguardando — precisamos de regras adicionais
  -- (tag_automations só tem 1 tag_id_to_remove por linha → criamos linhas extras com tag_id_to_add = Cliente)
  IF v_tag_cliente IS NOT NULL THEN
    -- helper inline: inserir limpezas adicionais como regras independentes
    -- usamos a própria tag Cliente como tag_id_to_add (ON CONFLICT lead_id,tag_id ignora duplicatas no apply)
    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, tag_id_to_remove, is_active)
    SELECT p_organization_id, p_product_id, 'compra_aprovada', v_tag_cliente, t, true
    FROM (VALUES (v_tag_boleto), (v_tag_aguardando), (v_tag_abandonado)) AS x(t)
    WHERE t IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id AND product_id = p_product_id
          AND event_type = 'compra_aprovada' AND tag_id_to_add = v_tag_cliente
          AND tag_id_to_remove = x.t
      );
  END IF;

  RETURN jsonb_build_object('ok', true, 'tags', v_created);
END;
$$;


--
-- Name: delete_email(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_email(queue_name text, message_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;


--
-- Name: delete_lead_cascade(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_lead_cascade(_lead_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _caller uuid := auth.uid();
  _conv_ids uuid[];
  _deleted_count int := 0;
  _lead record;
  _phone_norm text;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR _lead IN SELECT id, organization_id, phone FROM public.leads WHERE id = ANY(_lead_ids)
  LOOP
    IF NOT (
      public.has_role(_caller, 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _caller AND p.organization_id = _lead.organization_id
      )
    ) THEN
      CONTINUE;
    END IF;

    _phone_norm := public.normalize_phone_br(_lead.phone);

    -- coleta conversas vinculadas pelo lead OU pelo telefone normalizado (qualquer status)
    SELECT array_agg(DISTINCT id) INTO _conv_ids
    FROM public.webchat_conversations
    WHERE organization_id = _lead.organization_id
      AND (
        lead_id = _lead.id
        OR (_phone_norm IS NOT NULL AND _phone_norm <> '' AND visitor_phone_normalized = _phone_norm)
      );

    IF _conv_ids IS NOT NULL THEN
      DELETE FROM public.webchat_messages WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.scheduled_messages WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.orchestration_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_activation_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_tool_executions WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_action_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_outreach_queue WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_response_feedback WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.payment_links WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.cakto_recovery_dispatches WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.lead_semantic_memory WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.webchat_assignment_events WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.message_reactions WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_quality_evaluations WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.conversation_transfers WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.conversation_notes WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_handoff_history WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.webchat_conversations WHERE id = ANY(_conv_ids);
    END IF;

    DELETE FROM public.agent_action_logs WHERE lead_id = _lead.id;
    DELETE FROM public.agent_activation_logs WHERE lead_id = _lead.id;
    DELETE FROM public.agent_handoff_history WHERE lead_id = _lead.id;
    DELETE FROM public.agent_tool_executions WHERE lead_id = _lead.id;
    DELETE FROM public.ai_outreach_queue WHERE lead_id = _lead.id;
    DELETE FROM public.ai_quality_evaluations WHERE lead_id = _lead.id;
    DELETE FROM public.booking_requests WHERE lead_id = _lead.id;
    DELETE FROM public.cakto_orders WHERE lead_id = _lead.id;
    DELETE FROM public.cakto_recovery_dispatches WHERE lead_id = _lead.id;
    DELETE FROM public.calendar_events WHERE lead_id = _lead.id;
    DELETE FROM public.deals WHERE lead_id = _lead.id;
    DELETE FROM public.facebook_lead_logs WHERE lead_id = _lead.id;
    DELETE FROM public.form_submissions WHERE lead_id = _lead.id;
    DELETE FROM public.funnel_webhook_logs WHERE lead_id = _lead.id;
    DELETE FROM public.interactions WHERE lead_id = _lead.id;
    DELETE FROM public.lead_notes WHERE lead_id = _lead.id;
    DELETE FROM public.lead_queue WHERE lead_id = _lead.id;
    DELETE FROM public.lead_semantic_memory WHERE lead_id = _lead.id;
    DELETE FROM public.lead_stage_history WHERE lead_id = _lead.id;
    DELETE FROM public.lead_tag_assignments WHERE lead_id = _lead.id;
    DELETE FROM public.lead_transfer_history WHERE lead_id = _lead.id;
    DELETE FROM public.orchestration_logs WHERE lead_id = _lead.id;
    DELETE FROM public.payment_links WHERE lead_id = _lead.id;
    DELETE FROM public.post_sale_event_logs WHERE lead_id = _lead.id;
    DELETE FROM public.post_sale_scheduled_runs WHERE lead_id = _lead.id;
    DELETE FROM public.tasks WHERE lead_id = _lead.id;
    DELETE FROM public.webhook_logs WHERE lead_id = _lead.id;

    DELETE FROM public.leads WHERE id = _lead.id;
    _deleted_count := _deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', _deleted_count);
END;
$$;


--
-- Name: delete_product_safe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_product_safe(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- 1. Deletar atribuições de usuário ao produto
  DELETE FROM public.user_product_assignments WHERE product_id = p_product_id;

  -- 2. Nullify product_id em tabelas que aceitam NULL
  UPDATE public.leads SET product_id = NULL, current_stage_id = NULL WHERE product_id = p_product_id;
  UPDATE public.tasks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.calendar_events SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.lead_queue SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.sales_squads SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webchat_agent_configs SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.agent_training_materials SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webhooks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.notifications SET product_id = NULL WHERE product_id = p_product_id;

  -- 3. Deletar o produto (as outras tabelas têm ON DELETE CASCADE)
  DELETE FROM public.products WHERE id = p_product_id;
END;
$$;


--
-- Name: delete_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_team_member(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.user_product_assignments WHERE user_id = p_user_id;
  DELETE FROM public.squad_members WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = p_user_id;
  UPDATE public.deals SET seller_id = NULL WHERE seller_id = p_user_id;

  DELETE FROM public.user_status WHERE user_id = p_user_id;
  DELETE FROM public.availability_overrides WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;

  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;


--
-- Name: distribute_lead(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.distribute_lead(p_lead_id uuid, p_squad_id uuid, p_organization_id uuid, p_product_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_config RECORD;
  v_assigned_user_id uuid;
  v_members uuid[];
  v_idx integer;
BEGIN
  -- Get distribution config for this squad
  SELECT * INTO v_config
  FROM distribution_config
  WHERE squad_id = p_squad_id AND organization_id = p_organization_id;

  -- Default to round_robin if no config
  IF NOT FOUND THEN
    INSERT INTO distribution_config (organization_id, squad_id, method)
    VALUES (p_organization_id, p_squad_id, 'round_robin')
    RETURNING * INTO v_config;
  END IF;

  -- Get online members of this squad (SEM filtro de organization_id no user_status)
  -- O filtro por squad_id já garante que são membros da organização correta
  SELECT ARRAY_AGG(sm.user_id ORDER BY sm.user_id) INTO v_members
  FROM squad_members sm
  JOIN user_status us ON us.user_id = sm.user_id
  WHERE sm.squad_id = p_squad_id
    AND us.status = 'online';

  -- No online members? Queue the lead
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
    VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
    ON CONFLICT (lead_id) DO NOTHING;
    RETURN NULL;
  END IF;

  -- Apply distribution method
  IF v_config.method = 'round_robin' THEN
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;

  ELSIF v_config.method = 'least_busy' THEN
    SELECT us.user_id INTO v_assigned_user_id
    FROM user_status us
    WHERE us.user_id = ANY(v_members) AND us.status = 'online'
    ORDER BY us.active_leads_count ASC
    LIMIT 1;

  ELSE -- performance or fallback
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;
  END IF;

  -- Assign lead
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE leads SET assigned_to = v_assigned_user_id WHERE id = p_lead_id;
    -- Increment active leads count (trigger will also do it, so use GREATEST to avoid double)
    -- Actually the trigger handles it, so just update lead
    RETURN v_assigned_user_id;
  END IF;

  -- Fallback: queue
  INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
  VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NULL;
END;
$$;


--
-- Name: enforce_single_attendant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_single_attendant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Humano definido (ou trocado) → IA sai
  IF NEW.assigned_user_id IS NOT NULL
     AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    NEW.current_agent_id := NULL;
  -- IA definida (ou trocada) e humano não foi alterado nesta operação → humano sai
  ELSIF NEW.current_agent_id IS NOT NULL
     AND NEW.current_agent_id IS DISTINCT FROM OLD.current_agent_id THEN
    NEW.assigned_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enqueue_email(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_email(queue_name text, payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;


--
-- Name: ensure_first_user_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_first_user_is_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  has_admin_in_org boolean;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.organization_id = NEW.organization_id
      AND ur.role = 'admin'::app_role
      AND p.id <> NEW.id
  ) INTO has_admin_in_org;

  IF NOT has_admin_in_org THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: ensure_org_owner_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_org_owner_is_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: evaluate_routing_rules(uuid, uuid, uuid, uuid[], uuid, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_routing_rules(p_organization_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_product_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_event text DEFAULT NULL::text, p_deal_value numeric DEFAULT NULL::numeric) RETURNS TABLE(rule_id uuid, specialist_id uuid, agent_id uuid, role text, display_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS rule_id,
    s.id AS specialist_id,
    s.agent_id,
    s.role,
    s.display_name
  FROM public.agent_routing_rules r
  JOIN public.agent_specialists s ON s.id = r.target_specialist_id
  WHERE r.organization_id = p_organization_id
    AND r.is_active = true
    AND s.is_active = true
    AND (r.match_stage_ids IS NULL OR p_stage_id = ANY(r.match_stage_ids))
    AND (r.match_tag_ids IS NULL OR r.match_tag_ids && COALESCE(p_tag_ids, ARRAY[]::UUID[]))
    AND (r.match_product_ids IS NULL OR p_product_id = ANY(r.match_product_ids))
    AND (r.match_channels IS NULL OR p_channel = ANY(r.match_channels))
    AND (r.match_events IS NULL OR p_event = ANY(r.match_events))
    AND (r.deal_value_min IS NULL OR COALESCE(p_deal_value, 0) >= r.deal_value_min)
    AND (r.deal_value_max IS NULL OR COALESCE(p_deal_value, 0) <= r.deal_value_max)
  ORDER BY r.priority ASC, s.priority ASC
  LIMIT 1;
END;
$$;


--
-- Name: fill_default_sector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_default_sector() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sec uuid;
BEGIN
  IF NEW.sector_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    -- Tenta achar setor padrão da org (mais antigo)
    SELECT id INTO v_sec
    FROM public.sectors
    WHERE organization_id = NEW.organization_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_sec IS NOT NULL THEN
      NEW.sector_id := v_sec;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_auth_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_user_id_by_email(_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1
$$;


--
-- Name: get_booking_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_booking_by_token(p_token text) RETURNS TABLE(id uuid, guest_name text, guest_email text, guest_phone text, start_time timestamp with time zone, end_time timestamp with time zone, timezone text, status text, confirmation_token text, additional_info jsonb, created_at timestamp with time zone, event_type_id uuid, host_user_id uuid, calendar_event_id uuid, organization_id uuid, cancellation_reason text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    br.id,
    br.guest_name,
    br.guest_email,
    br.guest_phone,
    br.start_time,
    br.end_time,
    br.timezone,
    br.status::text,
    br.confirmation_token,
    br.additional_info,
    br.created_at,
    br.event_type_id,
    br.host_user_id,
    br.calendar_event_id,
    br.organization_id,
    br.cancellation_reason
  FROM public.booking_requests br
  WHERE p_token IS NOT NULL
    AND length(p_token) >= 16
    AND br.confirmation_token = p_token
  LIMIT 1;
$$;


--
-- Name: get_invitation_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invitation_by_token(p_token text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', ti.id,
    'email', ti.email,
    'role', ti.role,
    'squad_id', ti.squad_id,
    'organization_id', ti.organization_id,
    'token', ti.token,
    'status', ti.status,
    'expires_at', ti.expires_at,
    'created_at', ti.created_at,
    'squad', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color) END,
    'organization', CASE WHEN o.id IS NOT NULL THEN jsonb_build_object('id', o.id, 'name', o.name, 'logo_url', o.logo_url) END
  )
  INTO v_row
  FROM public.team_invitations ti
  LEFT JOIN public.sales_squads s ON s.id = ti.squad_id
  LEFT JOIN public.organizations o ON o.id = ti.organization_id
  WHERE ti.token = p_token
    AND ti.status = 'pending'
    AND ti.expires_at > now()
  LIMIT 1;

  RETURN v_row;
END;
$$;


--
-- Name: get_organization_effective_limits(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_organization_effective_limits(p_org_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org RECORD;
  v_plan RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_org.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.platform_plans WHERE id = v_org.plan_id;
  END IF;

  v_result := jsonb_build_object(
    'plan_id', v_org.plan_id,
    'plan_name', COALESCE(v_plan.name, 'Personalizado'),
    'plan_slug', COALESCE(v_plan.slug, 'custom'),
    'limits', jsonb_build_object(
      'max_users', COALESCE(v_org.max_users, v_plan.max_users, 5),
      'max_connections', COALESCE(v_org.max_connections, v_plan.max_connections, 1),
      'max_sectors', COALESCE(v_plan.max_sectors, 3),
      'max_products', COALESCE(v_org.max_products, v_plan.max_products, 5),
      'max_contacts', COALESCE(v_plan.max_contacts, 1000),
      'max_messages_month', COALESCE(v_plan.max_messages_month, 5000),
      'max_ai_tokens_month', COALESCE(v_plan.max_ai_tokens_month, 100000)
    ),
    'features', COALESCE(v_org.features, '{}'::jsonb) || jsonb_build_object(
      'whatsapp', COALESCE(v_plan.feature_whatsapp, true),
      'facebook', COALESCE(v_plan.feature_facebook, false),
      'instagram', COALESCE(v_plan.feature_instagram, false),
      'campaigns', COALESCE(v_plan.feature_campaigns, false),
      'scheduling', COALESCE(v_plan.feature_scheduling, true),
      'internal_chat', COALESCE(v_plan.feature_internal_chat, true),
      'external_api', COALESCE(v_plan.feature_external_api, false),
      'kanban', COALESCE(v_plan.feature_kanban, true),
      'pipeline', COALESCE(v_plan.feature_pipeline, true),
      'integrations', COALESCE(v_plan.feature_integrations, false),
      'audio_transcription_ai', COALESCE(v_plan.feature_audio_transcription_ai, false),
      'text_correction_ai', COALESCE(v_plan.feature_text_correction_ai, false),
      'ai_agents', COALESCE(v_plan.feature_ai_agents, false),
      'voice_agents', COALESCE(v_plan.feature_voice_agents, false),
      'outreach', COALESCE(v_plan.feature_outreach, false),
      'capture_funnels', COALESCE(v_plan.feature_capture_funnels, false),
      'forms', COALESCE(v_plan.feature_forms, true),
      'webhooks', COALESCE(v_plan.feature_webhooks, false)
    ) || COALESCE(v_plan.extra_features, '{}'::jsonb)
  );

  RETURN v_result;
END;
$$;


--
-- Name: get_product_performance(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_performance(p_org_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH filtered AS (
    SELECT co.*
    FROM cakto_orders co
    WHERE co.organization_id = p_org_id
      AND (p_from IS NULL OR co.created_at_cakto >= p_from)
      AND (p_to IS NULL OR co.created_at_cakto <= p_to)
  ),
  by_product AS (
    SELECT
      f.product_id,
      p.name AS product_name,
      p.suite_id,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE f.status IN ('pending','waiting_payment')) AS pending_count,
      COUNT(*) FILTER (WHERE f.status = 'refunded') AS refunded_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue,
      COALESCE(AVG(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS avg_ticket
    FROM filtered f
    LEFT JOIN products p ON p.id = f.product_id
    GROUP BY f.product_id, p.name, p.suite_id
  ),
  by_role AS (
    SELECT
      f.product_id,
      COALESCE(po.role, 'unmapped') AS role,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue
    FROM filtered f
    LEFT JOIN product_offers po ON po.id = f.offer_id
    GROUP BY f.product_id, COALESCE(po.role, 'unmapped')
  )
  SELECT jsonb_build_object(
    'products', COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id', bp.product_id,
        'product_name', bp.product_name,
        'suite_id', bp.suite_id,
        'paid_count', bp.paid_count,
        'pending_count', bp.pending_count,
        'refunded_count', bp.refunded_count,
        'revenue', bp.revenue,
        'avg_ticket', bp.avg_ticket,
        'roles', (
          SELECT jsonb_agg(jsonb_build_object('role', br.role, 'paid_count', br.paid_count, 'revenue', br.revenue))
          FROM by_role br WHERE br.product_id IS NOT DISTINCT FROM bp.product_id
        )
      )
    ), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(amount) FILTER (WHERE status='paid'),0),
        'paid_count', COUNT(*) FILTER (WHERE status='paid'),
        'pending_count', COUNT(*) FILTER (WHERE status IN ('pending','waiting_payment')),
        'refunded_count', COUNT(*) FILTER (WHERE status='refunded'),
        'avg_ticket', COALESCE(AVG(amount) FILTER (WHERE status='paid'),0)
      )
      FROM filtered
    )
  ) INTO v_result
  FROM by_product bp;

  RETURN v_result;
END;
$$;


--
-- Name: get_user_organization(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_organization(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT organization_id
    FROM public.profiles
    WHERE id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'seller'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;


--
-- Name: has_sector_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_sector_access(_user_id uuid, _sector_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sector_members
    WHERE sector_id = _sector_id AND user_id = _user_id
  );
$$;


--
-- Name: inbox_count_conversations(uuid, uuid[], boolean, uuid[], boolean, uuid[], boolean, uuid[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inbox_count_conversations(p_user_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[], p_include_no_product boolean DEFAULT false, p_sector_ids uuid[] DEFAULT NULL::uuid[], p_include_no_sector boolean DEFAULT false, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_include_unassigned boolean DEFAULT false, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_channel text DEFAULT NULL::text, p_search text DEFAULT NULL::text) RETURNS TABLE(attending bigint, waiting bigint, resolved bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_is_super_admin boolean;
  v_is_admin boolean;
  v_perm_queue boolean := false;
  v_perm_other_users boolean := false;
  v_perm_other_queues boolean := false;
  v_perm_unassigned_sector boolean := false;
  v_user_sectors uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT pr.organization_id INTO v_org_id FROM public.profiles pr WHERE pr.id = p_user_id;

  v_is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'super_admin'::app_role
  );
  v_is_admin := v_is_super_admin OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'admin'::app_role
  );

  IF v_org_id IS NULL AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT v_is_admin THEN
    SELECT
      COALESCE(up.view_queue_conversations, false),
      COALESCE(up.view_other_users_conversations, false),
      COALESCE(up.view_other_queues_conversations, false),
      COALESCE(up.view_unassigned_sector_tickets, false)
    INTO v_perm_queue, v_perm_other_users, v_perm_other_queues, v_perm_unassigned_sector
    FROM public.user_permissions up WHERE up.user_id = p_user_id LIMIT 1;

    SELECT COALESCE(array_agg(sm.sector_id), ARRAY[]::uuid[]) INTO v_user_sectors
    FROM public.sector_members sm WHERE sm.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.status, c.id
    FROM public.webchat_conversations c
    LEFT JOIN public.leads l           ON l.id = c.lead_id
    LEFT JOIN public.webchat_widgets w ON w.id = c.widget_id
    WHERE
      (v_org_id IS NULL OR c.organization_id = v_org_id)
      AND (p_channel IS NULL OR c.channel = p_channel)
      AND (
        v_is_admin
        OR c.assigned_user_id = p_user_id
        OR (c.sector_id IS NULL AND v_perm_unassigned_sector)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NULL AND v_perm_queue)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NOT NULL AND v_perm_other_users)
        OR (c.sector_id IS NOT NULL AND NOT (c.sector_id = ANY(v_user_sectors)) AND v_perm_other_queues)
      )
      AND (
        (p_product_ids IS NULL AND NOT p_include_no_product)
        OR (p_include_no_product AND COALESCE(c.product_id, l.product_id, w.product_id) IS NULL)
        OR (p_product_ids IS NOT NULL AND COALESCE(c.product_id, l.product_id, w.product_id) = ANY(p_product_ids))
      )
      AND (
        (p_sector_ids IS NULL AND NOT p_include_no_sector)
        OR (p_include_no_sector AND c.sector_id IS NULL)
        OR (p_sector_ids IS NOT NULL AND c.sector_id = ANY(p_sector_ids))
      )
      AND (
        (p_assigned_user_ids IS NULL AND NOT p_include_unassigned)
        OR (p_include_unassigned AND c.assigned_user_id IS NULL)
        OR (p_assigned_user_ids IS NOT NULL AND c.assigned_user_id = ANY(p_assigned_user_ids))
      )
      AND (
        p_tag_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM public.lead_tag_assignments lta
          WHERE lta.lead_id = c.lead_id AND lta.tag_id = ANY(p_tag_ids)
        )
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR c.visitor_name  ILIKE '%' || p_search || '%'
        OR c.visitor_email ILIKE '%' || p_search || '%'
        OR c.visitor_phone ILIKE '%' || p_search || '%'
        OR l.name          ILIKE '%' || p_search || '%'
        OR l.email         ILIKE '%' || p_search || '%'
        OR l.phone         ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    COUNT(*) FILTER (WHERE status = 'human_active')::bigint AS attending,
    COUNT(*) FILTER (WHERE status IN ('waiting_human','bot_active'))::bigint AS waiting,
    COUNT(*) FILTER (WHERE status = 'closed')::bigint AS resolved
  FROM base;
END;
$$;


--
-- Name: inbox_list_conversations(uuid, text, uuid[], boolean, uuid[], boolean, uuid[], boolean, uuid[], text, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inbox_list_conversations(p_user_id uuid, p_tab text DEFAULT 'attending'::text, p_product_ids uuid[] DEFAULT NULL::uuid[], p_include_no_product boolean DEFAULT false, p_sector_ids uuid[] DEFAULT NULL::uuid[], p_include_no_sector boolean DEFAULT false, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_include_unassigned boolean DEFAULT false, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_channel text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_cursor_last_message_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, organization_id uuid, widget_id uuid, visitor_id text, lead_id uuid, product_id uuid, effective_product_id uuid, effective_product_name text, assigned_user_id uuid, assigned_user_name text, assigned_user_avatar text, current_agent_id uuid, current_agent_name text, current_agent_avatar text, sector_id uuid, sector_name text, sector_color text, evolution_instance_id uuid, status text, channel text, needs_human boolean, last_message_at timestamp with time zone, unread_count_agents integer, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone, visitor_name text, visitor_email text, visitor_phone text, visitor_avatar_url text, visitor_whatsapp text, accepted_at timestamp with time zone, accepted_by uuid, widget_name text, widget_primary_color text, widget_product_id uuid, lead_name text, lead_email text, lead_phone text, lead_product_id uuid, last_message_content text, last_message_metadata jsonb, last_message_sender_type text, last_message_created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_is_super_admin boolean;
  v_is_admin boolean;
  v_perm_queue boolean := false;
  v_perm_other_users boolean := false;
  v_perm_other_queues boolean := false;
  v_perm_unassigned_sector boolean := false;
  v_user_sectors uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT pr.organization_id INTO v_org_id
    FROM public.profiles pr WHERE pr.id = p_user_id;

  v_is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'super_admin'::app_role
  );
  v_is_admin := v_is_super_admin OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'admin'::app_role
  );

  IF v_org_id IS NULL AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT v_is_admin THEN
    SELECT
      COALESCE(up.view_queue_conversations, false),
      COALESCE(up.view_other_users_conversations, false),
      COALESCE(up.view_other_queues_conversations, false),
      COALESCE(up.view_unassigned_sector_tickets, false)
    INTO v_perm_queue, v_perm_other_users, v_perm_other_queues, v_perm_unassigned_sector
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
    LIMIT 1;

    SELECT COALESCE(array_agg(sm.sector_id), ARRAY[]::uuid[]) INTO v_user_sectors
    FROM public.sector_members sm WHERE sm.user_id = p_user_id;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.organization_id, c.widget_id, c.visitor_id::text, c.lead_id, c.product_id,
    COALESCE(c.product_id, l.product_id, w.product_id) AS effective_product_id,
    prd.name::text AS effective_product_name,
    c.assigned_user_id, pa.full_name::text AS assigned_user_name, pa.avatar_url::text AS assigned_user_avatar,
    c.current_agent_id, ag.name::text AS current_agent_name, ag.avatar_url::text AS current_agent_avatar,
    c.sector_id, sec.name::text AS sector_name, sec.color::text AS sector_color,
    c.evolution_instance_id, c.status::text, c.channel::text, c.needs_human,
    c.last_message_at, c.unread_count_agents,
    c.created_at, c.updated_at, c.closed_at,
    c.visitor_name::text, c.visitor_email::text, c.visitor_phone::text,
    c.visitor_avatar_url::text, c.visitor_whatsapp::text,
    c.accepted_at, c.accepted_by,
    w.name::text AS widget_name, w.primary_color::text AS widget_primary_color, w.product_id AS widget_product_id,
    l.name::text AS lead_name, l.email::text AS lead_email, l.phone::text AS lead_phone, l.product_id AS lead_product_id,
    c.last_message_content::text, c.last_message_metadata, c.last_message_sender_type::text, c.last_message_created_at
  FROM public.webchat_conversations c
  LEFT JOIN public.leads l            ON l.id = c.lead_id
  LEFT JOIN public.webchat_widgets w  ON w.id = c.widget_id
  LEFT JOIN public.profiles pa        ON pa.id = c.assigned_user_id
  LEFT JOIN public.product_agents ag  ON ag.id = c.current_agent_id
  LEFT JOIN public.sectors sec        ON sec.id = c.sector_id
  LEFT JOIN public.products prd       ON prd.id = COALESCE(c.product_id, l.product_id, w.product_id)
  WHERE
    (v_org_id IS NULL OR c.organization_id = v_org_id)
    AND (
      p_tab = 'all'
      OR (p_tab = 'attending' AND c.status = 'human_active')
      OR (p_tab = 'waiting'   AND c.status IN ('waiting_human','bot_active'))
      OR (p_tab = 'resolved'  AND c.status = 'closed')
    )
    AND (p_channel IS NULL OR c.channel = p_channel)
    AND (p_cursor_last_message_at IS NULL OR c.last_message_at < p_cursor_last_message_at)
    AND (
      v_is_admin
      OR c.assigned_user_id = p_user_id
      OR (c.sector_id IS NULL AND v_perm_unassigned_sector)
      OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NULL AND v_perm_queue)
      OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NOT NULL AND v_perm_other_users)
      OR (c.sector_id IS NOT NULL AND NOT (c.sector_id = ANY(v_user_sectors)) AND v_perm_other_queues)
    )
    AND (
      (p_product_ids IS NULL AND NOT p_include_no_product)
      OR (p_include_no_product AND COALESCE(c.product_id, l.product_id, w.product_id) IS NULL)
      OR (p_product_ids IS NOT NULL AND COALESCE(c.product_id, l.product_id, w.product_id) = ANY(p_product_ids))
    )
    AND (
      (p_sector_ids IS NULL AND NOT p_include_no_sector)
      OR (p_include_no_sector AND c.sector_id IS NULL)
      OR (p_sector_ids IS NOT NULL AND c.sector_id = ANY(p_sector_ids))
    )
    AND (
      (p_assigned_user_ids IS NULL AND NOT p_include_unassigned)
      OR (p_include_unassigned AND c.assigned_user_id IS NULL)
      OR (p_assigned_user_ids IS NOT NULL AND c.assigned_user_id = ANY(p_assigned_user_ids))
    )
    AND (
      p_tag_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM public.lead_tag_assignments lta
        WHERE lta.lead_id = c.lead_id AND lta.tag_id = ANY(p_tag_ids)
      )
    )
    AND (
      p_search IS NULL OR p_search = ''
      OR c.visitor_name  ILIKE '%' || p_search || '%'
      OR c.visitor_email ILIKE '%' || p_search || '%'
      OR c.visitor_phone ILIKE '%' || p_search || '%'
      OR l.name          ILIKE '%' || p_search || '%'
      OR l.email         ILIKE '%' || p_search || '%'
      OR l.phone         ILIKE '%' || p_search || '%'
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;


--
-- Name: increment_form_submissions_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_form_submissions_count(p_form_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE forms SET submissions_count = submissions_count + 1 WHERE id = p_form_id;
END;
$$;


--
-- Name: increment_form_views(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_form_views(p_form_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE forms SET views_count = views_count + 1 WHERE id = p_form_id;
END;
$$;


--
-- Name: increment_funnel_leads(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_funnel_leads(p_funnel_id uuid, p_channel text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_leads = total_leads + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, leads_created, completions)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET 
    leads_created = funnel_analytics.leads_created + 1,
    completions = funnel_analytics.completions + 1;
END;
$$;


--
-- Name: increment_funnel_views(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_funnel_views(p_funnel_id uuid, p_channel text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_views = total_views + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, views)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET views = funnel_analytics.views + 1;
END;
$$;


--
-- Name: increment_webhook_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_webhook_requests(p_webhook_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE webhooks 
  SET 
    requests_count = requests_count + 1,
    requests_this_month = requests_this_month + 1,
    last_request_at = now()
  WHERE id = p_webhook_id;
END;
$$;


--
-- Name: initialize_user_permissions(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.initialize_user_permissions(p_user_id uuid, p_organization_id uuid, p_role text DEFAULT 'seller'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_permissions (user_id, organization_id,
    view_queue_conversations, view_other_users_conversations, view_other_queues_conversations,
    allow_close_pending_tickets, view_all_contacts, allow_pipeline,
    allow_manage_client_portfolio, view_all_kanban_cards, view_all_schedules,
    allow_dashboard, allow_inbox_panel, allow_groups, allow_connection_actions,
    view_unassigned_sector_tickets, view_schedules_mode)
  VALUES (
    p_user_id, p_organization_id,
    -- view_queue_conversations: TODOS por padrão (vendedor precisa ver a fila do seu setor)
    true,
    -- view_other_users_conversations: somente admin/manager
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    -- view_other_queues_conversations: somente admin/manager
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    -- allow_close_pending_tickets: somente admin/manager
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role = 'admin' THEN true ELSE false END,
    -- view_unassigned_sector_tickets: somente admin/manager (continua restrito)
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN 'all' ELSE 'mine_only' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_notification_settings (user_id, organization_id)
  VALUES (p_user_id, p_organization_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;


--
-- Name: is_system_initialized(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_system_initialized() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role)
$$;


--
-- Name: is_within_business_hours(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_within_business_hours(p_org_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_config RECORD;
  v_now TIMESTAMPTZ := now();
  v_local_time TIME;
  v_local_date DATE;
  v_dow_key TEXT;
  v_blocks JSONB;
  v_block JSONB;
BEGIN
  SELECT * INTO v_config FROM public.business_hours WHERE organization_id = p_org_id;
  
  -- Sem configuração = sempre aberto
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  v_local_time := (v_now AT TIME ZONE v_config.timezone)::TIME;
  v_local_date := (v_now AT TIME ZONE v_config.timezone)::DATE;

  -- Feriado?
  IF EXISTS (
    SELECT 1 FROM public.business_holidays 
    WHERE organization_id = p_org_id AND date = v_local_date
  ) THEN
    RETURN FALSE;
  END IF;

  v_dow_key := CASE EXTRACT(DOW FROM v_local_date)::INT
    WHEN 0 THEN 'sun'
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
  END;

  v_blocks := v_config.schedule -> v_dow_key;

  IF v_blocks IS NULL OR jsonb_array_length(v_blocks) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
    IF v_local_time >= (v_block->>'start')::TIME 
       AND v_local_time < (v_block->>'end')::TIME THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;


--
-- Name: mark_default_password_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_default_password_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email IN ('superadmin@vendus.com.br','admin@vendus.com.br')
     AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN

    IF EXISTS (SELECT 1 FROM public.platform_settings) THEN
      UPDATE public.platform_settings
      SET default_password_changed = true,
          updated_at = now()
      WHERE COALESCE(default_password_changed, false) = false;
    ELSE
      INSERT INTO public.platform_settings (default_password_changed)
      VALUES (true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_super_admin_password_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_super_admin_password_changed() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only super_admin can mark password changed';
  END IF;

  UPDATE public.platform_settings
  SET default_password_changed = true,
      updated_at = now()
  WHERE COALESCE(default_password_changed, false) = false;

  IF NOT EXISTS (SELECT 1 FROM public.platform_settings) THEN
    INSERT INTO public.platform_settings (default_password_changed)
    VALUES (true);
  END IF;

  RETURN true;
END;
$$;


--
-- Name: move_to_dlq(text, text, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;


--
-- Name: normalize_phone_br(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_br(p text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  d text;
  ddd text;
  rest text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p, '\D', '', 'g');
  d := regexp_replace(d, '^0+', '', 'g');
  IF length(d) < 8 THEN RETURN NULL; END IF;

  -- Strip leading 55 to inspect the national portion
  IF left(d, 2) = '55' AND length(d) IN (12, 13) THEN
    d := substring(d from 3);
  END IF;

  -- Now d should be the national number: DDD(2) + 8 or 9 digits
  IF length(d) = 10 THEN
    ddd := substring(d from 1 for 2);
    rest := substring(d from 3);
    -- Mobile range starts 6-9; insert leading 9
    IF substring(rest from 1 for 1) ~ '[6-9]' THEN
      d := ddd || '9' || rest;
    END IF;
  END IF;

  IF length(d) IN (10, 11) THEN
    d := '55' || d;
  END IF;

  RETURN d;
END;
$$;


--
-- Name: pick_prompt_variant(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pick_prompt_variant(p_experiment_id uuid, p_seed text) RETURNS TABLE(variant_id uuid, label text, prompt_override text, prompt_mode text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_weight INT;
  v_hash_pos INT;
  v_cumulative INT := 0;
  v_chosen RECORD;
BEGIN
  -- Soma pesos das variantes
  SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
  FROM public.ai_prompt_variants
  WHERE experiment_id = p_experiment_id AND weight > 0;

  IF v_total_weight = 0 THEN
    RETURN;
  END IF;

  -- Hash determinístico do seed (lead_id) -> 0..total_weight-1
  v_hash_pos := abs(hashtext(COALESCE(p_seed, '') || p_experiment_id::text)) % v_total_weight;

  -- Itera variantes ordenadas e acha a faixa
  FOR v_chosen IN
    SELECT id, label, prompt_override, prompt_mode, weight
    FROM public.ai_prompt_variants
    WHERE experiment_id = p_experiment_id AND weight > 0
    ORDER BY created_at ASC, id ASC
  LOOP
    v_cumulative := v_cumulative + v_chosen.weight;
    IF v_hash_pos < v_cumulative THEN
      variant_id := v_chosen.id;
      label := v_chosen.label;
      prompt_override := v_chosen.prompt_override;
      prompt_mode := v_chosen.prompt_mode;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: prevent_super_admin_lock_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_super_admin_lock_reset() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.super_admin_bootstrapped = true AND NEW.super_admin_bootstrapped = false THEN
    RAISE EXCEPTION 'super_admin_bootstrapped lock cannot be reset';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: process_pending_queue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_pending_queue(p_user_id uuid) RETURNS TABLE(assigned_lead_id uuid, assigned_squad_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_queue_item RECORD;
  v_user_squads uuid[];
BEGIN
  -- Get user's squads
  SELECT ARRAY_AGG(squad_id) INTO v_user_squads
  FROM squad_members WHERE user_id = p_user_id;

  IF v_user_squads IS NULL THEN
    RETURN;
  END IF;

  -- Find oldest pending lead in user's squads
  SELECT * INTO v_queue_item
  FROM lead_queue lq
  WHERE lq.squad_id = ANY(v_user_squads)
    AND lq.status = 'pending'
  ORDER BY lq.priority DESC, lq.queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Assign the lead
  UPDATE leads SET assigned_to = p_user_id WHERE id = v_queue_item.lead_id;

  -- Update queue
  UPDATE lead_queue SET
    status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = now()
  WHERE id = v_queue_item.id;

  -- Increment active leads
  UPDATE user_status SET active_leads_count = active_leads_count + 1
  WHERE user_id = p_user_id;

  assigned_lead_id := v_queue_item.lead_id;
  assigned_squad_id := v_queue_item.squad_id;
  RETURN NEXT;
END;
$$;


--
-- Name: protect_booking_public_updates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_booking_public_updates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Authenticated host/owner edits bypass this guard
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.host_user_id THEN
    RETURN NEW;
  END IF;

  -- Public/anon updates: keep identity columns immutable
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
     OR NEW.host_user_id IS DISTINCT FROM OLD.host_user_id
     OR NEW.confirmation_token IS DISTINCT FROM OLD.confirmation_token
     OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
     OR NEW.guest_phone IS DISTINCT FROM OLD.guest_phone
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.calendar_event_id IS DISTINCT FROM OLD.calendar_event_id THEN
    RAISE EXCEPTION 'Public updates may only change status, cancellation_reason, start_time, end_time and timezone';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: read_email_batch(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;


--
-- Name: record_variant_impression(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_variant_impression(p_variant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.ai_prompt_variants
  SET impressions = impressions + 1
  WHERE id = p_variant_id;
END;
$$;


--
-- Name: record_variant_score(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_variant_score(p_variant_id uuid, p_score numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.ai_prompt_variants
  SET total_score = total_score + p_score,
      evaluations_count = evaluations_count + 1
  WHERE id = p_variant_id;
END;
$$;


--
-- Name: release_bot_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_bot_lock(p_conv uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.webchat_conversations
     SET bot_locked_until = NULL
   WHERE id = p_conv;
$$;


--
-- Name: remove_lifecycle_tags_on_event(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_lifecycle_tags_on_event(p_lead_id uuid, p_event_type text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid) RETURNS TABLE(tag_id uuid, action text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id uuid := p_organization_id;
  v_tag RECORD;
  v_tag_name text;
BEGIN
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN RETURN; END IF;
  END IF;

  -- Remove TODAS as tags transitórias (is_lifecycle_status=true) atualmente atribuídas ao lead
  -- que pertencem a automações do MESMO produto (ou globais sem produto).
  -- NUNCA toca em tags permanentes (is_lifecycle_status=false).
  FOR v_tag IN
    SELECT DISTINCT lta.tag_id, lt.name AS tag_name
    FROM lead_tag_assignments lta
    JOIN lead_tags lt ON lt.id = lta.tag_id
    WHERE lta.lead_id = p_lead_id
      AND lt.organization_id = v_org_id
      AND lt.is_lifecycle_status = true
      AND EXISTS (
        SELECT 1 FROM tag_automations ta
        WHERE ta.tag_id_to_add = lta.tag_id
          AND ta.organization_id = v_org_id
          AND (
            ta.product_id = p_product_id
            OR (ta.product_id IS NULL AND p_product_id IS NULL)
          )
      )
  LOOP
    DELETE FROM lead_tag_assignments
    WHERE lead_id = p_lead_id AND lead_tag_assignments.tag_id = v_tag.tag_id;

    -- Auditoria
    INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
    VALUES (
      p_lead_id,
      v_org_id,
      format('Etiqueta "%s" removida automaticamente (evento: %s)', v_tag.tag_name, p_event_type),
      'system',
      NULL
    );

    tag_id := v_tag.tag_id;
    action := 'removed';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: reschedule_booking_by_token(text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reschedule_booking_by_token(p_token text, p_new_start_time timestamp with time zone, p_timezone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_booking RECORD;
  v_duration int;
  v_new_end timestamptz;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;
  IF p_new_start_time IS NULL OR p_timezone IS NULL THEN
    RAISE EXCEPTION 'Missing parameters';
  END IF;

  SELECT br.id, br.calendar_event_id, bet.duration_minutes
    INTO v_booking
  FROM public.booking_requests br
  JOIN public.booking_event_types bet ON bet.id = br.event_type_id
  WHERE br.confirmation_token = p_token
  LIMIT 1;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_duration := COALESCE(v_booking.duration_minutes, 30);
  v_new_end := p_new_start_time + make_interval(mins => v_duration);

  UPDATE public.booking_requests
     SET start_time = p_new_start_time,
         end_time   = v_new_end,
         timezone   = p_timezone,
         status     = CASE WHEN status = 'cancelled' THEN 'confirmed' ELSE status END
   WHERE id = v_booking.id;

  IF v_booking.calendar_event_id IS NOT NULL THEN
    UPDATE public.calendar_events
       SET start_time = p_new_start_time,
           end_time   = v_new_end
     WHERE id = v_booking.calendar_event_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_booking.id, 'end_time', v_new_end);
END;
$$;


--
-- Name: reset_monthly_webhook_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_monthly_webhook_requests() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE webhooks SET requests_this_month = 0;
END;
$$;


--
-- Name: search_catalog_smart(uuid, uuid, text, numeric, numeric, text[], jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_catalog_smart(p_organization_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_tags text[] DEFAULT NULL::text[], p_attribute_filters jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 5) RETURNS TABLE(id uuid, title text, description text, price numeric, currency text, url text, thumbnail_url text, images jsonb, videos jsonb, documents jsonb, attributes jsonb, tags text[], match_score real, match_strategy text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_limit integer := GREATEST(LEAST(COALESCE(p_limit, 5), 20), 1);
  v_query_clean text := NULLIF(TRIM(COALESCE(p_query, '')), '');
  v_results_count integer;
BEGIN
  -- Camada 1: Full-text search (mais preciso) com filtros
  IF v_query_clean IS NOT NULL THEN
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      ts_rank(pci.search_vector, websearch_to_tsquery('portuguese', v_query_clean))::real AS match_score,
      'fulltext'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND pci.search_vector @@ websearch_to_tsquery('portuguese', v_query_clean)
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 2: Trigram fuzzy (tolera erros de digitação)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      GREATEST(
        similarity(COALESCE(pci.title, ''), v_query_clean),
        similarity(COALESCE(pci.description, ''), v_query_clean) * 0.7
      )::real AS match_score,
      'fuzzy'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND (
        COALESCE(pci.title, '') % v_query_clean
        OR COALESCE(pci.description, '') % v_query_clean
        OR COALESCE(pci.title, '') ILIKE '%' || v_query_clean || '%'
      )
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 3: Fallback — alternativas próximas ignorando query (mantém só filtros estruturais)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      0.1::real AS match_score,
      'alternatives'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  ELSE
    -- Sem query: apenas filtros
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      1.0::real AS match_score,
      'filter_only'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  END IF;
END;
$$;


--
-- Name: search_lead_memory(uuid, public.vector, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_lead_memory(p_lead_id uuid, p_query_embedding public.vector, p_match_count integer DEFAULT 8, p_min_similarity numeric DEFAULT 0.5) RETURNS TABLE(id uuid, content text, source text, role text, importance_score numeric, similarity numeric, metadata jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.source,
    m.role,
    m.importance_score,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC AS similarity,
    m.metadata,
    m.created_at
  FROM public.lead_semantic_memory m
  WHERE m.lead_id = p_lead_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY 
    -- Combina similaridade + importância
    ((1 - (m.embedding <=> p_query_embedding)) * 0.7 + m.importance_score * 0.3) DESC,
    m.created_at DESC
  LIMIT p_match_count;
END;
$$;


--
-- Name: sync_active_leads_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_active_leads_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Decrement old assignee's counter
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE user_status 
    SET active_leads_count = GREATEST(0, active_leads_count - 1)
    WHERE user_id = OLD.assigned_to;
  END IF;

  -- Increment new assignee's counter
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Ensure user_status record exists
    INSERT INTO user_status (user_id, organization_id, status, active_leads_count)
    SELECT NEW.assigned_to, NEW.organization_id, 'offline', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM user_status WHERE user_id = NEW.assigned_to
    );
    
    UPDATE user_status 
    SET active_leads_count = active_leads_count + 1
    WHERE user_id = NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_conversation_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conv_id uuid;
  v_last RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_conv_id := OLD.conversation_id;
  ELSE
    v_conv_id := NEW.conversation_id;
  END IF;

  IF v_conv_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND COALESCE(NEW.is_deleted, false) = false
     AND NEW.content IS NOT NULL THEN
    UPDATE public.webchat_conversations c
       SET last_message_content      = NEW.content,
           last_message_metadata     = NEW.metadata,
           last_message_sender_type  = NEW.sender_type,
           last_message_created_at   = NEW.created_at
     WHERE c.id = v_conv_id
       AND (c.last_message_created_at IS NULL OR NEW.created_at >= c.last_message_created_at);
    RETURN NEW;
  END IF;

  SELECT m.content, m.metadata, m.sender_type, m.created_at
    INTO v_last
    FROM public.webchat_messages m
    WHERE m.conversation_id = v_conv_id
      AND COALESCE(m.is_deleted, false) = false
    ORDER BY m.created_at DESC
    LIMIT 1;

  UPDATE public.webchat_conversations c
     SET last_message_content      = v_last.content,
         last_message_metadata     = v_last.metadata,
         last_message_sender_type  = v_last.sender_type,
         last_message_created_at   = v_last.created_at
   WHERE c.id = v_conv_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: try_acquire_conversation_lock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_conversation_lock(p_conv uuid, p_ttl_ms integer DEFAULT 30000) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lock_id uuid := gen_random_uuid();
  v_locked  uuid;
BEGIN
  INSERT INTO public.conversation_processing_locks (conversation_id, locked_until, locked_by, updated_at)
  VALUES (p_conv, now() + (p_ttl_ms || ' milliseconds')::interval, v_lock_id, now())
  ON CONFLICT (conversation_id) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        locked_by    = EXCLUDED.locked_by,
        updated_at   = now()
    WHERE conversation_processing_locks.locked_until < now()
  RETURNING locked_by INTO v_locked;

  RETURN v_locked = v_lock_id;
END;
$$;


--
-- Name: try_lock_bot(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_lock_bot(p_conv uuid, p_ttl_seconds integer DEFAULT 20) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.webchat_conversations
     SET bot_locked_until = now() + make_interval(secs => p_ttl_seconds)
   WHERE id = p_conv
     AND (bot_locked_until IS NULL OR bot_locked_until < now())
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;


--
-- Name: update_catalog_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_catalog_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  attr_text TEXT := '';
BEGIN
  -- Concatena valores escalares do JSONB attributes para indexar
  IF NEW.attributes IS NOT NULL THEN
    SELECT string_agg(value::text, ' ')
    INTO attr_text
    FROM jsonb_each_text(NEW.attributes);
  END IF;

  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(attr_text, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.description, '')), 'C');

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_ticket_on_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ticket_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.support_tickets
  SET 
    last_message_at = NEW.created_at,
    last_message_by_role = NEW.author_role,
    unread_for_admin = CASE WHEN NEW.author_role = 'super_admin' THEN true ELSE unread_for_admin END,
    unread_for_super_admin = CASE WHEN NEW.author_role = 'admin' THEN true ELSE unread_for_super_admin END,
    status = CASE 
      WHEN status = 'closed' AND NEW.author_role = 'admin' THEN 'open'::support_ticket_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: user_belongs_to_organization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_belongs_to_organization(_user_id uuid, _org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = _user_id
          AND organization_id = _org_id
    )
$$;


--
-- Name: user_in_sector_organization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_in_sector_organization(_user_id uuid, _sector_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sectors s
    JOIN public.profiles p ON p.organization_id = s.organization_id
    WHERE s.id = _sector_id AND p.id = _user_id
  );
$$;


--
-- Name: user_sector_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_sector_ids(_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sector_id FROM public.sector_members WHERE user_id = _user_id;
$$;


--
-- Name: validate_scheduled_message_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_scheduled_message_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'sent', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    direction text NOT NULL,
    message_type text NOT NULL,
    alert_kind text,
    reference_id uuid,
    content text NOT NULL,
    whatsapp_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_agent_messages_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text]))),
    CONSTRAINT admin_agent_messages_message_type_check CHECK ((message_type = ANY (ARRAY['daily_summary'::text, 'weekly_report'::text, 'realtime_alert'::text, 'reactive'::text, 'test'::text])))
);


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    type public.notification_type DEFAULT 'system'::public.notification_type,
    title text NOT NULL,
    message text,
    action_url text,
    scope text DEFAULT 'all'::text NOT NULL,
    scope_filters jsonb DEFAULT '{}'::jsonb,
    send_app boolean DEFAULT true,
    send_email boolean DEFAULT false,
    recipients_count integer DEFAULT 0,
    emails_sent integer DEFAULT 0,
    emails_failed integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    CONSTRAINT admin_notifications_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'product'::text, 'squad'::text, 'custom'::text])))
);


--
-- Name: agent_action_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_action_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    product_id uuid,
    agent_id uuid,
    lead_id uuid,
    action_type character varying(100) NOT NULL,
    action_data jsonb DEFAULT '{}'::jsonb,
    result jsonb DEFAULT '{}'::jsonb,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_activation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_activation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    conversation_id uuid,
    lead_id uuid,
    from_agent_id uuid,
    to_agent_id uuid,
    matched_term text,
    match_type text,
    channel text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_handoff_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_handoff_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    lead_id uuid,
    from_agent_id uuid,
    to_agent_id uuid,
    to_specialist_id uuid,
    reason text,
    rule_id uuid,
    context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_post_sale_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_post_sale_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger_event text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    instruction text NOT NULL,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags_to_apply text[] DEFAULT '{}'::text[] NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT agent_post_sale_scenarios_trigger_event_check CHECK ((trigger_event = ANY (ARRAY['paid'::text, 'abandoned'::text, 'refunded'::text])))
);


--
-- Name: agent_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_routing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    match_stage_ids uuid[],
    match_tag_ids uuid[],
    match_product_ids uuid[],
    match_channels text[],
    match_events text[],
    deal_value_min numeric,
    deal_value_max numeric,
    target_specialist_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    match_count integer DEFAULT 0 NOT NULL,
    last_matched_at timestamp with time zone
);


--
-- Name: agent_safety_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_safety_limits (
    organization_id uuid NOT NULL,
    max_tools_per_turn integer DEFAULT 5 NOT NULL,
    max_tool_executions_per_day integer DEFAULT 5000 NOT NULL,
    max_cost_cents_per_day integer DEFAULT 50000 NOT NULL,
    cooldown_seconds_between_same_tool integer DEFAULT 2 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_specialists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    role text NOT NULL,
    display_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_tool_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tool_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_id uuid,
    agent_name text,
    lead_id uuid,
    conversation_id uuid,
    channel text,
    tool_name text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    output jsonb,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    duration_ms integer,
    estimated_cost_cents integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_training_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_training_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    material_type text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    description text,
    file_url text,
    extracted_content text,
    is_active boolean DEFAULT true,
    processing_status text DEFAULT 'pending'::text,
    processing_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    product_id uuid,
    agent_id uuid,
    CONSTRAINT agent_training_materials_category_check CHECK ((category = ANY (ARRAY['sales_techniques'::text, 'communication'::text, 'objections'::text, 'closing'::text, 'prospecting'::text, 'negotiation'::text, 'general'::text]))),
    CONSTRAINT agent_training_materials_material_type_check CHECK ((material_type = ANY (ARRAY['pdf'::text, 'video'::text, 'text'::text, 'website'::text]))),
    CONSTRAINT agent_training_materials_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: ai_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    interaction_id uuid NOT NULL,
    quality_score integer,
    issues text[] DEFAULT '{}'::text[],
    suggestions text[] DEFAULT '{}'::text[],
    tone_analysis jsonb DEFAULT '{}'::jsonb,
    analyzed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_audits_quality_score_check CHECK (((quality_score >= 0) AND (quality_score <= 100)))
);


--
-- Name: ai_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    product_id uuid,
    organization_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    insight text NOT NULL,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    is_dismissed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_knowledge_base; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_outreach_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_outreach_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    conversation_id uuid,
    product_id uuid,
    agent_id uuid,
    webhook_id uuid,
    objective text,
    extra_context text,
    lead_data jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    followup_enabled boolean DEFAULT false NOT NULL,
    followup_interval_hours integer DEFAULT 24,
    max_followups integer DEFAULT 3,
    followups_sent integer DEFAULT 0 NOT NULL,
    last_outreach_at timestamp with time zone,
    next_followup_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    followup_steps jsonb DEFAULT '[]'::jsonb,
    business_hours_start text DEFAULT '09:00'::text,
    business_hours_end text DEFAULT '18:00'::text,
    business_days integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    CONSTRAINT ai_outreach_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'replied'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: ai_prompt_experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    agent_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    primary_metric text DEFAULT 'score_overall'::text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_prompt_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    label text NOT NULL,
    prompt_override text,
    prompt_mode text DEFAULT 'append'::text NOT NULL,
    weight integer DEFAULT 50 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    conversions integer DEFAULT 0 NOT NULL,
    total_score numeric DEFAULT 0 NOT NULL,
    evaluations_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_quality_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_quality_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    agent_id uuid,
    lead_id uuid,
    evaluated_messages_count integer DEFAULT 0,
    score_overall numeric,
    score_clarity numeric,
    score_tone numeric,
    score_objectivity numeric,
    score_accuracy numeric,
    score_conversion_potential numeric,
    detected_objections jsonb DEFAULT '[]'::jsonb,
    detected_intents jsonb DEFAULT '[]'::jsonb,
    detected_issues jsonb DEFAULT '[]'::jsonb,
    summary text,
    improvement_suggestions text,
    judge_model text,
    cost_usd numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_response_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_response_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid,
    conversation_id uuid,
    original_response text NOT NULL,
    suggested_response text NOT NULL,
    feedback_type text DEFAULT 'correction'::text,
    created_by uuid,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    applied_to_training boolean DEFAULT false,
    applied_at timestamp with time zone,
    CONSTRAINT ai_response_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['correction'::text, 'tone'::text, 'accuracy'::text, 'content'::text])))
);


--
-- Name: ai_router_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_router_failures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    capability text NOT NULL,
    provider text NOT NULL,
    status_code integer,
    error_message text,
    fell_back_to text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auto_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    stalled_lead_enabled boolean DEFAULT true,
    stalled_lead_days integer DEFAULT 3,
    goal_achieved_enabled boolean DEFAULT true,
    commission_approved_enabled boolean DEFAULT true,
    daily_report_enabled boolean DEFAULT true,
    daily_report_hour integer DEFAULT 7,
    daily_report_send_email boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    admin_agent_enabled boolean DEFAULT false,
    admin_whatsapp_number text,
    admin_user_id uuid,
    daily_summary_enabled boolean DEFAULT true,
    daily_summary_hour integer DEFAULT 8,
    weekly_report_enabled boolean DEFAULT true,
    weekly_report_dow integer DEFAULT 1,
    weekly_report_hour integer DEFAULT 8,
    realtime_alerts_enabled boolean DEFAULT true,
    alert_high_value_threshold numeric DEFAULT 10000,
    alert_unattended_minutes integer DEFAULT 15,
    alert_offline_minutes integer DEFAULT 30,
    alert_agent_error_threshold integer DEFAULT 3,
    alert_meeting_changes boolean DEFAULT true,
    alert_goal_achieved boolean DEFAULT true,
    monitored_product_ids uuid[],
    summary_kpis text[] DEFAULT ARRAY['leads_created'::text, 'conversions'::text, 'pipeline_total'::text, 'meetings'::text, 'overdue_tasks'::text, 'top_sellers'::text],
    weekly_include_comparison boolean DEFAULT true,
    alert_product_volume_spike boolean DEFAULT false,
    alert_product_volume_spike_pct integer DEFAULT 50,
    alert_critical_product_idle_hours integer DEFAULT 24
);


--
-- Name: availability_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    date date NOT NULL,
    is_available boolean DEFAULT false,
    start_time time without time zone,
    end_time time without time zone,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: billing_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    subscription_id uuid,
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text,
    invoice_url text,
    payment_date timestamp with time zone,
    due_date timestamp with time zone,
    description text,
    stripe_invoice_id text,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: booking_event_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_event_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    duration_minutes integer DEFAULT 30 NOT NULL,
    location_type text DEFAULT 'google_meet'::text NOT NULL,
    location_details text,
    color text DEFAULT '#3b82f6'::text,
    is_active boolean DEFAULT false,
    buffer_before integer DEFAULT 0,
    buffer_after integer DEFAULT 0,
    min_notice_hours integer DEFAULT 24,
    max_days_ahead integer DEFAULT 60,
    questions jsonb DEFAULT '[]'::jsonb,
    confirmation_message text,
    create_meet boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    thank_you_title text,
    thank_you_message text,
    what_happens jsonb DEFAULT '[]'::jsonb,
    next_steps jsonb DEFAULT '[]'::jsonb,
    booking_experience text DEFAULT 'standard'::text,
    CONSTRAINT booking_event_types_booking_experience_check CHECK ((booking_experience = ANY (ARRAY['standard'::text, 'conversational'::text])))
);


--
-- Name: booking_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    type text NOT NULL,
    channel text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_logs_type_check CHECK ((type = ANY (ARRAY['confirmation_sent'::text, 'reminder_sent'::text, 'recovery_sent'::text, 'reply_received'::text, 'notification_sent'::text, 'send_failed'::text, 'status_changed'::text])))
);


--
-- Name: booking_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_type_id uuid NOT NULL,
    send_email boolean DEFAULT true NOT NULL,
    send_whatsapp boolean DEFAULT false NOT NULL,
    whatsapp_instance_id uuid,
    confirmation_message_whatsapp text,
    confirmation_subject_email text,
    confirmation_html_email text,
    notify_seller_on_new boolean DEFAULT true NOT NULL,
    notify_seller_on_confirm boolean DEFAULT true NOT NULL,
    notify_seller_on_reschedule boolean DEFAULT true NOT NULL,
    notify_seller_on_cancel boolean DEFAULT true NOT NULL,
    internal_channel text DEFAULT 'both'::text NOT NULL,
    internal_message_template text,
    recovery_enabled boolean DEFAULT false NOT NULL,
    recovery_offset_value integer DEFAULT 3 NOT NULL,
    recovery_offset_unit text DEFAULT 'hours'::text NOT NULL,
    recovery_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_notification_settings_internal_channel_check CHECK ((internal_channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'both'::text]))),
    CONSTRAINT booking_notification_settings_recovery_offset_unit_check CHECK ((recovery_offset_unit = ANY (ARRAY['minutes'::text, 'hours'::text, 'days'::text])))
);


--
-- Name: booking_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_type_id uuid NOT NULL,
    offset_value integer NOT NULL,
    offset_unit text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    message_template text NOT NULL,
    email_subject text,
    is_active boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_reminders_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'both'::text]))),
    CONSTRAINT booking_reminders_offset_unit_check CHECK ((offset_unit = ANY (ARRAY['minutes'::text, 'hours'::text, 'days'::text])))
);


--
-- Name: booking_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_type_id uuid NOT NULL,
    host_user_id uuid NOT NULL,
    calendar_event_id uuid,
    guest_name text NOT NULL,
    guest_email text NOT NULL,
    guest_phone text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    status text DEFAULT 'confirmed'::text,
    additional_info jsonb DEFAULT '{}'::jsonb,
    cancellation_reason text,
    confirmation_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
    lead_id uuid,
    tracking jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    whatsapp_message_id text,
    last_reply_at timestamp with time zone,
    last_reply_text text,
    confirmed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'agendado'::text, 'confirmacao_enviada'::text, 'confirmado'::text, 'lembrete_enviado'::text, 'reagendamento_solicitado'::text, 'cancelado'::text, 'no_show'::text, 'concluido'::text])))
);


--
-- Name: booking_scheduled_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_scheduled_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    reminder_id uuid,
    kind text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT booking_scheduled_jobs_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'both'::text]))),
    CONSTRAINT booking_scheduled_jobs_kind_check CHECK ((kind = ANY (ARRAY['confirmation'::text, 'reminder'::text, 'recovery'::text, 'internal_notification'::text]))),
    CONSTRAINT booking_scheduled_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: booking_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    source text DEFAULT 'system'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_status_history_source_check CHECK ((source = ANY (ARRAY['system'::text, 'lead_reply'::text, 'seller'::text, 'cron'::text, 'admin'::text])))
);


--
-- Name: business_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    date date NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    schedule jsonb DEFAULT jsonb_build_object('mon', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '18:00')), 'tue', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '18:00')), 'wed', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '18:00')), 'thu', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '18:00')), 'fri', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '18:00')), 'sat', jsonb_build_array(), 'sun', jsonb_build_array()) NOT NULL,
    out_of_hours_message text DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.'::text NOT NULL,
    out_of_hours_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cadence_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadence_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes text[] DEFAULT ARRAY['cadences:read'::text, 'cadences:write'::text] NOT NULL,
    created_by uuid,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cadence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadence_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cadence_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_step_id uuid,
    current_step_index integer DEFAULT 0 NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    stopped_at timestamp with time zone,
    stop_reason text,
    source text,
    source_ref jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cadence_enrollments_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'stopped'::text, 'paused'::text])))
);


--
-- Name: cadence_step_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadence_step_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enrollment_id uuid NOT NULL,
    step_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    executed_at timestamp with time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    agent_message text,
    conversation_id uuid,
    skip_reason text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cadence_step_runs_status_chk CHECK ((status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'skipped'::text, 'failed'::text, 'responded'::text])))
);


--
-- Name: cadence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadence_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cadence_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    objective text,
    execute_immediately boolean DEFAULT false NOT NULL,
    delay_value integer DEFAULT 1 NOT NULL,
    delay_unit text DEFAULT 'days'::text NOT NULL,
    delay_from text DEFAULT 'previous_step'::text NOT NULL,
    context_id uuid,
    context_inline text,
    tone text,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cadence_steps_delay_from_chk CHECK ((delay_from = ANY (ARRAY['previous_step'::text, 'enrollment'::text]))),
    CONSTRAINT cadence_steps_delay_unit_chk CHECK ((delay_unit = ANY (ARRAY['minutes'::text, 'hours'::text, 'days'::text])))
);


--
-- Name: cadence_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadence_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    day_number integer NOT NULL,
    title text NOT NULL,
    trigger text,
    blocks jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cadences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    objective text,
    agent_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    entry_filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    exclusion_filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    stop_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    stop_actions jsonb DEFAULT '{}'::jsonb NOT NULL,
    execution_window jsonb DEFAULT '{"end": "18:00", "days": ["mon", "tue", "wed", "thu", "fri"], "start": "09:00", "randomize": false}'::jsonb NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    totals jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_executed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cadences_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: cakto_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cakto_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    organization_id uuid,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    scopes text[] DEFAULT ARRAY['read'::text, 'orders'::text, 'products'::text] NOT NULL,
    webhook_secret text,
    last_token text,
    token_expires_at timestamp with time zone,
    connection_status text DEFAULT 'disconnected'::text NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cakto_credentials_scope_check CHECK ((scope = ANY (ARRAY['platform'::text, 'organization'::text]))),
    CONSTRAINT cakto_creds_org_required CHECK ((((scope = 'platform'::text) AND (organization_id IS NULL)) OR ((scope = 'organization'::text) AND (organization_id IS NOT NULL))))
);


--
-- Name: cakto_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cakto_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    organization_id uuid,
    cakto_id text NOT NULL,
    cakto_ref_id text,
    status text NOT NULL,
    type text,
    offer_type text,
    payment_method text,
    base_amount numeric(12,2),
    discount numeric(12,2),
    amount numeric(12,2),
    coupon_code text,
    customer_name text,
    customer_email text,
    customer_phone text,
    customer_document text,
    product_cakto_id text,
    product_name text,
    product_image text,
    paid_at timestamp with time zone,
    created_at_cakto timestamp with time zone,
    raw_payload jsonb,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_id uuid,
    offer_id uuid,
    items jsonb DEFAULT '[]'::jsonb,
    provider text DEFAULT 'cakto'::text NOT NULL,
    assigned_to uuid,
    lead_id uuid,
    cakto_offer_slug text,
    CONSTRAINT cakto_orders_provider_check CHECK ((provider = ANY (ARRAY['cakto'::text, 'doppus'::text, 'hotmart'::text, 'kiwify'::text, 'manual'::text]))),
    CONSTRAINT cakto_orders_scope_check CHECK ((scope = ANY (ARRAY['platform'::text, 'organization'::text])))
);


--
-- Name: cakto_recovery_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cakto_recovery_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    recovery_agent_id uuid,
    trigger_on_abandoned boolean DEFAULT true NOT NULL,
    trigger_on_paid boolean DEFAULT true NOT NULL,
    trigger_on_refunded boolean DEFAULT false NOT NULL,
    delay_seconds integer DEFAULT 0 NOT NULL,
    cooldown_minutes integer DEFAULT 60 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cakto_recovery_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cakto_recovery_dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    cakto_order_id uuid,
    cakto_event text NOT NULL,
    cakto_status text,
    lead_id uuid,
    agent_id uuid,
    conversation_id uuid,
    customer_phone text,
    customer_email text,
    message_sent text,
    success boolean DEFAULT false NOT NULL,
    error_message text,
    skipped_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    event_type text DEFAULT 'meeting'::text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    recurrence_end_date date,
    parent_event_id uuid,
    lead_id uuid,
    product_id uuid,
    deal_id uuid,
    attendees jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'confirmed'::text,
    reminder_minutes integer[] DEFAULT ARRAY[15, 60],
    google_event_id text,
    google_calendar_id text,
    last_synced_at timestamp with time zone,
    sync_status text DEFAULT 'local_only'::text,
    color text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    synced_from_google boolean DEFAULT false,
    meet_link text,
    create_meet boolean DEFAULT false
);


--
-- Name: campaign_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    objective text,
    tone text,
    cta text,
    instructions text NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: campaign_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    context_used text,
    context_id uuid,
    instance_id uuid,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    conversation_id uuid,
    outreach_queue_id uuid,
    error text,
    responded_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_targets_status_chk CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text, 'responded'::text, 'cancelled'::text])))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    agent_id uuid,
    created_by uuid,
    audience_filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    exclusion_filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    contexts jsonb DEFAULT '[]'::jsonb NOT NULL,
    context_distribution text DEFAULT 'random'::text NOT NULL,
    instance_strategy text DEFAULT 'all'::text NOT NULL,
    instance_distribution jsonb DEFAULT '[]'::jsonb NOT NULL,
    speed_preset text DEFAULT 'recommended'::text NOT NULL,
    speed_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    schedule_type text DEFAULT 'now'::text NOT NULL,
    scheduled_at timestamp with time zone,
    recurrence jsonb,
    post_response_actions jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags_on_response uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    totals jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    post_cadence_id uuid,
    CONSTRAINT campaigns_channel_chk CHECK ((channel = 'whatsapp'::text)),
    CONSTRAINT campaigns_context_dist_chk CHECK ((context_distribution = ANY (ARRAY['random'::text, 'sequential'::text, 'weighted'::text]))),
    CONSTRAINT campaigns_instance_strategy_chk CHECK ((instance_strategy = ANY (ARRAY['all'::text, 'rotation'::text, 'manual'::text]))),
    CONSTRAINT campaigns_schedule_type_chk CHECK ((schedule_type = ANY (ARRAY['now'::text, 'scheduled'::text, 'recurring'::text]))),
    CONSTRAINT campaigns_speed_preset_chk CHECK ((speed_preset = ANY (ARRAY['safe'::text, 'recommended'::text, 'fast'::text, 'aggressive'::text, 'custom'::text]))),
    CONSTRAINT campaigns_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: capture_funnels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capture_funnels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    slug text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    flow_blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    start_block_id text,
    channels jsonb DEFAULT '{"chat": {"enabled": false, "slug_override": null}, "form": {"enabled": false, "slug_override": null}, "widget": {"enabled": false}}'::jsonb NOT NULL,
    widget_config jsonb DEFAULT '{"greeting": "Ola! Como posso ajudar?", "position": "bottom-right", "avatar_url": null, "primary_color": "#3B82F6", "allowed_domains": []}'::jsonb,
    distribution_rule text DEFAULT 'manual'::text NOT NULL,
    assigned_squad_id uuid,
    assigned_user_id uuid,
    round_robin_config jsonb DEFAULT '{"users": [], "current_index": 0}'::jsonb,
    default_temperature text DEFAULT 'warm'::text,
    default_tags text[] DEFAULT '{}'::text[],
    facebook_pixel_id text,
    google_tag_id text,
    custom_scripts jsonb DEFAULT '{"footer": "", "header": ""}'::jsonb,
    utm_capture boolean DEFAULT true,
    theme jsonb DEFAULT '{"logo_url": null, "text_color": "#FFFFFF", "font_family": "Inter", "primary_color": "#3B82F6", "show_progress": true, "background_color": "#0F172A"}'::jsonb,
    ai_enabled boolean DEFAULT true,
    ai_context text,
    total_views integer DEFAULT 0,
    total_leads integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    appearance jsonb DEFAULT jsonb_build_object('chat', jsonb_build_object('primary_color', '#3B82F6', 'secondary_color', '#3B82F6', 'background_color', '#F8FAFC', 'text_color', '#0F172A', 'background_image_url', NULL::unknown, 'background_image_mode', 'cover', 'background_image_opacity', 0.15, 'font_family', 'Inter', 'font_size_base', 14, 'density', 'cozy', 'border_radius', 16, 'shadow', 'soft', 'animations', 'subtle', 'dark_mode', 'light', 'custom_css', '', 'logo_url', NULL::unknown, 'logo_position', 'left', 'avatar_enabled', true, 'avatar_url', NULL::unknown, 'avatar_shape', 'circle', 'bot_name', 'Assistente', 'show_online_status', true, 'channel_options', jsonb_build_object('bubble_style', 'rounded', 'bot_bubble_color', '#3B82F6', 'user_bubble_color', '#E2E8F0', 'show_typing', true, 'header_gradient', true, 'input_placeholder', 'Mensagem', 'notification_sound', false)), 'form', jsonb_build_object('primary_color', '#3B82F6', 'secondary_color', '#3B82F6', 'background_color', '#FFFFFF', 'text_color', '#0F172A', 'background_image_url', NULL::unknown, 'background_image_mode', 'cover', 'background_image_opacity', 0.15, 'font_family', 'Inter', 'font_size_base', 16, 'density', 'spacious', 'border_radius', 12, 'shadow', 'medium', 'animations', 'subtle', 'dark_mode', 'light', 'custom_css', '', 'logo_url', NULL::unknown, 'logo_position', 'center', 'avatar_enabled', false, 'avatar_url', NULL::unknown, 'avatar_shape', 'circle', 'bot_name', '', 'show_online_status', false, 'channel_options', jsonb_build_object('layout', 'step', 'max_width', 640, 'alignment', 'center', 'input_style', 'outlined', 'button_style', 'filled', 'show_progress', true, 'side_image_url', NULL::unknown)), 'widget', jsonb_build_object('primary_color', '#3B82F6', 'secondary_color', '#3B82F6', 'background_color', '#FFFFFF', 'text_color', '#0F172A', 'background_image_url', NULL::unknown, 'background_image_mode', 'cover', 'background_image_opacity', 0.15, 'font_family', 'Inter', 'font_size_base', 14, 'density', 'cozy', 'border_radius', 18, 'shadow', 'strong', 'animations', 'full', 'dark_mode', 'light', 'custom_css', '', 'logo_url', NULL::unknown, 'logo_position', 'left', 'avatar_enabled', true, 'avatar_url', NULL::unknown, 'avatar_shape', 'circle', 'bot_name', 'Atendimento', 'show_online_status', true, 'channel_options', jsonb_build_object('position', 'bottom-right', 'fab_size', 'md', 'fab_icon', 'message-circle', 'callout_text', 'Posso ajudar?', 'auto_open_delay', 0, 'show_notification_badge', true, 'hide_on_mobile', false)), 'quiz', jsonb_build_object('primary_color', '#3B82F6', 'secondary_color', '#3B82F6', 'background_color', '#0F172A', 'text_color', '#FFFFFF', 'background_image_url', NULL::unknown, 'background_image_mode', 'cover', 'background_image_opacity', 0.25, 'font_family', 'Inter', 'font_size_base', 16, 'density', 'spacious', 'border_radius', 20, 'shadow', 'medium', 'animations', 'full', 'dark_mode', 'dark', 'custom_css', '', 'logo_url', NULL::unknown, 'logo_position', 'center', 'avatar_enabled', false, 'avatar_url', NULL::unknown, 'avatar_shape', 'circle', 'bot_name', '', 'show_online_status', false, 'channel_options', jsonb_build_object('layout', 'cards', 'option_columns', 2, 'show_counter', true, 'transition', 'slide', 'result_image_url', NULL::unknown, 'result_message', 'Obrigado pela participação!'))),
    channel_type text DEFAULT 'widget'::text NOT NULL,
    post_quiz_agent_id uuid,
    post_quiz_cadence_id uuid,
    post_quiz_actions jsonb DEFAULT '{"create_deal": false, "notify_owner": false, "apply_tag_ids": [], "hot_threshold": 70, "warm_threshold": 40}'::jsonb NOT NULL,
    CONSTRAINT capture_funnels_channel_type_check CHECK ((channel_type = ANY (ARRAY['chatbot'::text, 'whatsapp'::text, 'form'::text, 'widget'::text, 'quiz'::text]))),
    CONSTRAINT capture_funnels_distribution_rule_check CHECK ((distribution_rule = ANY (ARRAY['manual'::text, 'round_robin'::text, 'squad'::text, 'user'::text]))),
    CONSTRAINT capture_funnels_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: catalog_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    source_type text DEFAULT 'firecrawl'::text NOT NULL,
    base_url text,
    catalog_type text,
    status text DEFAULT 'running'::text NOT NULL,
    items_found integer DEFAULT 0,
    items_created integer DEFAULT 0,
    items_updated integer DEFAULT 0,
    items_failed integer DEFAULT 0,
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    created_by uuid,
    CONSTRAINT catalog_sync_logs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: chat_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    organization_id uuid NOT NULL,
    name text DEFAULT 'Fluxo de Qualificação'::text NOT NULL,
    description text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    start_block_id text,
    is_active boolean DEFAULT true,
    trigger_type text DEFAULT 'always'::text,
    trigger_conditions jsonb DEFAULT '{}'::jsonb,
    collected_variables jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid,
    organization_id uuid NOT NULL,
    rule_type text DEFAULT 'percentage'::text NOT NULL,
    base_value numeric DEFAULT 10 NOT NULL,
    min_value numeric DEFAULT 0,
    max_value numeric,
    applies_to text DEFAULT 'deal'::text,
    stage_id uuid,
    is_default boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT commission_rules_applies_to_check CHECK ((applies_to = ANY (ARRAY['deal'::text, 'stage'::text]))),
    CONSTRAINT commission_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['percentage'::text, 'fixed'::text])))
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    amount numeric NOT NULL,
    percentage_applied numeric,
    rule_id uuid,
    status text DEFAULT 'pending'::text,
    earned_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    approved_by uuid,
    paid_at timestamp with time zone,
    paid_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT commissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: conversation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversation_processing_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_processing_locks (
    conversation_id uuid NOT NULL,
    locked_until timestamp with time zone NOT NULL,
    locked_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    from_user_id uuid,
    to_user_id uuid,
    to_queue_id uuid,
    internal_note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    field_key text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    description text,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'select'::text, 'boolean'::text, 'date'::text])))
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    product_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    deal_value numeric NOT NULL,
    status text DEFAULT 'won'::text,
    notes text,
    closed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    plan_name text,
    CONSTRAINT deals_status_check CHECK ((status = ANY (ARRAY['won'::text, 'lost'::text, 'cancelled'::text])))
);


--
-- Name: distribution_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distribution_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    squad_id uuid,
    method text DEFAULT 'round_robin'::text NOT NULL,
    round_robin_index integer DEFAULT 0 NOT NULL,
    auto_reassign boolean DEFAULT true NOT NULL,
    max_accept_time_minutes integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distribution_config_method_check CHECK ((method = ANY (ARRAY['round_robin'::text, 'least_busy'::text, 'performance'::text])))
);


--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])))
);


--
-- Name: email_send_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_state (
    id integer DEFAULT 1 NOT NULL,
    retry_after_until timestamp with time zone,
    batch_size integer DEFAULT 10 NOT NULL,
    send_delay_ms integer DEFAULT 200 NOT NULL,
    auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
    transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_state_id_check CHECK ((id = 1))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribe_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: evolution_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    instance_id text,
    instance_token text,
    phone_number text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    qr_code text,
    qr_code_updated_at timestamp with time zone,
    webhook_subscribed boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    last_connected_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_super_admin boolean DEFAULT false NOT NULL
);


--
-- Name: facebook_lead_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_lead_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    page_id text NOT NULL,
    page_name text,
    page_access_token text NOT NULL,
    app_secret text,
    verify_token text NOT NULL,
    field_mapping jsonb DEFAULT '{"email": "email", "full_name": "name", "phone_number": "phone"}'::jsonb,
    distribution_rule text DEFAULT 'manual'::text,
    assigned_user_id uuid,
    assigned_squad_id uuid,
    default_temperature text DEFAULT 'hot'::text,
    default_tags text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    last_lead_received_at timestamp with time zone,
    leads_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: facebook_lead_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_lead_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    leadgen_id text NOT NULL,
    form_id text,
    ad_id text,
    campaign_id text,
    raw_payload jsonb,
    lead_data jsonb,
    lead_id uuid,
    status text DEFAULT 'pending'::text,
    error_message text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: form_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    block_type text NOT NULL,
    label text NOT NULL,
    description text,
    placeholder text,
    required boolean DEFAULT false,
    options jsonb DEFAULT '[]'::jsonb,
    logic_rules jsonb DEFAULT '[]'::jsonb,
    maps_to text,
    score_value integer DEFAULT 0,
    score_rules jsonb DEFAULT '[]'::jsonb,
    apply_tags text[] DEFAULT '{}'::text[],
    validation jsonb DEFAULT '{}'::jsonb,
    block_settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT form_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'email'::text, 'phone'::text, 'number'::text, 'textarea'::text, 'select'::text, 'multi_select'::text, 'yes_no'::text, 'scale'::text, 'conditional'::text, 'score'::text, 'tag'::text, 'hidden_field'::text, 'ai_question'::text, 'ai_followup'::text, 'welcome_screen'::text, 'end_screen'::text, 'image'::text, 'video_upload'::text, 'video_embed'::text, 'carousel'::text, 'divider'::text])))
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    lead_id uuid,
    responses jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_score integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    referrer_url text,
    landing_page text,
    user_agent text,
    ip_address inet,
    geo_country text,
    geo_city text,
    status text DEFAULT 'completed'::text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    step_analytics jsonb DEFAULT '[]'::jsonb,
    time_spent_seconds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT form_submissions_status_check CHECK ((status = ANY (ARRAY['started'::text, 'abandoned'::text, 'completed'::text])))
);


--
-- Name: form_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    thumbnail_url text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    theme jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    is_public boolean DEFAULT false,
    is_system boolean DEFAULT false,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT form_templates_category_check CHECK ((category = ANY (ARRAY['general'::text, 'qualification'::text, 'diagnostic'::text, 'pre_sale'::text, 'feedback'::text, 'survey'::text])))
);


--
-- Name: forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    slug text NOT NULL,
    status text DEFAULT 'draft'::text,
    distribution_rule text DEFAULT 'queue'::text,
    assigned_squad_id uuid,
    assigned_user_id uuid,
    default_temperature text DEFAULT 'warm'::text,
    round_robin_config jsonb DEFAULT '{"users": [], "current_index": 0}'::jsonb,
    theme jsonb DEFAULT '{"logo_url": null, "text_color": "#1f2937", "font_family": "Inter", "button_style": "filled", "redirect_url": null, "border_radius": "8px", "primary_color": "#8B5CF6", "show_progress": true, "secondary_color": "#6366F1", "background_color": "#ffffff"}'::jsonb,
    facebook_pixel_id text,
    google_tag_id text,
    custom_scripts jsonb DEFAULT '{"footer": "", "header": ""}'::jsonb,
    utm_capture boolean DEFAULT true,
    settings jsonb DEFAULT '{"show_branding": true, "auto_create_lead": true, "notify_on_submission": true, "allow_multiple_submissions": false}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    views_count integer DEFAULT 0,
    submissions_count integer DEFAULT 0,
    post_cadence_id uuid,
    CONSTRAINT forms_distribution_rule_check CHECK ((distribution_rule = ANY (ARRAY['manual'::text, 'round_robin'::text, 'squad'::text, 'user'::text]))),
    CONSTRAINT forms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: funnel_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funnel_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funnel_id uuid NOT NULL,
    channel text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    views integer DEFAULT 0,
    starts integer DEFAULT 0,
    completions integer DEFAULT 0,
    leads_created integer DEFAULT 0,
    CONSTRAINT funnel_analytics_channel_check CHECK ((channel = ANY (ARRAY['chat'::text, 'form'::text, 'widget'::text])))
);


--
-- Name: funnel_webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funnel_webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funnel_id uuid NOT NULL,
    block_id text NOT NULL,
    lead_id uuid,
    organization_id uuid NOT NULL,
    request_url text NOT NULL,
    request_method text DEFAULT 'POST'::text NOT NULL,
    request_headers jsonb DEFAULT '{}'::jsonb,
    request_body jsonb,
    response_status integer,
    response_body text,
    success boolean DEFAULT false NOT NULL,
    error_message text,
    duration_ms integer,
    trigger_source text DEFAULT 'on_block'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    calendar_id text DEFAULT 'primary'::text,
    sync_enabled boolean DEFAULT true,
    sync_direction text DEFAULT 'both'::text,
    last_sync_at timestamp with time zone,
    sync_error text,
    connected_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    google_email text,
    is_active boolean DEFAULT true,
    selected_calendar_id text,
    google_event_id text
);


--
-- Name: help_article_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_article_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_helpful boolean NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: help_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    slug text NOT NULL,
    title text NOT NULL,
    summary text,
    content_json jsonb,
    content_html text,
    cover_image_url text,
    tags text[] DEFAULT '{}'::text[],
    is_published boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    helpful_count integer DEFAULT 0 NOT NULL,
    not_helpful_count integer DEFAULT 0 NOT NULL,
    related_release_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone
);


--
-- Name: help_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT 'BookOpen'::text,
    color text DEFAULT 'primary'::text,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visibility text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT help_categories_visibility_check CHECK ((visibility = ANY (ARRAY['all'::text, 'super_admin_only'::text])))
);


--
-- Name: hotmart_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotmart_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    client_id text,
    client_secret text,
    basic_token text,
    hottok text,
    is_active boolean DEFAULT false NOT NULL,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hotmart_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotmart_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    transaction_id text NOT NULL,
    product_id uuid,
    hotmart_product_id text,
    hotmart_product_name text,
    hotmart_offer_code text,
    buyer_email text,
    buyer_name text,
    buyer_phone text,
    buyer_doc text,
    amount numeric(12,2),
    currency text DEFAULT 'BRL'::text,
    status text NOT NULL,
    event_type text,
    payment_method text,
    installments integer,
    affiliate_email text,
    commission_amount numeric(12,2),
    subscription_code text,
    raw_payload jsonb,
    created_at_hotmart timestamp with time zone,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hotmart_product_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotmart_product_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    hotmart_product_id text NOT NULL,
    hotmart_product_name text,
    product_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    integration_type text NOT NULL,
    api_key_masked text,
    is_configured boolean DEFAULT false,
    settings jsonb DEFAULT '{}'::jsonb,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid,
    channel public.interaction_channel DEFAULT 'whatsapp'::public.interaction_channel NOT NULL,
    direction text DEFAULT 'outbound'::text,
    content text NOT NULL,
    cadence_day integer,
    template_used text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT interactions_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    role_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    squad_id uuid,
    product_id uuid,
    priority integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_at timestamp with time zone,
    assigned_to uuid,
    CONSTRAINT lead_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'assigned'::text, 'expired'::text])))
);


--
-- Name: lead_semantic_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_semantic_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    message_id uuid,
    source text DEFAULT 'message'::text NOT NULL,
    role text,
    content text NOT NULL,
    embedding public.vector(1536),
    importance_score numeric DEFAULT 0.5,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_stage_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_stage_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    stage_id uuid,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    exited_at timestamp with time zone,
    days_in_stage integer
);


--
-- Name: lead_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tag_assignments (
    lead_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    applied_by uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_tag_assignments_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'flow'::text, 'ai_agent'::text, 'automation'::text, 'webhook'::text])))
);


--
-- Name: lead_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    description text,
    is_automatic boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_lifecycle_status boolean DEFAULT false NOT NULL
);


--
-- Name: lead_transfer_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_transfer_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    from_user_id uuid,
    to_user_id uuid,
    from_squad_id uuid,
    to_squad_id uuid,
    reason text,
    transferred_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    assigned_to uuid,
    current_stage_id uuid,
    name text NOT NULL,
    email text,
    phone text,
    company text,
    "position" text,
    source text,
    temperature public.lead_temperature DEFAULT 'warm'::public.lead_temperature,
    cadence_day integer DEFAULT 1,
    last_contact_at timestamp with time zone,
    next_action text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    lead_origin text,
    lead_channel text,
    referrer_url text,
    landing_page text,
    squad_id uuid,
    previous_assigned_to uuid,
    transferred_at timestamp with time zone,
    transferred_by uuid,
    transfer_reason text,
    expected_close_date date,
    deal_value numeric DEFAULT 0,
    bant_budget text,
    bant_authority text,
    bant_need text,
    bant_timing text,
    sdr_id uuid,
    closer_id uuid,
    sector_id uuid,
    phone_normalized text GENERATED ALWAYS AS (public.normalize_phone_br(phone)) STORED
);

ALTER TABLE ONLY public.leads REPLICA IDENTITY FULL;


--
-- Name: mass_email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mass_email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    template_id uuid,
    subject text NOT NULL,
    html_content text NOT NULL,
    target_type text DEFAULT 'all'::text NOT NULL,
    target_filters jsonb DEFAULT '{}'::jsonb,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    status text DEFAULT 'draft'::text,
    stats jsonb DEFAULT '{"sent": 0, "total": 0, "failed": 0}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mass_email_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mass_email_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    organization_id uuid,
    name text NOT NULL,
    type text NOT NULL,
    url text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    objective text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    emoji text NOT NULL,
    user_id uuid,
    visitor_id text,
    reactor_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_reactions_check CHECK ((((reactor_type = 'agent'::text) AND (user_id IS NOT NULL) AND (visitor_id IS NULL)) OR ((reactor_type = 'visitor'::text) AND (visitor_id IS NOT NULL) AND (user_id IS NULL)))),
    CONSTRAINT message_reactions_reactor_type_check CHECK ((reactor_type = ANY (ARRAY['agent'::text, 'visitor'::text])))
);

ALTER TABLE ONLY public.message_reactions REPLICA IDENTITY FULL;


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    notification_type text NOT NULL,
    reference_id uuid,
    reference_date date DEFAULT CURRENT_DATE,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type DEFAULT 'system'::public.notification_type NOT NULL,
    title text NOT NULL,
    message text,
    action_url text,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product_id uuid,
    admin_notification_id uuid
);


--
-- Name: objections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    organization_id uuid,
    category text NOT NULL,
    what_they_say text NOT NULL,
    what_they_mean text,
    suggested_response text NOT NULL,
    follow_up_question text,
    proof_material_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunity_scan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_scan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    lead_id uuid,
    classification text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    reason text,
    signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    suggested_action text,
    followup_message text,
    lead_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    action_applied boolean DEFAULT false NOT NULL,
    action_applied_at timestamp with time zone,
    action_result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunity_scan_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_scan_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    cron_expression text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notify_user_ids uuid[] DEFAULT ARRAY[]::uuid[],
    last_run_at timestamp with time zone,
    last_scan_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunity_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    triggered_by uuid,
    trigger_type text DEFAULT 'manual'::text NOT NULL,
    schedule_id uuid,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_candidates integer DEFAULT 0 NOT NULL,
    total_analyzed integer DEFAULT 0 NOT NULL,
    hot_count integer DEFAULT 0 NOT NULL,
    warm_count integer DEFAULT 0 NOT NULL,
    cold_count integer DEFAULT 0 NOT NULL,
    lost_count integer DEFAULT 0 NOT NULL,
    potential_revenue numeric DEFAULT 0 NOT NULL,
    cost_cents integer DEFAULT 0 NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.opportunity_scans REPLICA IDENTITY FULL;


--
-- Name: orchestration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    lead_id uuid,
    channel text,
    message_in text,
    produto_id uuid,
    produto_nome text,
    intencao text,
    confianca numeric,
    contexto_extraido text,
    agent_routed_to uuid,
    action text NOT NULL,
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_ai_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ai_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    provider text NOT NULL,
    api_key_encrypted text NOT NULL,
    api_key_masked text,
    model_default text,
    last_verified_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_ai_credentials_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'anthropic'::text, 'gemini'::text])))
);


--
-- Name: org_ai_routing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ai_routing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    capability text NOT NULL,
    provider text NOT NULL,
    model text,
    fallback_to_lovable boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_ai_routing_capability_check CHECK ((capability = ANY (ARRAY['agent_chat'::text, 'sales_copilot'::text, 'audio_transcription'::text, 'image_vision'::text, 'content_generation'::text, 'analysis_insights'::text, 'embeddings'::text]))),
    CONSTRAINT org_ai_routing_provider_check CHECK ((provider = ANY (ARRAY['lovable'::text, 'openai'::text, 'anthropic'::text, 'gemini'::text])))
);


--
-- Name: organization_orchestrator_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_orchestrator_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    orchestrator_agent_id uuid,
    max_triage_questions integer DEFAULT 2 NOT NULL,
    min_confidence numeric DEFAULT 0.6 NOT NULL,
    fallback_to_human_after integer DEFAULT 2 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    cnpj text,
    phone text,
    address jsonb,
    owner_id uuid,
    status text DEFAULT 'active'::text,
    max_users integer DEFAULT 10,
    max_products integer DEFAULT 5,
    features jsonb DEFAULT '{}'::jsonb,
    refund_policy text,
    payment_policy text,
    plan_id uuid,
    max_connections integer,
    cakto_subscription_id text,
    cakto_customer_email text,
    ai_debounce_ms integer DEFAULT 5000 NOT NULL,
    ai_grouping_enabled boolean DEFAULT true NOT NULL,
    ai_grouping_window_ms integer DEFAULT 3000 NOT NULL,
    ai_grouping_max_ms integer DEFAULT 8000 NOT NULL,
    ai_typing_min_ms integer DEFAULT 1500 NOT NULL,
    ai_typing_max_ms integer DEFAULT 7000 NOT NULL,
    ai_dedup_enabled boolean DEFAULT true NOT NULL,
    ai_dedup_window_ms integer DEFAULT 120000 NOT NULL,
    ai_single_processing_per_conversation boolean DEFAULT true NOT NULL,
    presence_enabled boolean DEFAULT true NOT NULL,
    presence_recording_enabled boolean DEFAULT true NOT NULL,
    presence_typing_chars_per_sec integer DEFAULT 28 NOT NULL,
    presence_jitter_pct integer DEFAULT 15 NOT NULL,
    plan_status text,
    plan_activated_at timestamp with time zone
);


--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    conversation_id uuid,
    lead_id uuid,
    title text NOT NULL,
    description text,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'BRL'::text NOT NULL,
    url text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    opened_at timestamp with time zone,
    paid_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_links_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_links_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'opened'::text, 'paid'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text,
    order_index integer DEFAULT 0 NOT NULL,
    is_won boolean DEFAULT false,
    is_lost boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text
);


--
-- Name: platform_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    logo_url text,
    logo_dark_url text,
    favicon_url text,
    platform_name text DEFAULT 'Bizon Sales'::text,
    support_email text,
    primary_color text DEFAULT '#10b981'::text,
    footer_text text DEFAULT '© 2026 Bizon Sales. Todos os direitos reservados.'::text,
    terms_url text,
    privacy_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    login_headline text,
    login_subheadline text,
    login_stats_enabled boolean DEFAULT true,
    powered_by_text text DEFAULT 'Powered by'::text,
    evolution_go_url text,
    evolution_go_global_api_key text,
    accent_color text DEFAULT '#84CC16'::text,
    gradient_style text DEFAULT 'vendus'::text,
    gradient_custom jsonb,
    border_radius integer DEFAULT 12,
    default_theme text DEFAULT 'dark'::text,
    font_family text DEFAULT 'Inter'::text,
    font_url text,
    base_font_size integer DEFAULT 16,
    login_bg_image_url text,
    login_logo_position text DEFAULT 'left'::text,
    hide_widget_branding boolean DEFAULT false,
    widget_accent_color text,
    browser_title text,
    meta_description text,
    og_image_url text,
    twitter_handle text,
    default_language text DEFAULT 'pt-BR'::text,
    login_bg_layout text DEFAULT 'split-left'::text NOT NULL,
    default_password_changed boolean DEFAULT false NOT NULL,
    google_oauth_configured boolean DEFAULT false NOT NULL,
    remix_setup_completed boolean DEFAULT false NOT NULL,
    super_admin_bootstrapped boolean DEFAULT false NOT NULL,
    super_admin_bootstrapped_at timestamp with time zone,
    public_app_url text,
    CONSTRAINT platform_settings_login_bg_layout_check CHECK ((login_bg_layout = ANY (ARRAY['fullscreen'::text, 'split-left'::text, 'split-right'::text])))
);


--
-- Name: platform_branding_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.platform_branding_public WITH (security_invoker='true') AS
 SELECT id,
    logo_url,
    logo_dark_url,
    favicon_url,
    platform_name,
    support_email,
    primary_color,
    accent_color,
    gradient_style,
    gradient_custom,
    border_radius,
    default_theme,
    font_family,
    font_url,
    base_font_size,
    footer_text,
    terms_url,
    privacy_url,
    login_headline,
    login_subheadline,
    login_stats_enabled,
    login_bg_image_url,
    login_bg_layout,
    login_logo_position,
    hide_widget_branding,
    widget_accent_color,
    powered_by_text,
    browser_title,
    meta_description,
    og_image_url,
    twitter_handle,
    default_language,
    created_at,
    updated_at,
    public_app_url
   FROM public.platform_settings;


--
-- Name: platform_email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_email_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'lovable_emails'::text,
    api_key_encrypted text,
    sender_email text DEFAULT 'noreply@bizonsales.com'::text,
    sender_name text DEFAULT 'Bizon Sales'::text,
    smtp_host text,
    smtp_port integer,
    smtp_user text,
    smtp_pass_encrypted text,
    reminder_days_before integer DEFAULT 3,
    reminder_on_due_date boolean DEFAULT true,
    alert_days_after integer DEFAULT 3,
    suspend_days_after integer DEFAULT 15,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_email_templates_category_check CHECK ((category = ANY (ARRAY['acesso'::text, 'cobranca'::text, 'sistema'::text, 'mala_direta'::text])))
);


--
-- Name: platform_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    price_monthly numeric(10,2) DEFAULT 0 NOT NULL,
    price_yearly numeric(10,2) DEFAULT 0 NOT NULL,
    trial_days integer DEFAULT 7 NOT NULL,
    grace_period_days integer DEFAULT 3 NOT NULL,
    max_users integer DEFAULT 5 NOT NULL,
    max_connections integer DEFAULT 1 NOT NULL,
    max_sectors integer DEFAULT 3 NOT NULL,
    max_products integer DEFAULT 5 NOT NULL,
    max_contacts integer DEFAULT 1000 NOT NULL,
    max_messages_month integer DEFAULT 5000 NOT NULL,
    max_ai_tokens_month integer DEFAULT 100000 NOT NULL,
    feature_whatsapp boolean DEFAULT true NOT NULL,
    feature_facebook boolean DEFAULT false NOT NULL,
    feature_instagram boolean DEFAULT false NOT NULL,
    feature_campaigns boolean DEFAULT false NOT NULL,
    feature_scheduling boolean DEFAULT true NOT NULL,
    feature_internal_chat boolean DEFAULT true NOT NULL,
    feature_external_api boolean DEFAULT false NOT NULL,
    feature_kanban boolean DEFAULT true NOT NULL,
    feature_pipeline boolean DEFAULT true NOT NULL,
    feature_integrations boolean DEFAULT false NOT NULL,
    feature_audio_transcription_ai boolean DEFAULT false NOT NULL,
    feature_text_correction_ai boolean DEFAULT false NOT NULL,
    feature_ai_agents boolean DEFAULT false NOT NULL,
    feature_voice_agents boolean DEFAULT false NOT NULL,
    feature_outreach boolean DEFAULT false NOT NULL,
    feature_capture_funnels boolean DEFAULT false NOT NULL,
    feature_forms boolean DEFAULT true NOT NULL,
    feature_webhooks boolean DEFAULT false NOT NULL,
    extra_features jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checkout_url text,
    highlight_label text,
    cakto_product_id text,
    checkout_url_cakto text,
    cakto_offer_slug text,
    checkout_url_yearly text
);


--
-- Name: platform_release_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_release_reads (
    user_id uuid NOT NULL,
    release_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text,
    title text NOT NULL,
    summary text,
    release_types text[] DEFAULT '{}'::text[] NOT NULL,
    content_json jsonb,
    content_html text,
    cover_image_url text,
    is_published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_sale_event_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_sale_event_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    event_type text NOT NULL,
    target_stage_id uuid,
    email_template_id uuid,
    agent_id uuid,
    agent_objective text,
    agent_extra_context text,
    notify_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    add_tag_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    remove_tag_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    send_mode text DEFAULT 'none'::text NOT NULL,
    flow_id uuid,
    inline_message text,
    message_channel text DEFAULT 'whatsapp'::text NOT NULL,
    deal_outcome text DEFAULT 'none'::text NOT NULL,
    deal_value_source text DEFAULT 'none'::text NOT NULL,
    deal_value_manual numeric,
    assign_sector_id uuid,
    assign_user_id uuid,
    evolution_instance_id uuid,
    delay_minutes integer DEFAULT 0 NOT NULL,
    agent_outreach_mode text DEFAULT 'direct'::text NOT NULL,
    CONSTRAINT post_sale_actions_deal_outcome_check CHECK ((deal_outcome = ANY (ARRAY['none'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT post_sale_actions_deal_value_source_check CHECK ((deal_value_source = ANY (ARRAY['none'::text, 'webhook'::text, 'manual'::text]))),
    CONSTRAINT post_sale_actions_delay_minutes_check CHECK (((delay_minutes >= 0) AND (delay_minutes <= 10080))),
    CONSTRAINT post_sale_actions_message_channel_check CHECK ((message_channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT post_sale_actions_send_mode_check CHECK ((send_mode = ANY (ARRAY['none'::text, 'flow'::text, 'message'::text]))),
    CONSTRAINT post_sale_event_actions_agent_outreach_mode_check CHECK ((agent_outreach_mode = ANY (ARRAY['direct'::text, 'conversational'::text]))),
    CONSTRAINT post_sale_event_actions_event_check CHECK ((event_type = ANY (ARRAY['compra_aprovada'::text, 'pix_gerado'::text, 'boleto_gerado'::text, 'carrinho_abandonado'::text, 'checkout_abandonado'::text, 'reembolso'::text, 'chargeback'::text, 'assinatura_cancelada'::text])))
);


--
-- Name: post_sale_event_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_sale_event_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    event_type text NOT NULL,
    lead_id uuid,
    source text NOT NULL,
    action_id uuid,
    executed_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_sale_scheduled_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_sale_scheduled_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    action_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    event_type text NOT NULL,
    source text DEFAULT 'webhook'::text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_sale_scheduled_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'canceled'::text])))
);


--
-- Name: processed_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid,
    remote_jid text,
    message_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    name character varying(100) NOT NULL,
    description text,
    avatar_url text,
    agent_type character varying(50) DEFAULT 'custom'::character varying NOT NULL,
    primary_objective text NOT NULL,
    can_do text[] DEFAULT '{}'::text[],
    cannot_do text[] DEFAULT '{}'::text[],
    handoff_triggers text[] DEFAULT '{}'::text[],
    end_conversation_triggers text[] DEFAULT '{}'::text[],
    tone_style character varying(30) DEFAULT 'friendly'::character varying,
    message_style character varying(20) DEFAULT 'balanced'::character varying,
    always_end_with_question boolean DEFAULT true,
    additional_prompt text,
    required_phrases text[] DEFAULT '{}'::text[],
    prohibited_phrases text[] DEFAULT '{}'::text[],
    auto_tag_leads boolean DEFAULT true,
    default_tags text[] DEFAULT '{}'::text[],
    can_update_pipeline boolean DEFAULT true,
    can_create_tasks boolean DEFAULT true,
    can_schedule_meetings boolean DEFAULT true,
    active_in_funnels boolean DEFAULT true,
    active_in_chat boolean DEFAULT true,
    active_in_widget boolean DEFAULT true,
    active_in_inbox boolean DEFAULT true,
    active_in_copilot boolean DEFAULT false,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    can_apply_tags boolean DEFAULT false NOT NULL,
    can_update_lead boolean DEFAULT false NOT NULL,
    can_send_emails boolean DEFAULT false NOT NULL,
    can_send_materials boolean DEFAULT false NOT NULL,
    can_trigger_flows boolean DEFAULT false NOT NULL,
    can_transfer boolean DEFAULT false NOT NULL,
    can_notify boolean DEFAULT false NOT NULL,
    can_add_notes boolean DEFAULT false NOT NULL,
    can_start_cadence boolean DEFAULT false NOT NULL,
    can_qualify boolean DEFAULT false NOT NULL,
    tool_configs jsonb DEFAULT '{}'::jsonb NOT NULL,
    active_in_whatsapp boolean DEFAULT true,
    active_in_instagram boolean DEFAULT true,
    active_in_facebook boolean DEFAULT true,
    activation_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    activation_phrases text[] DEFAULT '{}'::text[] NOT NULL,
    activation_priority integer DEFAULT 0 NOT NULL,
    activation_scope text DEFAULT 'all'::text NOT NULL,
    takeover_on_match boolean DEFAULT true NOT NULL,
    evolution_instance_id uuid,
    handoff_outgoing_message text,
    handoff_incoming_message text,
    handoff_delay_seconds integer DEFAULT 4 NOT NULL,
    message_delay_seconds integer DEFAULT 2 NOT NULL,
    handoff_include_summary boolean DEFAULT true NOT NULL,
    welcome_enabled boolean DEFAULT false NOT NULL,
    welcome_message text,
    quick_menu_mode text DEFAULT 'off'::text NOT NULL,
    quick_menu_intro text,
    quick_menu_options jsonb DEFAULT '[]'::jsonb NOT NULL,
    quick_menu_invalid_message text,
    enable_audio_transcription boolean DEFAULT true NOT NULL,
    enable_image_vision boolean DEFAULT true NOT NULL,
    default_schedule_user_id uuid,
    allowed_event_type_ids uuid[] DEFAULT '{}'::uuid[],
    booking_notification_user_ids uuid[] DEFAULT '{}'::uuid[],
    booking_notify_org_admins boolean DEFAULT false,
    humanization jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT product_agents_quick_menu_mode_check CHECK ((quick_menu_mode = ANY (ARRAY['off'::text, 'always'::text, 'fallback'::text])))
);


--
-- Name: product_catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_catalog_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    external_id text,
    title text NOT NULL,
    description text,
    price numeric(12,2),
    currency text DEFAULT 'BRL'::text,
    url text,
    thumbnail_url text,
    images text[] DEFAULT '{}'::text[],
    attributes jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_url text,
    is_active boolean DEFAULT true NOT NULL,
    search_vector tsvector,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    videos text[] DEFAULT '{}'::text[] NOT NULL,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT product_catalog_items_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'firecrawl'::text, 'webhook'::text, 'api'::text, 'csv'::text])))
);


--
-- Name: product_ctas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_ctas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    organization_id uuid NOT NULL,
    cta_type text NOT NULL,
    label text NOT NULL,
    action_url text,
    whatsapp_number text,
    whatsapp_message text,
    icon text DEFAULT 'link'::text,
    trigger_keywords text[],
    intent_level text DEFAULT 'medium'::text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    video_url text,
    CONSTRAINT product_ctas_cta_type_check CHECK ((cta_type = ANY (ARRAY['checkout'::text, 'whatsapp'::text, 'calendar'::text, 'callback'::text, 'video'::text, 'custom'::text]))),
    CONSTRAINT product_ctas_intent_level_check CHECK ((intent_level = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: product_knowledge_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_knowledge_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    source_type character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    extracted_content text,
    raw_content text,
    file_url text,
    file_type character varying,
    file_size integer,
    source_url text,
    last_crawled_at timestamp with time zone,
    video_id character varying,
    video_duration integer,
    transcript text,
    question text,
    answer text,
    data_category character varying,
    data_json jsonb,
    processing_status character varying DEFAULT 'pending'::character varying,
    processing_error text,
    processed_at timestamp with time zone,
    is_active boolean DEFAULT true,
    is_synced boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT product_knowledge_sources_processing_status_check CHECK (((processing_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT product_knowledge_sources_source_type_check CHECK (((source_type)::text = ANY (ARRAY[('file'::character varying)::text, ('website'::character varying)::text, ('youtube'::character varying)::text, ('faq'::character varying)::text, ('data'::character varying)::text, ('training'::character varying)::text])))
);


--
-- Name: product_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    name text NOT NULL,
    role text DEFAULT 'main'::text NOT NULL,
    cakto_product_id text,
    external_source text DEFAULT 'cakto'::text,
    price numeric(12,2),
    currency text DEFAULT 'BRL'::text,
    "position" integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_offers_role_check CHECK ((role = ANY (ARRAY['main'::text, 'front_end'::text, 'order_bump'::text, 'upsell'::text, 'downsell'::text, 'cross_sell'::text])))
);


--
-- Name: product_onboarding_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_onboarding_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    current_step integer DEFAULT 1,
    total_steps integer DEFAULT 8,
    draft_data jsonb DEFAULT '{}'::jsonb,
    ai_optimizations jsonb DEFAULT '[]'::jsonb,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_suites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_suites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    icon_url text,
    color text DEFAULT '#10B981'::text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_training_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_training_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    video_url text NOT NULL,
    thumbnail_url text,
    duration_seconds integer,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    pitch_15s text,
    pitch_30s text,
    pitch_2min text,
    icp text,
    differentials text[] DEFAULT '{}'::text[],
    pricing jsonb DEFAULT '[]'::jsonb,
    status public.product_status DEFAULT 'draft'::public.product_status,
    settings jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text,
    banner_url text,
    product_image_url text,
    category text,
    short_description text,
    external_links jsonb DEFAULT '{}'::jsonb,
    benefits text,
    objections text,
    plans text,
    payment_conditions text,
    guarantee text,
    bonuses text,
    discount_policy text,
    knowledge_base text,
    suite_id uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    organization_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    phone text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_slug text,
    booking_bio text,
    recovery_whatsapp text,
    work_start_time time without time zone DEFAULT '00:00:00'::time without time zone,
    work_end_time time without time zone DEFAULT '23:59:00'::time without time zone,
    farewell_message text,
    default_theme text DEFAULT 'system'::text,
    default_menu_state text DEFAULT 'open'::text,
    default_connection_id uuid,
    guided_onboarding_completed_at timestamp with time zone,
    guided_onboarding_skipped_at timestamp with time zone
);


--
-- Name: public_booking_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_booking_profiles WITH (security_invoker='true') AS
 SELECT id,
    full_name,
    avatar_url,
    booking_slug,
    booking_bio
   FROM public.profiles
  WHERE ((booking_slug IS NOT NULL) AND (booking_slug <> ''::text));


--
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    shortcut text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: quiz_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    category text NOT NULL,
    objective text,
    description text,
    thumbnail text,
    icon text,
    cover_gradient text,
    badges text[] DEFAULT '{}'::text[] NOT NULL,
    estimated_time text,
    question_count integer DEFAULT 0 NOT NULL,
    flow_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    appearance_json jsonb,
    settings_json jsonb,
    scoring_json jsonb,
    results_json jsonb,
    is_official boolean DEFAULT false NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sales_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid,
    organization_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    target_value numeric DEFAULT 0 NOT NULL,
    target_deals integer DEFAULT 0 NOT NULL,
    achieved_value numeric DEFAULT 0,
    achieved_deals integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: sales_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    email text NOT NULL,
    phone text,
    company_size text,
    segment text,
    current_tools text,
    main_challenge text,
    message text,
    status text DEFAULT 'new'::text,
    notes text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sales_squads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_squads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon_url text,
    product_id uuid,
    organization_id uuid NOT NULL,
    leader_id uuid,
    color text DEFAULT '#6366F1'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: sankhya_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sankhya_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type text NOT NULL,
    local_id uuid NOT NULL,
    sankhya_id text NOT NULL,
    last_sync_at timestamp with time zone,
    sync_status text DEFAULT 'pending'::text,
    sync_direction text DEFAULT 'from_sankhya'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sankhya_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sankhya_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    sync_type text NOT NULL,
    entity_type text NOT NULL,
    records_processed integer DEFAULT 0,
    records_success integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    error_details jsonb,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text
);


--
-- Name: scheduled_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    content text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text,
    created_by uuid,
    organization_id uuid,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sector_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3B82F6'::text,
    description text,
    bot_order integer DEFAULT 0,
    greeting_message text,
    farewell_message text,
    auto_close_ticket boolean DEFAULT false,
    enable_scheduling boolean DEFAULT false,
    rotation_enabled boolean DEFAULT false,
    rotation_strategy public.sector_rotation_strategy DEFAULT 'round_robin'::public.sector_rotation_strategy,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon text DEFAULT 'Building2'::text,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: seller_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    notify_new_booking boolean DEFAULT true NOT NULL,
    notify_confirmed boolean DEFAULT true NOT NULL,
    notify_reschedule boolean DEFAULT true NOT NULL,
    notify_cancel boolean DEFAULT true NOT NULL,
    channel text DEFAULT 'both'::text NOT NULL,
    whatsapp_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seller_notification_settings_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'both'::text])))
);


--
-- Name: sent_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sent_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    response_hash text NOT NULL,
    response_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: squad_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    squad_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT now()
);


--
-- Name: stage_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    product_id uuid NOT NULL,
    expected_value numeric DEFAULT 0,
    probability_percent numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stage_values_probability_percent_check CHECK (((probability_percent >= (0)::numeric) AND (probability_percent <= (100)::numeric)))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    plan_type text DEFAULT 'trial'::text,
    status text DEFAULT 'active'::text,
    price_monthly numeric(10,2) DEFAULT 0,
    billing_cycle text DEFAULT 'monthly'::text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    canceled_at timestamp with time zone,
    payment_method jsonb,
    stripe_customer_id text,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    plan_id uuid
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid NOT NULL,
    author_role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_author_role_check CHECK ((author_role = ANY (ARRAY['admin'::text, 'super_admin'::text])))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid NOT NULL,
    subject text NOT NULL,
    category text,
    status public.support_ticket_status DEFAULT 'open'::public.support_ticket_status NOT NULL,
    priority public.support_ticket_priority DEFAULT 'normal'::public.support_ticket_priority NOT NULL,
    assigned_super_admin uuid,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_by_role text DEFAULT 'admin'::text NOT NULL,
    unread_for_admin boolean DEFAULT false NOT NULL,
    unread_for_super_admin boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppressed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppressed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])))
);


--
-- Name: tag_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    event_type text NOT NULL,
    tag_id_to_add uuid NOT NULL,
    tag_id_to_remove uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tag_automations_event_type_check CHECK ((event_type = ANY (ARRAY['compra_aprovada'::text, 'pix_gerado'::text, 'boleto_gerado'::text, 'checkout_abandonado'::text, 'reembolso'::text, 'chargeback'::text, 'assinatura_cancelada'::text])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    lead_id uuid,
    product_id uuid,
    title text NOT NULL,
    description text,
    type text DEFAULT 'follow_up'::text,
    status public.task_status DEFAULT 'pending'::public.task_status,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: team_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role public.app_role DEFAULT 'seller'::public.app_role NOT NULL,
    squad_id uuid,
    invited_by uuid,
    organization_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: user_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    badge_type text NOT NULL,
    badge_name text NOT NULL,
    description text,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: user_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_settings (
    user_id uuid NOT NULL,
    organization_id uuid,
    notify_new_tickets boolean DEFAULT true,
    notify_status_change boolean DEFAULT true,
    notify_new_messages boolean DEFAULT true,
    notify_groups boolean DEFAULT false,
    notify_unassigned_sector_tickets boolean DEFAULT false,
    notify_appointments boolean DEFAULT true,
    push_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    view_queue_conversations boolean DEFAULT false,
    view_other_users_conversations boolean DEFAULT false,
    view_other_queues_conversations boolean DEFAULT false,
    allow_close_pending_tickets boolean DEFAULT true,
    view_all_contacts boolean DEFAULT false,
    allow_pipeline boolean DEFAULT false,
    allow_manage_client_portfolio boolean DEFAULT false,
    view_all_kanban_cards boolean DEFAULT false,
    view_all_schedules boolean DEFAULT false,
    allow_dashboard boolean DEFAULT false,
    allow_inbox_panel boolean DEFAULT false,
    allow_groups boolean DEFAULT false,
    allow_connection_actions boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    view_unassigned_sector_tickets boolean DEFAULT false,
    view_schedules_mode text DEFAULT 'mine_only'::text
);


--
-- Name: user_product_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_product_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    assigned_by uuid,
    monthly_goal numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'seller'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    last_status_change timestamp with time zone DEFAULT now() NOT NULL,
    active_leads_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_status_status_check CHECK ((status = ANY (ARRAY['online'::text, 'away'::text, 'offline'::text])))
);


--
-- Name: v_agent_quality_30d; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_agent_quality_30d WITH (security_invoker='true') AS
 SELECT organization_id,
    agent_id,
    (count(*))::integer AS evaluations,
    round(avg(score_overall), 2) AS avg_overall,
    round(avg(score_clarity), 2) AS avg_clarity,
    round(avg(score_tone), 2) AS avg_tone,
    round(avg(score_objectivity), 2) AS avg_objectivity,
    round(avg(score_accuracy), 2) AS avg_accuracy,
    round(avg(score_conversion_potential), 2) AS avg_conversion_potential
   FROM public.ai_quality_evaluations
  WHERE (created_at >= (now() - '30 days'::interval))
  GROUP BY organization_id, agent_id;


--
-- Name: webchat_agent_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    widget_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid,
    agent_name text DEFAULT 'Assistente Virtual'::text,
    agent_avatar_url text,
    system_prompt text DEFAULT 'Você é um assistente virtual prestativo e amigável. Responda de forma clara e objetiva.'::text,
    knowledge_base text,
    faq jsonb DEFAULT '[]'::jsonb,
    handoff_triggers text[] DEFAULT ARRAY['falar com atendente'::text, 'falar com humano'::text, 'atendente'::text, 'quero comprar'::text, 'preço'::text, 'valor'::text],
    auto_handoff_enabled boolean DEFAULT true,
    greeting_message text DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudar você hoje?'::text,
    fallback_message text DEFAULT 'Desculpe, não entendi. Posso transferir você para um atendente?'::text,
    handoff_message text DEFAULT 'Certo! Estou transferindo você para um atendente. Aguarde um momento.'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    temperature numeric DEFAULT 0.7,
    max_tokens integer DEFAULT 500,
    persona_style text DEFAULT 'friendly'::text,
    use_product_brain boolean DEFAULT true,
    collect_before_chat boolean DEFAULT true,
    required_fields text[] DEFAULT ARRAY['name'::text, 'whatsapp'::text],
    welcome_flow jsonb DEFAULT '[]'::jsonb,
    sales_prompt text,
    sales_context text,
    chunked_messages_enabled boolean DEFAULT true,
    typing_delay_ms integer DEFAULT 1500,
    max_message_length integer DEFAULT 150
);


--
-- Name: webchat_assignment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_assignment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    from_user_id uuid,
    to_user_id uuid,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT webchat_assignment_events_action_check CHECK ((action = ANY (ARRAY['assigned'::text, 'unassigned'::text, 'transferred'::text, 'auto_assigned'::text])))
);


--
-- Name: webchat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    widget_id uuid,
    channel text DEFAULT 'web_chat'::text NOT NULL,
    status public.webchat_conversation_status DEFAULT 'bot_active'::public.webchat_conversation_status NOT NULL,
    visitor_id text NOT NULL,
    visitor_name text,
    visitor_email text,
    visitor_phone text,
    visitor_ip text,
    visitor_user_agent text,
    assigned_user_id uuid,
    lead_id uuid,
    current_page_url text,
    referrer_url text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    last_message_at timestamp with time zone,
    unread_count_agents integer DEFAULT 0,
    first_response_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    visitor_whatsapp text,
    lead_created_at timestamp with time zone,
    data_collected boolean DEFAULT false,
    collected_data jsonb DEFAULT '{}'::jsonb,
    current_flow_id uuid,
    current_block_id text,
    flow_variables jsonb DEFAULT '{}'::jsonb,
    flow_completed boolean DEFAULT false,
    current_agent_id uuid,
    evolution_instance_id uuid,
    orchestrator_state text DEFAULT 'triagem'::text NOT NULL,
    orchestrator_context text,
    orchestrator_question_count integer DEFAULT 0 NOT NULL,
    detected_intent text,
    flow_source text,
    sector_id uuid,
    meeting_scheduled_at timestamp with time zone,
    meeting_event_id text,
    meeting_metadata jsonb,
    visitor_avatar_url text,
    product_id uuid,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    needs_human boolean DEFAULT false NOT NULL,
    visitor_phone_normalized text GENERATED ALWAYS AS (public.normalize_phone_br(visitor_phone)) STORED,
    welcome_sent_at timestamp with time zone,
    bot_locked_until timestamp with time zone,
    last_message_content text,
    last_message_metadata jsonb,
    last_message_sender_type text,
    last_message_created_at timestamp with time zone,
    CONSTRAINT webchat_conversations_flow_source_check CHECK (((flow_source IS NULL) OR (flow_source = ANY (ARRAY['chat_flow'::text, 'funnel'::text, 'webhook_trigger'::text]))))
);

ALTER TABLE ONLY public.webchat_conversations REPLICA IDENTITY FULL;


--
-- Name: webchat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    direction text NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    content text NOT NULL,
    content_type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    message_type text DEFAULT 'text'::text,
    buttons jsonb,
    video_url text,
    is_deleted boolean DEFAULT false,
    edited_at timestamp with time zone,
    original_content text,
    reply_to_message_id uuid,
    is_starred boolean DEFAULT false,
    forwarded_from_message_id uuid,
    CONSTRAINT webchat_messages_content_type_check CHECK ((content_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'audio'::text]))),
    CONSTRAINT webchat_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT webchat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['visitor'::text, 'bot'::text, 'agent'::text])))
);


--
-- Name: webchat_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text DEFAULT 'Widget Principal'::text NOT NULL,
    is_active boolean DEFAULT true,
    primary_color text DEFAULT '#14B8A6'::text,
    secondary_color text DEFAULT '#0F172A'::text,
    welcome_message text DEFAULT 'Olá! Como posso ajudar?'::text,
    placeholder_text text DEFAULT 'Digite sua mensagem...'::text,
    "position" text DEFAULT 'bottom-right'::text,
    avatar_url text,
    auto_open_delay integer,
    business_hours jsonb DEFAULT '{"enabled": false}'::jsonb,
    offline_message text DEFAULT 'Estamos offline no momento. Deixe sua mensagem!'::text,
    collect_email boolean DEFAULT false,
    collect_phone boolean DEFAULT false,
    collect_name boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    product_id uuid,
    CONSTRAINT webchat_widgets_position_check CHECK (("position" = ANY (ARRAY['bottom-right'::text, 'bottom-left'::text])))
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    request_method text NOT NULL,
    request_headers jsonb,
    request_body jsonb,
    request_ip text,
    parsed_fields jsonb,
    status text DEFAULT 'pending'::text,
    actions_executed jsonb DEFAULT '[]'::jsonb,
    error_message text,
    lead_id uuid,
    processing_time_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_sample_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_sample_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    name text,
    request_body jsonb NOT NULL,
    extracted_fields jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    is_test_mode boolean DEFAULT true,
    secret_key text,
    allowed_ips text[],
    product_id uuid,
    actions jsonb DEFAULT '[]'::jsonb,
    identification_config jsonb DEFAULT '{}'::jsonb,
    requests_count integer DEFAULT 0,
    requests_this_month integer DEFAULT 0,
    last_request_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    squad_id uuid
);


--
-- Name: admin_agent_messages admin_agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_agent_messages
    ADD CONSTRAINT admin_agent_messages_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: agent_action_logs agent_action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_activation_logs agent_activation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_handoff_history agent_handoff_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_handoff_history
    ADD CONSTRAINT agent_handoff_history_pkey PRIMARY KEY (id);


--
-- Name: agent_post_sale_scenarios agent_post_sale_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_post_sale_scenarios
    ADD CONSTRAINT agent_post_sale_scenarios_pkey PRIMARY KEY (id);


--
-- Name: agent_routing_rules agent_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routing_rules
    ADD CONSTRAINT agent_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: agent_safety_limits agent_safety_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_safety_limits
    ADD CONSTRAINT agent_safety_limits_pkey PRIMARY KEY (organization_id);


--
-- Name: agent_specialists agent_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_specialists
    ADD CONSTRAINT agent_specialists_pkey PRIMARY KEY (id);


--
-- Name: agent_tool_executions agent_tool_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool_executions
    ADD CONSTRAINT agent_tool_executions_pkey PRIMARY KEY (id);


--
-- Name: agent_training_materials agent_training_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_materials
    ADD CONSTRAINT agent_training_materials_pkey PRIMARY KEY (id);


--
-- Name: ai_audits ai_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_audits
    ADD CONSTRAINT ai_audits_pkey PRIMARY KEY (id);


--
-- Name: ai_insights ai_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_base ai_knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_base
    ADD CONSTRAINT ai_knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: ai_outreach_queue ai_outreach_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_pkey PRIMARY KEY (id);


--
-- Name: ai_prompt_experiments ai_prompt_experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_experiments
    ADD CONSTRAINT ai_prompt_experiments_pkey PRIMARY KEY (id);


--
-- Name: ai_prompt_variants ai_prompt_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_variants
    ADD CONSTRAINT ai_prompt_variants_pkey PRIMARY KEY (id);


--
-- Name: ai_quality_evaluations ai_quality_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_quality_evaluations
    ADD CONSTRAINT ai_quality_evaluations_pkey PRIMARY KEY (id);


--
-- Name: ai_response_feedback ai_response_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_feedback
    ADD CONSTRAINT ai_response_feedback_pkey PRIMARY KEY (id);


--
-- Name: ai_router_failures ai_router_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_router_failures
    ADD CONSTRAINT ai_router_failures_pkey PRIMARY KEY (id);


--
-- Name: auto_notification_settings auto_notification_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_notification_settings
    ADD CONSTRAINT auto_notification_settings_organization_id_key UNIQUE (organization_id);


--
-- Name: auto_notification_settings auto_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_notification_settings
    ADD CONSTRAINT auto_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: availability_overrides availability_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_overrides
    ADD CONSTRAINT availability_overrides_pkey PRIMARY KEY (id);


--
-- Name: availability_overrides availability_overrides_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_overrides
    ADD CONSTRAINT availability_overrides_user_id_date_key UNIQUE (user_id, date);


--
-- Name: billing_history billing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_history
    ADD CONSTRAINT billing_history_pkey PRIMARY KEY (id);


--
-- Name: booking_event_types booking_event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_event_types
    ADD CONSTRAINT booking_event_types_pkey PRIMARY KEY (id);


--
-- Name: booking_event_types booking_event_types_user_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_event_types
    ADD CONSTRAINT booking_event_types_user_id_slug_key UNIQUE (user_id, slug);


--
-- Name: booking_logs booking_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_logs
    ADD CONSTRAINT booking_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_notification_settings booking_notification_settings_event_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_notification_settings
    ADD CONSTRAINT booking_notification_settings_event_type_id_key UNIQUE (event_type_id);


--
-- Name: booking_notification_settings booking_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_notification_settings
    ADD CONSTRAINT booking_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: booking_reminders booking_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_pkey PRIMARY KEY (id);


--
-- Name: booking_requests booking_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_pkey PRIMARY KEY (id);


--
-- Name: booking_scheduled_jobs booking_scheduled_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_scheduled_jobs
    ADD CONSTRAINT booking_scheduled_jobs_pkey PRIMARY KEY (id);


--
-- Name: booking_status_history booking_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_pkey PRIMARY KEY (id);


--
-- Name: business_holidays business_holidays_organization_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_holidays
    ADD CONSTRAINT business_holidays_organization_id_date_key UNIQUE (organization_id, date);


--
-- Name: business_holidays business_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_holidays
    ADD CONSTRAINT business_holidays_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_organization_id_key UNIQUE (organization_id);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: cadence_api_keys cadence_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_api_keys
    ADD CONSTRAINT cadence_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: cadence_api_keys cadence_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_api_keys
    ADD CONSTRAINT cadence_api_keys_pkey PRIMARY KEY (id);


--
-- Name: cadence_enrollments cadence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_enrollments
    ADD CONSTRAINT cadence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: cadence_step_runs cadence_step_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_step_runs
    ADD CONSTRAINT cadence_step_runs_pkey PRIMARY KEY (id);


--
-- Name: cadence_steps cadence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_steps
    ADD CONSTRAINT cadence_steps_pkey PRIMARY KEY (id);


--
-- Name: cadence_templates cadence_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_templates
    ADD CONSTRAINT cadence_templates_pkey PRIMARY KEY (id);


--
-- Name: cadences cadences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadences
    ADD CONSTRAINT cadences_pkey PRIMARY KEY (id);


--
-- Name: cakto_credentials cakto_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_credentials
    ADD CONSTRAINT cakto_credentials_pkey PRIMARY KEY (id);


--
-- Name: cakto_orders cakto_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_pkey PRIMARY KEY (id);


--
-- Name: cakto_recovery_config cakto_recovery_config_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_config
    ADD CONSTRAINT cakto_recovery_config_organization_id_key UNIQUE (organization_id);


--
-- Name: cakto_recovery_config cakto_recovery_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_config
    ADD CONSTRAINT cakto_recovery_config_pkey PRIMARY KEY (id);


--
-- Name: cakto_recovery_dispatches cakto_recovery_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_dispatches
    ADD CONSTRAINT cakto_recovery_dispatches_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: campaign_contexts campaign_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contexts
    ADD CONSTRAINT campaign_contexts_pkey PRIMARY KEY (id);


--
-- Name: campaign_targets campaign_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_pkey PRIMARY KEY (id);


--
-- Name: campaign_targets campaign_targets_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_unique UNIQUE (campaign_id, lead_id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: capture_funnels capture_funnels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_pkey PRIMARY KEY (id);


--
-- Name: catalog_sync_logs catalog_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_sync_logs
    ADD CONSTRAINT catalog_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: chat_flows chat_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_flows
    ADD CONSTRAINT chat_flows_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: conversation_notes conversation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_pkey PRIMARY KEY (id);


--
-- Name: conversation_processing_locks conversation_processing_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_processing_locks
    ADD CONSTRAINT conversation_processing_locks_pkey PRIMARY KEY (conversation_id);


--
-- Name: conversation_transfers conversation_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_pkey PRIMARY KEY (id);


--
-- Name: custom_fields custom_fields_organization_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_organization_id_field_key_key UNIQUE (organization_id, field_key);


--
-- Name: custom_fields custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: distribution_config distribution_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_config
    ADD CONSTRAINT distribution_config_pkey PRIMARY KEY (id);


--
-- Name: distribution_config distribution_config_squad_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_config
    ADD CONSTRAINT distribution_config_squad_id_key UNIQUE (squad_id);


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);


--
-- Name: email_send_state email_send_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_state
    ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_organization_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_organization_id_slug_key UNIQUE (organization_id, slug);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);


--
-- Name: evolution_instances evolution_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_instances
    ADD CONSTRAINT evolution_instances_pkey PRIMARY KEY (id);


--
-- Name: facebook_lead_integrations facebook_lead_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_integrations
    ADD CONSTRAINT facebook_lead_integrations_pkey PRIMARY KEY (id);


--
-- Name: facebook_lead_logs facebook_lead_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_logs
    ADD CONSTRAINT facebook_lead_logs_pkey PRIMARY KEY (id);


--
-- Name: form_blocks form_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_blocks
    ADD CONSTRAINT form_blocks_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: form_templates form_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);


--
-- Name: forms forms_organization_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_organization_id_slug_key UNIQUE (organization_id, slug);


--
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);


--
-- Name: funnel_analytics funnel_analytics_funnel_id_channel_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_analytics
    ADD CONSTRAINT funnel_analytics_funnel_id_channel_date_key UNIQUE (funnel_id, channel, date);


--
-- Name: funnel_analytics funnel_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_analytics
    ADD CONSTRAINT funnel_analytics_pkey PRIMARY KEY (id);


--
-- Name: funnel_webhook_logs funnel_webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_webhook_logs
    ADD CONSTRAINT funnel_webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_connections google_calendar_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_connections
    ADD CONSTRAINT google_calendar_connections_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_connections google_calendar_connections_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_connections
    ADD CONSTRAINT google_calendar_connections_user_id_key UNIQUE (user_id);


--
-- Name: help_article_feedback help_article_feedback_article_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_feedback
    ADD CONSTRAINT help_article_feedback_article_id_user_id_key UNIQUE (article_id, user_id);


--
-- Name: help_article_feedback help_article_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_feedback
    ADD CONSTRAINT help_article_feedback_pkey PRIMARY KEY (id);


--
-- Name: help_articles help_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_pkey PRIMARY KEY (id);


--
-- Name: help_articles help_articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_slug_key UNIQUE (slug);


--
-- Name: help_categories help_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_categories
    ADD CONSTRAINT help_categories_pkey PRIMARY KEY (id);


--
-- Name: help_categories help_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_categories
    ADD CONSTRAINT help_categories_slug_key UNIQUE (slug);


--
-- Name: hotmart_credentials hotmart_credentials_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_credentials
    ADD CONSTRAINT hotmart_credentials_organization_id_key UNIQUE (organization_id);


--
-- Name: hotmart_credentials hotmart_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_credentials
    ADD CONSTRAINT hotmart_credentials_pkey PRIMARY KEY (id);


--
-- Name: hotmart_orders hotmart_orders_organization_id_transaction_id_event_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_orders
    ADD CONSTRAINT hotmart_orders_organization_id_transaction_id_event_type_key UNIQUE (organization_id, transaction_id, event_type);


--
-- Name: hotmart_orders hotmart_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_orders
    ADD CONSTRAINT hotmart_orders_pkey PRIMARY KEY (id);


--
-- Name: hotmart_product_mapping hotmart_product_mapping_organization_id_hotmart_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_product_mapping
    ADD CONSTRAINT hotmart_product_mapping_organization_id_hotmart_product_id_key UNIQUE (organization_id, hotmart_product_id);


--
-- Name: hotmart_product_mapping hotmart_product_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_product_mapping
    ADD CONSTRAINT hotmart_product_mapping_pkey PRIMARY KEY (id);


--
-- Name: integration_settings integration_settings_organization_id_integration_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_organization_id_integration_type_key UNIQUE (organization_id, integration_type);


--
-- Name: integration_settings integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_queue lead_queue_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_lead_id_key UNIQUE (lead_id);


--
-- Name: lead_queue lead_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_pkey PRIMARY KEY (id);


--
-- Name: lead_semantic_memory lead_semantic_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_semantic_memory
    ADD CONSTRAINT lead_semantic_memory_pkey PRIMARY KEY (id);


--
-- Name: lead_stage_history lead_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_stage_history
    ADD CONSTRAINT lead_stage_history_pkey PRIMARY KEY (id);


--
-- Name: lead_tag_assignments lead_tag_assignments_lead_tag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_lead_tag_unique UNIQUE (lead_id, tag_id);


--
-- Name: lead_tag_assignments lead_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_pkey PRIMARY KEY (lead_id, tag_id);


--
-- Name: lead_tags lead_tags_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: lead_tags lead_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_pkey PRIMARY KEY (id);


--
-- Name: lead_transfer_history lead_transfer_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: mass_email_campaigns mass_email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_campaigns
    ADD CONSTRAINT mass_email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: mass_email_recipients mass_email_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_recipients
    ADD CONSTRAINT mass_email_recipients_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_user_id_notification_type_reference_id_re_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_user_id_notification_type_reference_id_re_key UNIQUE (user_id, notification_type, reference_id, reference_date);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: objections objections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objections
    ADD CONSTRAINT objections_pkey PRIMARY KEY (id);


--
-- Name: opportunity_scan_items opportunity_scan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_scan_items
    ADD CONSTRAINT opportunity_scan_items_pkey PRIMARY KEY (id);


--
-- Name: opportunity_scan_schedules opportunity_scan_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_scan_schedules
    ADD CONSTRAINT opportunity_scan_schedules_pkey PRIMARY KEY (id);


--
-- Name: opportunity_scans opportunity_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_scans
    ADD CONSTRAINT opportunity_scans_pkey PRIMARY KEY (id);


--
-- Name: orchestration_logs orchestration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_pkey PRIMARY KEY (id);


--
-- Name: org_ai_credentials org_ai_credentials_organization_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_credentials
    ADD CONSTRAINT org_ai_credentials_organization_id_provider_key UNIQUE (organization_id, provider);


--
-- Name: org_ai_credentials org_ai_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_credentials
    ADD CONSTRAINT org_ai_credentials_pkey PRIMARY KEY (id);


--
-- Name: org_ai_routing org_ai_routing_organization_id_capability_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_routing
    ADD CONSTRAINT org_ai_routing_organization_id_capability_key UNIQUE (organization_id, capability);


--
-- Name: org_ai_routing org_ai_routing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_routing
    ADD CONSTRAINT org_ai_routing_pkey PRIMARY KEY (id);


--
-- Name: organization_orchestrator_config organization_orchestrator_config_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_orchestrator_config
    ADD CONSTRAINT organization_orchestrator_config_organization_id_key UNIQUE (organization_id);


--
-- Name: organization_orchestrator_config organization_orchestrator_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_orchestrator_config
    ADD CONSTRAINT organization_orchestrator_config_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: platform_audit_logs platform_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_logs
    ADD CONSTRAINT platform_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_email_settings platform_email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_settings
    ADD CONSTRAINT platform_email_settings_pkey PRIMARY KEY (id);


--
-- Name: platform_email_templates platform_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_templates
    ADD CONSTRAINT platform_email_templates_pkey PRIMARY KEY (id);


--
-- Name: platform_email_templates platform_email_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_templates
    ADD CONSTRAINT platform_email_templates_slug_key UNIQUE (slug);


--
-- Name: platform_plans platform_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_plans
    ADD CONSTRAINT platform_plans_pkey PRIMARY KEY (id);


--
-- Name: platform_plans platform_plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_plans
    ADD CONSTRAINT platform_plans_slug_key UNIQUE (slug);


--
-- Name: platform_release_reads platform_release_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_release_reads
    ADD CONSTRAINT platform_release_reads_pkey PRIMARY KEY (user_id, release_id);


--
-- Name: platform_releases platform_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_releases
    ADD CONSTRAINT platform_releases_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: post_sale_event_actions post_sale_event_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_pkey PRIMARY KEY (id);


--
-- Name: post_sale_event_actions post_sale_event_actions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_unique UNIQUE (organization_id, product_id, event_type);


--
-- Name: post_sale_event_logs post_sale_event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_logs
    ADD CONSTRAINT post_sale_event_logs_pkey PRIMARY KEY (id);


--
-- Name: post_sale_scheduled_runs post_sale_scheduled_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_scheduled_runs
    ADD CONSTRAINT post_sale_scheduled_runs_pkey PRIMARY KEY (id);


--
-- Name: processed_messages processed_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_messages
    ADD CONSTRAINT processed_messages_pkey PRIMARY KEY (id);


--
-- Name: product_agents product_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_agents
    ADD CONSTRAINT product_agents_pkey PRIMARY KEY (id);


--
-- Name: product_catalog_items product_catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog_items
    ADD CONSTRAINT product_catalog_items_pkey PRIMARY KEY (id);


--
-- Name: product_ctas product_ctas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ctas
    ADD CONSTRAINT product_ctas_pkey PRIMARY KEY (id);


--
-- Name: product_knowledge_sources product_knowledge_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_knowledge_sources
    ADD CONSTRAINT product_knowledge_sources_pkey PRIMARY KEY (id);


--
-- Name: product_offers product_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_offers
    ADD CONSTRAINT product_offers_pkey PRIMARY KEY (id);


--
-- Name: product_onboarding_state product_onboarding_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_onboarding_state
    ADD CONSTRAINT product_onboarding_state_pkey PRIMARY KEY (id);


--
-- Name: product_suites product_suites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_suites
    ADD CONSTRAINT product_suites_pkey PRIMARY KEY (id);


--
-- Name: product_training_videos product_training_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_training_videos
    ADD CONSTRAINT product_training_videos_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_booking_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_booking_slug_key UNIQUE (booking_slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- Name: quiz_templates quiz_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_templates
    ADD CONSTRAINT quiz_templates_pkey PRIMARY KEY (id);


--
-- Name: sales_goals sales_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_goals
    ADD CONSTRAINT sales_goals_pkey PRIMARY KEY (id);


--
-- Name: sales_leads sales_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_leads
    ADD CONSTRAINT sales_leads_pkey PRIMARY KEY (id);


--
-- Name: sales_squads sales_squads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_squads
    ADD CONSTRAINT sales_squads_pkey PRIMARY KEY (id);


--
-- Name: sankhya_mappings sankhya_mappings_organization_id_entity_type_local_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sankhya_mappings
    ADD CONSTRAINT sankhya_mappings_organization_id_entity_type_local_id_key UNIQUE (organization_id, entity_type, local_id);


--
-- Name: sankhya_mappings sankhya_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sankhya_mappings
    ADD CONSTRAINT sankhya_mappings_pkey PRIMARY KEY (id);


--
-- Name: sankhya_sync_logs sankhya_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sankhya_sync_logs
    ADD CONSTRAINT sankhya_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: scheduled_messages scheduled_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id);


--
-- Name: sector_members sector_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_pkey PRIMARY KEY (id);


--
-- Name: sector_members sector_members_sector_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_sector_id_user_id_key UNIQUE (sector_id, user_id);


--
-- Name: sector_members sector_members_sector_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_sector_user_unique UNIQUE (sector_id, user_id);


--
-- Name: sectors sectors_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sectors
    ADD CONSTRAINT sectors_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: sectors sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sectors
    ADD CONSTRAINT sectors_pkey PRIMARY KEY (id);


--
-- Name: seller_notification_settings seller_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notification_settings
    ADD CONSTRAINT seller_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: seller_notification_settings seller_notification_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notification_settings
    ADD CONSTRAINT seller_notification_settings_user_id_key UNIQUE (user_id);


--
-- Name: sent_responses sent_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sent_responses
    ADD CONSTRAINT sent_responses_pkey PRIMARY KEY (id);


--
-- Name: squad_members squad_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_pkey PRIMARY KEY (id);


--
-- Name: squad_members squad_members_squad_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_squad_id_user_id_key UNIQUE (squad_id, user_id);


--
-- Name: stage_values stage_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_values
    ADD CONSTRAINT stage_values_pkey PRIMARY KEY (id);


--
-- Name: stage_values stage_values_stage_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_values
    ADD CONSTRAINT stage_values_stage_id_key UNIQUE (stage_id);


--
-- Name: subscriptions subscriptions_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_organization_id_key UNIQUE (organization_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: suppressed_emails suppressed_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);


--
-- Name: suppressed_emails suppressed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);


--
-- Name: tag_automations tag_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_invitations team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_pkey PRIMARY KEY (id);


--
-- Name: team_invitations team_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_token_key UNIQUE (token);


--
-- Name: webchat_conversations unique_visitor_session; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT unique_visitor_session UNIQUE (widget_id, visitor_id);


--
-- Name: user_availability user_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_pkey PRIMARY KEY (id);


--
-- Name: user_availability user_availability_user_id_day_of_week_start_time_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_user_id_day_of_week_start_time_key UNIQUE (user_id, day_of_week, start_time);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_notification_settings user_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_pkey PRIMARY KEY (user_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_key UNIQUE (user_id);


--
-- Name: user_product_assignments user_product_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_assignments
    ADD CONSTRAINT user_product_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_product_assignments user_product_assignments_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_assignments
    ADD CONSTRAINT user_product_assignments_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_status user_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status
    ADD CONSTRAINT user_status_pkey PRIMARY KEY (id);


--
-- Name: user_status user_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status
    ADD CONSTRAINT user_status_user_id_key UNIQUE (user_id);


--
-- Name: webchat_agent_configs webchat_agent_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_agent_configs
    ADD CONSTRAINT webchat_agent_configs_pkey PRIMARY KEY (id);


--
-- Name: webchat_assignment_events webchat_assignment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_assignment_events
    ADD CONSTRAINT webchat_assignment_events_pkey PRIMARY KEY (id);


--
-- Name: webchat_conversations webchat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_pkey PRIMARY KEY (id);


--
-- Name: webchat_messages webchat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_pkey PRIMARY KEY (id);


--
-- Name: webchat_widgets webchat_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_widgets
    ADD CONSTRAINT webchat_widgets_pkey PRIMARY KEY (id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: webhook_sample_requests webhook_sample_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_sample_requests
    ADD CONSTRAINT webhook_sample_requests_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: billing_history_metadata_cakto_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_history_metadata_cakto_id_idx ON public.billing_history USING btree (((metadata ->> 'cakto_id'::text))) WHERE (metadata ? 'cakto_id'::text);


--
-- Name: cakto_credentials_org_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cakto_credentials_org_unique ON public.cakto_credentials USING btree (organization_id) WHERE (scope = 'organization'::text);


--
-- Name: cakto_credentials_platform_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cakto_credentials_platform_unique ON public.cakto_credentials USING btree (scope) WHERE (scope = 'platform'::text);


--
-- Name: cakto_orders_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cakto_orders_lookup_idx ON public.cakto_orders USING btree (scope, organization_id, status, paid_at DESC);


--
-- Name: cakto_orders_offer_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cakto_orders_offer_slug_idx ON public.cakto_orders USING btree (cakto_offer_slug) WHERE (cakto_offer_slug IS NOT NULL);


--
-- Name: cakto_orders_scope_org_cakto_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cakto_orders_scope_org_cakto_id_key ON public.cakto_orders USING btree (scope, organization_id, cakto_id);


--
-- Name: capture_funnels_org_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX capture_funnels_org_slug_idx ON public.capture_funnels USING btree (organization_id, slug);


--
-- Name: capture_funnels_organization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_funnels_organization_idx ON public.capture_funnels USING btree (organization_id);


--
-- Name: capture_funnels_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_funnels_product_idx ON public.capture_funnels USING btree (product_id);


--
-- Name: capture_funnels_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_funnels_status_idx ON public.capture_funnels USING btree (status);


--
-- Name: catalog_sync_logs_org_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_sync_logs_org_product_idx ON public.catalog_sync_logs USING btree (organization_id, product_id, started_at DESC);


--
-- Name: conv_locks_locked_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conv_locks_locked_until_idx ON public.conversation_processing_locks USING btree (locked_until);


--
-- Name: funnel_analytics_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funnel_analytics_channel_idx ON public.funnel_analytics USING btree (channel);


--
-- Name: funnel_analytics_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funnel_analytics_date_idx ON public.funnel_analytics USING btree (date);


--
-- Name: funnel_analytics_funnel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funnel_analytics_funnel_idx ON public.funnel_analytics USING btree (funnel_id);


--
-- Name: idx_admin_agent_messages_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_agent_messages_org_created ON public.admin_agent_messages USING btree (organization_id, created_at DESC);


--
-- Name: idx_admin_agent_messages_org_type_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_agent_messages_org_type_ref ON public.admin_agent_messages USING btree (organization_id, message_type, reference_id, created_at DESC);


--
-- Name: idx_admin_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: idx_admin_notifications_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notifications_org ON public.admin_notifications USING btree (organization_id);


--
-- Name: idx_agent_action_logs_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_logs_agent ON public.agent_action_logs USING btree (agent_id);


--
-- Name: idx_agent_action_logs_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_logs_conversation ON public.agent_action_logs USING btree (conversation_id);


--
-- Name: idx_agent_action_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_logs_created ON public.agent_action_logs USING btree (created_at DESC);


--
-- Name: idx_agent_action_logs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_logs_lead ON public.agent_action_logs USING btree (lead_id);


--
-- Name: idx_agent_activation_logs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_activation_logs_org_created ON public.agent_activation_logs USING btree (organization_id, created_at DESC);


--
-- Name: idx_agent_activation_logs_to_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_activation_logs_to_agent_created ON public.agent_activation_logs USING btree (to_agent_id, created_at DESC);


--
-- Name: idx_agent_handoff_history_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_handoff_history_conv ON public.agent_handoff_history USING btree (conversation_id, created_at DESC);


--
-- Name: idx_agent_handoff_history_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_handoff_history_lead ON public.agent_handoff_history USING btree (lead_id, created_at DESC);


--
-- Name: idx_agent_handoff_history_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_handoff_history_org ON public.agent_handoff_history USING btree (organization_id, created_at DESC);


--
-- Name: idx_agent_routing_rules_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_routing_rules_org ON public.agent_routing_rules USING btree (organization_id, is_active, priority);


--
-- Name: idx_agent_specialists_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_specialists_agent ON public.agent_specialists USING btree (agent_id);


--
-- Name: idx_agent_specialists_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_specialists_org ON public.agent_specialists USING btree (organization_id);


--
-- Name: idx_agent_specialists_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_specialists_role ON public.agent_specialists USING btree (role);


--
-- Name: idx_agent_tool_exec_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tool_exec_conv ON public.agent_tool_executions USING btree (conversation_id, created_at DESC);


--
-- Name: idx_agent_tool_exec_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tool_exec_lead ON public.agent_tool_executions USING btree (lead_id, created_at DESC);


--
-- Name: idx_agent_tool_exec_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tool_exec_org ON public.agent_tool_executions USING btree (organization_id, created_at DESC);


--
-- Name: idx_agent_tool_exec_tool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tool_exec_tool ON public.agent_tool_executions USING btree (tool_name, created_at DESC);


--
-- Name: idx_ai_experiments_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_experiments_agent ON public.ai_prompt_experiments USING btree (agent_id);


--
-- Name: idx_ai_experiments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_experiments_org ON public.ai_prompt_experiments USING btree (organization_id, status);


--
-- Name: idx_ai_knowledge_base_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_knowledge_base_category ON public.ai_knowledge_base USING btree (category);


--
-- Name: idx_ai_knowledge_base_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_knowledge_base_product ON public.ai_knowledge_base USING btree (product_id);


--
-- Name: idx_ai_outreach_queue_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_outreach_queue_followup ON public.ai_outreach_queue USING btree (next_followup_at) WHERE ((status = 'sent'::text) AND (followup_enabled = true));


--
-- Name: idx_ai_outreach_queue_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_outreach_queue_lead ON public.ai_outreach_queue USING btree (lead_id);


--
-- Name: idx_ai_outreach_queue_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_outreach_queue_org ON public.ai_outreach_queue USING btree (organization_id);


--
-- Name: idx_ai_outreach_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_outreach_queue_status ON public.ai_outreach_queue USING btree (status);


--
-- Name: idx_ai_quality_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_quality_agent ON public.ai_quality_evaluations USING btree (agent_id, created_at DESC);


--
-- Name: idx_ai_quality_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_quality_conv ON public.ai_quality_evaluations USING btree (conversation_id);


--
-- Name: idx_ai_quality_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_quality_org_created ON public.ai_quality_evaluations USING btree (organization_id, created_at DESC);


--
-- Name: idx_ai_response_feedback_applied; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_response_feedback_applied ON public.ai_response_feedback USING btree (applied_to_training);


--
-- Name: idx_ai_response_feedback_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_response_feedback_conversation ON public.ai_response_feedback USING btree (conversation_id);


--
-- Name: idx_ai_response_feedback_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_response_feedback_org ON public.ai_response_feedback USING btree (organization_id);


--
-- Name: idx_ai_router_failures_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_router_failures_org_created ON public.ai_router_failures USING btree (organization_id, created_at DESC);


--
-- Name: idx_ai_variants_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_variants_exp ON public.ai_prompt_variants USING btree (experiment_id);


--
-- Name: idx_availability_overrides_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_overrides_user_date ON public.availability_overrides USING btree (user_id, date);


--
-- Name: idx_bl_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_booking ON public.booking_logs USING btree (booking_id);


--
-- Name: idx_bl_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_created ON public.booking_logs USING btree (created_at DESC);


--
-- Name: idx_bl_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_org ON public.booking_logs USING btree (organization_id);


--
-- Name: idx_bns_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bns_event ON public.booking_notification_settings USING btree (event_type_id);


--
-- Name: idx_bns_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bns_org ON public.booking_notification_settings USING btree (organization_id);


--
-- Name: idx_booking_event_types_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_event_types_org ON public.booking_event_types USING btree (organization_id);


--
-- Name: idx_booking_event_types_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_event_types_slug ON public.booking_event_types USING btree (slug);


--
-- Name: idx_booking_event_types_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_event_types_user ON public.booking_event_types USING btree (user_id);


--
-- Name: idx_booking_requests_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_event_type ON public.booking_requests USING btree (event_type_id);


--
-- Name: idx_booking_requests_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_host ON public.booking_requests USING btree (host_user_id);


--
-- Name: idx_booking_requests_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_org ON public.booking_requests USING btree (organization_id);


--
-- Name: idx_booking_requests_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_phone ON public.booking_requests USING btree (guest_phone);


--
-- Name: idx_booking_requests_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_start_time ON public.booking_requests USING btree (start_time);


--
-- Name: idx_booking_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_status ON public.booking_requests USING btree (status);


--
-- Name: idx_booking_requests_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_token ON public.booking_requests USING btree (confirmation_token);


--
-- Name: idx_br_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_br_event ON public.booking_reminders USING btree (event_type_id);


--
-- Name: idx_br_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_br_org ON public.booking_reminders USING btree (organization_id);


--
-- Name: idx_bsh_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsh_booking ON public.booking_status_history USING btree (booking_id);


--
-- Name: idx_bsh_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsh_org ON public.booking_status_history USING btree (organization_id);


--
-- Name: idx_bsj_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsj_booking ON public.booking_scheduled_jobs USING btree (booking_id);


--
-- Name: idx_bsj_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsj_due ON public.booking_scheduled_jobs USING btree (status, scheduled_for) WHERE (status = 'pending'::text);


--
-- Name: idx_bsj_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsj_org ON public.booking_scheduled_jobs USING btree (organization_id);


--
-- Name: idx_business_holidays_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_holidays_org_date ON public.business_holidays USING btree (organization_id, date);


--
-- Name: idx_cadence_api_keys_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_api_keys_hash ON public.cadence_api_keys USING btree (key_hash);


--
-- Name: idx_cadence_api_keys_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_api_keys_org ON public.cadence_api_keys USING btree (organization_id);


--
-- Name: idx_cadence_enrollments_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_enrollments_lead ON public.cadence_enrollments USING btree (lead_id);


--
-- Name: idx_cadence_enrollments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_enrollments_org ON public.cadence_enrollments USING btree (organization_id, status);


--
-- Name: idx_cadence_enrollments_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cadence_enrollments_unique_active ON public.cadence_enrollments USING btree (cadence_id, lead_id) WHERE (status = 'active'::text);


--
-- Name: idx_cadence_step_runs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_step_runs_due ON public.cadence_step_runs USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_cadence_step_runs_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_step_runs_enrollment ON public.cadence_step_runs USING btree (enrollment_id);


--
-- Name: idx_cadence_steps_cadence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_steps_cadence ON public.cadence_steps USING btree (cadence_id, order_index);


--
-- Name: idx_cadences_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadences_org_status ON public.cadences USING btree (organization_id, status);


--
-- Name: idx_cakto_orders_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cakto_orders_assigned_to ON public.cakto_orders USING btree (assigned_to);


--
-- Name: idx_cakto_orders_items; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cakto_orders_items ON public.cakto_orders USING gin (items);


--
-- Name: idx_cakto_orders_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cakto_orders_offer ON public.cakto_orders USING btree (offer_id);


--
-- Name: idx_cakto_orders_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cakto_orders_product ON public.cakto_orders USING btree (product_id);


--
-- Name: idx_cakto_orders_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cakto_orders_provider ON public.cakto_orders USING btree (organization_id, provider, paid_at DESC);


--
-- Name: idx_calendar_events_google_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_google_event_id ON public.calendar_events USING btree (google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_calendar_events_google_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_google_id ON public.calendar_events USING btree (google_event_id);


--
-- Name: idx_calendar_events_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_lead_id ON public.calendar_events USING btree (lead_id);


--
-- Name: idx_calendar_events_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_org_id ON public.calendar_events USING btree (organization_id);


--
-- Name: idx_calendar_events_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_start_time ON public.calendar_events USING btree (start_time);


--
-- Name: idx_calendar_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_user_id ON public.calendar_events USING btree (user_id);


--
-- Name: idx_campaign_contexts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contexts_org ON public.campaign_contexts USING btree (organization_id);


--
-- Name: idx_campaign_targets_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_targets_campaign ON public.campaign_targets USING btree (campaign_id, status);


--
-- Name: idx_campaign_targets_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_targets_conversation ON public.campaign_targets USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_campaign_targets_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_targets_dispatch ON public.campaign_targets USING btree (status, scheduled_for) WHERE (status = 'queued'::text);


--
-- Name: idx_campaign_targets_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_targets_lead ON public.campaign_targets USING btree (lead_id);


--
-- Name: idx_campaigns_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_agent ON public.campaigns USING btree (agent_id);


--
-- Name: idx_campaigns_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_status ON public.campaigns USING btree (organization_id, status);


--
-- Name: idx_capture_funnels_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capture_funnels_channel ON public.capture_funnels USING btree (organization_id, channel_type);


--
-- Name: idx_chat_flows_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_flows_org_active ON public.chat_flows USING btree (organization_id, is_active);


--
-- Name: idx_chat_flows_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_flows_product ON public.chat_flows USING btree (product_id);


--
-- Name: idx_conversation_notes_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_notes_conv ON public.conversation_notes USING btree (conversation_id);


--
-- Name: idx_conversation_transfers_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_transfers_conv ON public.conversation_transfers USING btree (conversation_id);


--
-- Name: idx_email_send_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);


--
-- Name: idx_email_send_log_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_message ON public.email_send_log USING btree (message_id);


--
-- Name: idx_email_send_log_message_sent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);


--
-- Name: idx_email_send_log_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);


--
-- Name: idx_evolution_instances_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evolution_instances_instance_id ON public.evolution_instances USING btree (instance_id);


--
-- Name: idx_evolution_instances_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_evolution_instances_one_default ON public.evolution_instances USING btree (organization_id) WHERE (is_default = true);


--
-- Name: idx_evolution_instances_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evolution_instances_org ON public.evolution_instances USING btree (organization_id);


--
-- Name: idx_fb_integrations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_integrations_org ON public.facebook_lead_integrations USING btree (organization_id);


--
-- Name: idx_fb_integrations_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_integrations_page ON public.facebook_lead_integrations USING btree (page_id);


--
-- Name: idx_fb_integrations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_integrations_product ON public.facebook_lead_integrations USING btree (product_id);


--
-- Name: idx_fb_logs_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_logs_integration ON public.facebook_lead_logs USING btree (integration_id);


--
-- Name: idx_fb_logs_leadgen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_logs_leadgen ON public.facebook_lead_logs USING btree (leadgen_id);


--
-- Name: idx_fb_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_logs_status ON public.facebook_lead_logs USING btree (status);


--
-- Name: idx_form_blocks_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_blocks_form ON public.form_blocks USING btree (form_id);


--
-- Name: idx_form_blocks_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_blocks_order ON public.form_blocks USING btree (form_id, order_index);


--
-- Name: idx_form_submissions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_created ON public.form_submissions USING btree (created_at DESC);


--
-- Name: idx_form_submissions_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_form ON public.form_submissions USING btree (form_id);


--
-- Name: idx_form_submissions_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_lead ON public.form_submissions USING btree (lead_id);


--
-- Name: idx_form_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_status ON public.form_submissions USING btree (status);


--
-- Name: idx_form_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_templates_category ON public.form_templates USING btree (category);


--
-- Name: idx_form_templates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_templates_org ON public.form_templates USING btree (organization_id);


--
-- Name: idx_forms_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_organization ON public.forms USING btree (organization_id);


--
-- Name: idx_forms_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_product ON public.forms USING btree (product_id);


--
-- Name: idx_forms_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_slug ON public.forms USING btree (slug);


--
-- Name: idx_forms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_status ON public.forms USING btree (status);


--
-- Name: idx_funnel_webhook_logs_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funnel_webhook_logs_block ON public.funnel_webhook_logs USING btree (funnel_id, block_id, created_at DESC);


--
-- Name: idx_funnel_webhook_logs_funnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funnel_webhook_logs_funnel ON public.funnel_webhook_logs USING btree (funnel_id, created_at DESC);


--
-- Name: idx_funnel_webhook_logs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funnel_webhook_logs_org ON public.funnel_webhook_logs USING btree (organization_id, created_at DESC);


--
-- Name: idx_help_articles_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_category ON public.help_articles USING btree (category_id) WHERE (is_published = true);


--
-- Name: idx_help_articles_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_published ON public.help_articles USING btree (is_published, published_at DESC);


--
-- Name: idx_help_articles_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_tags ON public.help_articles USING gin (tags);


--
-- Name: idx_hotmart_orders_buyer_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotmart_orders_buyer_email ON public.hotmart_orders USING btree (organization_id, buyer_email);


--
-- Name: idx_hotmart_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotmart_orders_created ON public.hotmart_orders USING btree (created_at_hotmart DESC);


--
-- Name: idx_hotmart_orders_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotmart_orders_org ON public.hotmart_orders USING btree (organization_id);


--
-- Name: idx_hotmart_orders_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotmart_orders_product ON public.hotmart_orders USING btree (product_id);


--
-- Name: idx_hotmart_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotmart_orders_status ON public.hotmart_orders USING btree (organization_id, status);


--
-- Name: idx_lead_notes_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_notes_author_id ON public.lead_notes USING btree (author_id);


--
-- Name: idx_lead_notes_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes USING btree (lead_id);


--
-- Name: idx_lead_semantic_memory_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_semantic_memory_created ON public.lead_semantic_memory USING btree (created_at DESC);


--
-- Name: idx_lead_semantic_memory_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_semantic_memory_embedding ON public.lead_semantic_memory USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_lead_semantic_memory_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_semantic_memory_lead ON public.lead_semantic_memory USING btree (lead_id);


--
-- Name: idx_lead_semantic_memory_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_semantic_memory_org ON public.lead_semantic_memory USING btree (organization_id);


--
-- Name: idx_lead_tag_assignments_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_tag_assignments_lead ON public.lead_tag_assignments USING btree (lead_id);


--
-- Name: idx_lead_tag_assignments_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_tag_assignments_tag ON public.lead_tag_assignments USING btree (tag_id);


--
-- Name: idx_lead_tags_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_tags_org ON public.lead_tags USING btree (organization_id);


--
-- Name: idx_lead_transfer_history_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_transfer_history_lead_id ON public.lead_transfer_history USING btree (lead_id);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to);


--
-- Name: idx_leads_closer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_closer_id ON public.leads USING btree (closer_id);


--
-- Name: idx_leads_lead_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_lead_origin ON public.leads USING btree (lead_origin);


--
-- Name: idx_leads_product_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_product_stage ON public.leads USING btree (product_id, current_stage_id);


--
-- Name: idx_leads_sdr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_sdr_id ON public.leads USING btree (sdr_id);


--
-- Name: idx_leads_sector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_sector ON public.leads USING btree (sector_id);


--
-- Name: idx_leads_squad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_squad_id ON public.leads USING btree (squad_id);


--
-- Name: idx_leads_stage_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_stage_value ON public.leads USING btree (current_stage_id, deal_value);


--
-- Name: idx_leads_utm_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_utm_source ON public.leads USING btree (utm_source);


--
-- Name: idx_message_reactions_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_conversation ON public.message_reactions USING btree (conversation_id);


--
-- Name: idx_message_reactions_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);


--
-- Name: idx_message_reactions_unique_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_message_reactions_unique_agent ON public.message_reactions USING btree (message_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_message_reactions_unique_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_message_reactions_unique_visitor ON public.message_reactions USING btree (message_id, visitor_id) WHERE (visitor_id IS NOT NULL);


--
-- Name: idx_notification_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_date ON public.notification_logs USING btree (reference_date);


--
-- Name: idx_notification_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_type ON public.notification_logs USING btree (notification_type);


--
-- Name: idx_notification_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_user ON public.notification_logs USING btree (user_id);


--
-- Name: idx_notifications_admin_notification_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_admin_notification_id ON public.notifications USING btree (admin_notification_id);


--
-- Name: idx_opportunity_scan_items_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_scan_items_classification ON public.opportunity_scan_items USING btree (scan_id, classification);


--
-- Name: idx_opportunity_scan_items_scan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_scan_items_scan ON public.opportunity_scan_items USING btree (scan_id);


--
-- Name: idx_opportunity_scan_schedules_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_scan_schedules_org ON public.opportunity_scan_schedules USING btree (organization_id, is_active);


--
-- Name: idx_opportunity_scans_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_scans_org ON public.opportunity_scans USING btree (organization_id, created_at DESC);


--
-- Name: idx_orchestration_logs_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchestration_logs_conversation ON public.orchestration_logs USING btree (conversation_id, created_at DESC);


--
-- Name: idx_orchestration_logs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchestration_logs_org_created ON public.orchestration_logs USING btree (organization_id, created_at DESC);


--
-- Name: idx_payment_links_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_conv ON public.payment_links USING btree (conversation_id);


--
-- Name: idx_payment_links_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_lead ON public.payment_links USING btree (lead_id);


--
-- Name: idx_payment_links_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_org ON public.payment_links USING btree (organization_id, created_at DESC);


--
-- Name: idx_platform_plans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_plans_active ON public.platform_plans USING btree (is_active, display_order);


--
-- Name: idx_platform_release_reads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_release_reads_user ON public.platform_release_reads USING btree (user_id);


--
-- Name: idx_platform_releases_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_releases_published ON public.platform_releases USING btree (is_published, published_at DESC);


--
-- Name: idx_post_sale_actions_org_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_actions_org_event ON public.post_sale_event_actions USING btree (organization_id, event_type) WHERE (is_active = true);


--
-- Name: idx_post_sale_actions_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_actions_product ON public.post_sale_event_actions USING btree (product_id, event_type) WHERE (is_active = true);


--
-- Name: idx_post_sale_logs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_logs_lead ON public.post_sale_event_logs USING btree (lead_id, created_at DESC);


--
-- Name: idx_post_sale_logs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_logs_org_created ON public.post_sale_event_logs USING btree (organization_id, created_at DESC);


--
-- Name: idx_post_sale_scenarios_org_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_scenarios_org_event ON public.agent_post_sale_scenarios USING btree (organization_id, trigger_event, is_active, priority DESC);


--
-- Name: idx_post_sale_scheduled_runs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_scheduled_runs_due ON public.post_sale_scheduled_runs USING btree (run_at) WHERE (status = 'pending'::text);


--
-- Name: idx_post_sale_scheduled_runs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_sale_scheduled_runs_lead ON public.post_sale_scheduled_runs USING btree (lead_id, event_type);


--
-- Name: idx_product_agents_activation_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_activation_priority ON public.product_agents USING btree (product_id, is_active, activation_priority DESC);


--
-- Name: idx_product_agents_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_active ON public.product_agents USING btree (is_active);


--
-- Name: idx_product_agents_evolution_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_evolution_instance ON public.product_agents USING btree (evolution_instance_id);


--
-- Name: idx_product_agents_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_org ON public.product_agents USING btree (organization_id);


--
-- Name: idx_product_agents_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_product ON public.product_agents USING btree (product_id);


--
-- Name: idx_product_agents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_agents_type ON public.product_agents USING btree (agent_type);


--
-- Name: idx_product_ctas_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_ctas_organization_id ON public.product_ctas USING btree (organization_id);


--
-- Name: idx_product_ctas_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_ctas_product_id ON public.product_ctas USING btree (product_id);


--
-- Name: idx_product_offers_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_offers_org ON public.product_offers USING btree (organization_id);


--
-- Name: idx_product_offers_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_offers_product ON public.product_offers USING btree (product_id);


--
-- Name: idx_product_suites_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_suites_org ON public.product_suites USING btree (organization_id);


--
-- Name: idx_product_training_videos_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_training_videos_org ON public.product_training_videos USING btree (organization_id);


--
-- Name: idx_product_training_videos_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_training_videos_product ON public.product_training_videos USING btree (product_id);


--
-- Name: idx_products_suite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_suite ON public.products USING btree (suite_id);


--
-- Name: idx_quick_replies_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_replies_category ON public.quick_replies USING btree (category);


--
-- Name: idx_quick_replies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_replies_org ON public.quick_replies USING btree (organization_id);


--
-- Name: idx_quiz_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_templates_category ON public.quiz_templates USING btree (category);


--
-- Name: idx_quiz_templates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_templates_org ON public.quiz_templates USING btree (organization_id);


--
-- Name: idx_quiz_templates_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_templates_public ON public.quiz_templates USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_recovery_dispatches_lead_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recovery_dispatches_lead_event ON public.cakto_recovery_dispatches USING btree (lead_id, cakto_event, created_at DESC);


--
-- Name: idx_recovery_dispatches_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recovery_dispatches_order ON public.cakto_recovery_dispatches USING btree (cakto_order_id);


--
-- Name: idx_recovery_dispatches_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recovery_dispatches_org_created ON public.cakto_recovery_dispatches USING btree (organization_id, created_at DESC);


--
-- Name: idx_sankhya_mappings_local_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sankhya_mappings_local_id ON public.sankhya_mappings USING btree (local_id);


--
-- Name: idx_sankhya_mappings_org_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sankhya_mappings_org_entity ON public.sankhya_mappings USING btree (organization_id, entity_type);


--
-- Name: idx_sankhya_sync_logs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sankhya_sync_logs_org ON public.sankhya_sync_logs USING btree (organization_id, started_at DESC);


--
-- Name: idx_sector_members_sector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sector_members_sector ON public.sector_members USING btree (sector_id);


--
-- Name: idx_sector_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sector_members_user ON public.sector_members USING btree (user_id);


--
-- Name: idx_sectors_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sectors_active ON public.sectors USING btree (organization_id, is_active);


--
-- Name: idx_sectors_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sectors_org ON public.sectors USING btree (organization_id);


--
-- Name: idx_sns_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sns_org ON public.seller_notification_settings USING btree (organization_id);


--
-- Name: idx_support_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id, created_at);


--
-- Name: idx_support_tickets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_org ON public.support_tickets USING btree (organization_id);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_support_tickets_unread_sa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_unread_sa ON public.support_tickets USING btree (unread_for_super_admin) WHERE (unread_for_super_admin = true);


--
-- Name: idx_suppressed_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);


--
-- Name: idx_tag_automations_org_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_automations_org_event ON public.tag_automations USING btree (organization_id, event_type) WHERE (is_active = true);


--
-- Name: idx_team_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_invitations_email ON public.team_invitations USING btree (email);


--
-- Name: idx_team_invitations_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_invitations_organization ON public.team_invitations USING btree (organization_id);


--
-- Name: idx_team_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_invitations_token ON public.team_invitations USING btree (token);


--
-- Name: idx_training_materials_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_materials_agent ON public.agent_training_materials USING btree (agent_id);


--
-- Name: idx_training_materials_agent_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_materials_agent_active ON public.agent_training_materials USING btree (agent_id, is_active) WHERE (is_active = true);


--
-- Name: idx_training_materials_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_materials_product ON public.agent_training_materials USING btree (product_id);


--
-- Name: idx_training_materials_product_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_materials_product_active ON public.agent_training_materials USING btree (product_id, is_active) WHERE (is_active = true);


--
-- Name: idx_unsubscribe_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);


--
-- Name: idx_user_availability_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_availability_user ON public.user_availability USING btree (user_id);


--
-- Name: idx_webchat_agent_configs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_agent_configs_org ON public.webchat_agent_configs USING btree (organization_id);


--
-- Name: idx_webchat_agent_configs_widget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_agent_configs_widget ON public.webchat_agent_configs USING btree (widget_id);


--
-- Name: idx_webchat_conv_needs_human; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_needs_human ON public.webchat_conversations USING btree (organization_id, needs_human) WHERE (needs_human = true);


--
-- Name: idx_webchat_conv_org_lastmsg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_org_lastmsg ON public.webchat_conversations USING btree (organization_id, last_message_at DESC NULLS LAST);


--
-- Name: idx_webchat_conv_org_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_org_lead ON public.webchat_conversations USING btree (organization_id, lead_id);


--
-- Name: idx_webchat_conv_org_status_lastmsg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_org_status_lastmsg ON public.webchat_conversations USING btree (organization_id, status, last_message_at DESC NULLS LAST);


--
-- Name: idx_webchat_conversations_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_agent ON public.webchat_conversations USING btree (current_agent_id);


--
-- Name: idx_webchat_conversations_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_assigned ON public.webchat_conversations USING btree (assigned_user_id);


--
-- Name: idx_webchat_conversations_bot_lock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_bot_lock ON public.webchat_conversations USING btree (id) WHERE (bot_locked_until IS NOT NULL);


--
-- Name: idx_webchat_conversations_evolution_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_evolution_instance ON public.webchat_conversations USING btree (evolution_instance_id);


--
-- Name: idx_webchat_conversations_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_flow ON public.webchat_conversations USING btree (current_flow_id) WHERE (current_flow_id IS NOT NULL);


--
-- Name: idx_webchat_conversations_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_lead ON public.webchat_conversations USING btree (lead_id);


--
-- Name: idx_webchat_conversations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_org ON public.webchat_conversations USING btree (organization_id);


--
-- Name: idx_webchat_conversations_phone_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_phone_norm ON public.webchat_conversations USING btree (organization_id, channel, visitor_phone_normalized) WHERE ((visitor_phone_normalized IS NOT NULL) AND (visitor_phone_normalized <> ''::text));


--
-- Name: idx_webchat_conversations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_product ON public.webchat_conversations USING btree (product_id);


--
-- Name: idx_webchat_conversations_sector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_sector ON public.webchat_conversations USING btree (sector_id);


--
-- Name: idx_webchat_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_status ON public.webchat_conversations USING btree (status);


--
-- Name: idx_webchat_conversations_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_visitor ON public.webchat_conversations USING btree (visitor_id);


--
-- Name: idx_webchat_conversations_widget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_widget ON public.webchat_conversations USING btree (widget_id);


--
-- Name: idx_webchat_messages_conv_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_messages_conv_created_desc ON public.webchat_messages USING btree (conversation_id, created_at DESC) WHERE (COALESCE(is_deleted, false) = false);


--
-- Name: idx_webchat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_messages_conversation ON public.webchat_messages USING btree (conversation_id);


--
-- Name: idx_webchat_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_messages_created ON public.webchat_messages USING btree (created_at);


--
-- Name: idx_webchat_widgets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_widgets_org ON public.webchat_widgets USING btree (organization_id);


--
-- Name: idx_webchat_widgets_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_widgets_product_id ON public.webchat_widgets USING btree (product_id);


--
-- Name: idx_webhook_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_created ON public.webhook_logs USING btree (created_at DESC);


--
-- Name: idx_webhook_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_status ON public.webhook_logs USING btree (status);


--
-- Name: idx_webhook_logs_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_webhook ON public.webhook_logs USING btree (webhook_id);


--
-- Name: idx_webhook_samples_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_samples_webhook ON public.webhook_sample_requests USING btree (webhook_id);


--
-- Name: idx_webhooks_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_org ON public.webhooks USING btree (organization_id);


--
-- Name: idx_webhooks_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_webhooks_org_slug ON public.webhooks USING btree (organization_id, slug);


--
-- Name: leads_org_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_org_phone_unique ON public.leads USING btree (organization_id, phone_normalized) WHERE ((phone_normalized IS NOT NULL) AND (phone_normalized <> ''::text));


--
-- Name: platform_plans_cakto_offer_slug_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_plans_cakto_offer_slug_uniq ON public.platform_plans USING btree (cakto_offer_slug) WHERE (cakto_offer_slug IS NOT NULL);


--
-- Name: processed_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processed_messages_created_at_idx ON public.processed_messages USING btree (created_at);


--
-- Name: processed_messages_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX processed_messages_uniq ON public.processed_messages USING btree (instance_id, message_id);


--
-- Name: product_catalog_items_attributes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_attributes_idx ON public.product_catalog_items USING gin (attributes);


--
-- Name: product_catalog_items_description_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_description_trgm_idx ON public.product_catalog_items USING gin (description public.gin_trgm_ops);


--
-- Name: product_catalog_items_org_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_catalog_items_org_external_unique ON public.product_catalog_items USING btree (organization_id, COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid), external_id) WHERE (external_id IS NOT NULL);


--
-- Name: product_catalog_items_org_product_active_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_org_product_active_price_idx ON public.product_catalog_items USING btree (organization_id, product_id, is_active, price);


--
-- Name: product_catalog_items_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_search_idx ON public.product_catalog_items USING gin (search_vector);


--
-- Name: product_catalog_items_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_tags_idx ON public.product_catalog_items USING gin (tags);


--
-- Name: product_catalog_items_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_catalog_items_title_trgm_idx ON public.product_catalog_items USING gin (title public.gin_trgm_ops);


--
-- Name: sectors_one_default_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sectors_one_default_per_org ON public.sectors USING btree (organization_id) WHERE (is_default = true);


--
-- Name: sent_responses_conv_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sent_responses_conv_created_idx ON public.sent_responses USING btree (conversation_id, created_at DESC);


--
-- Name: sent_responses_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sent_responses_created_at_idx ON public.sent_responses USING btree (created_at);


--
-- Name: uq_outreach_active_per_lead_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outreach_active_per_lead_agent ON public.ai_outreach_queue USING btree (lead_id, agent_id) WHERE ((status = ANY (ARRAY['pending'::text, 'sent'::text])) AND (followup_enabled = true) AND (agent_id IS NOT NULL));


--
-- Name: uq_product_offers_cakto_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_offers_cakto_per_org ON public.product_offers USING btree (organization_id, cakto_product_id) WHERE (cakto_product_id IS NOT NULL);


--
-- Name: webchat_conv_open_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webchat_conv_open_phone_unique ON public.webchat_conversations USING btree (organization_id, channel, visitor_phone_normalized) WHERE ((status <> 'closed'::public.webchat_conversation_status) AND (visitor_phone_normalized IS NOT NULL) AND (visitor_phone_normalized <> ''::text));


--
-- Name: webchat_messages_inbound_evolution_msg_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webchat_messages_inbound_evolution_msg_uniq ON public.webchat_messages USING btree (conversation_id, ((metadata ->> 'evolution_message_id'::text))) WHERE ((direction = 'inbound'::text) AND ((metadata ->> 'evolution_message_id'::text) IS NOT NULL));


--
-- Name: webchat_widgets_product_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webchat_widgets_product_unique ON public.webchat_widgets USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: agent_routing_rules agent_routing_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agent_routing_rules_updated_at BEFORE UPDATE ON public.agent_routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_specialists agent_specialists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agent_specialists_updated_at BEFORE UPDATE ON public.agent_specialists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_prompt_experiments ai_experiments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_experiments_updated_at BEFORE UPDATE ON public.ai_prompt_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_prompt_variants ai_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_variants_updated_at BEFORE UPDATE ON public.ai_prompt_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cakto_credentials cakto_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cakto_credentials_updated_at BEFORE UPDATE ON public.cakto_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cakto_orders cakto_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cakto_orders_updated_at BEFORE UPDATE ON public.cakto_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cakto_recovery_config cakto_recovery_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cakto_recovery_config_updated_at BEFORE UPDATE ON public.cakto_recovery_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads leads_assignee_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_assignee_change AFTER UPDATE OF assigned_to ON public.leads FOR EACH ROW EXECUTE FUNCTION public.sync_active_leads_count();


--
-- Name: leads leads_assignee_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_assignee_insert AFTER INSERT ON public.leads FOR EACH ROW WHEN ((new.assigned_to IS NOT NULL)) EXECUTE FUNCTION public.sync_active_leads_count();


--
-- Name: payment_links payment_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_catalog_items product_catalog_items_search_vector_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_catalog_items_search_vector_trigger BEFORE INSERT OR UPDATE ON public.product_catalog_items FOR EACH ROW EXECUTE FUNCTION public.update_catalog_search_vector();


--
-- Name: opportunity_scan_schedules set_updated_at_opportunity_scan_schedules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_opportunity_scan_schedules BEFORE UPDATE ON public.opportunity_scan_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_notification_settings trg_bns_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bns_updated BEFORE UPDATE ON public.booking_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_requests trg_booking_status_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_booking_status_history AFTER INSERT OR UPDATE OF status ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION public.booking_log_status_change();


--
-- Name: booking_requests trg_br_req_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_br_req_updated BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_reminders trg_br_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_br_updated BEFORE UPDATE ON public.booking_reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_scheduled_jobs trg_bsj_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bsj_updated BEFORE UPDATE ON public.booking_scheduled_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cadence_enrollments trg_cadence_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cadence_enrollments_updated_at BEFORE UPDATE ON public.cadence_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cadence_step_runs trg_cadence_step_runs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cadence_step_runs_updated_at BEFORE UPDATE ON public.cadence_step_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cadence_steps trg_cadence_steps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cadence_steps_updated_at BEFORE UPDATE ON public.cadence_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cadences trg_cadences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cadences_updated_at BEFORE UPDATE ON public.cadences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campaign_contexts trg_campaign_contexts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaign_contexts_updated_at BEFORE UPDATE ON public.campaign_contexts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campaigns trg_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webchat_conversations trg_enforce_single_attendant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_single_attendant BEFORE UPDATE OF assigned_user_id, current_agent_id ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_single_attendant();


--
-- Name: profiles trg_ensure_first_user_is_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_first_user_is_admin AFTER INSERT OR UPDATE OF organization_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.ensure_first_user_is_admin();


--
-- Name: organizations trg_ensure_org_owner_is_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_org_owner_is_admin AFTER INSERT OR UPDATE OF owner_id ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.ensure_org_owner_is_admin();


--
-- Name: webchat_conversations trg_fill_default_sector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_default_sector BEFORE INSERT ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION public.fill_default_sector();


--
-- Name: hotmart_credentials trg_hotmart_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hotmart_credentials_updated_at BEFORE UPDATE ON public.hotmart_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hotmart_orders trg_hotmart_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hotmart_orders_updated_at BEFORE UPDATE ON public.hotmart_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hotmart_product_mapping trg_hotmart_product_mapping_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hotmart_product_mapping_updated_at BEFORE UPDATE ON public.hotmart_product_mapping FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_post_sale_scenarios trg_post_sale_scenarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_sale_scenarios_updated_at BEFORE UPDATE ON public.agent_post_sale_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_settings trg_prevent_super_admin_lock_reset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_super_admin_lock_reset BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_lock_reset();


--
-- Name: product_offers trg_product_offers_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_offers_updated BEFORE UPDATE ON public.product_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_suites trg_product_suites_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_suites_updated BEFORE UPDATE ON public.product_suites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_requests trg_protect_booking_public_updates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_booking_public_updates BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION public.protect_booking_public_updates();


--
-- Name: seller_notification_settings trg_sns_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sns_updated BEFORE UPDATE ON public.seller_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_messages trg_support_message_updates_ticket; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_support_message_updates_ticket AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.update_ticket_on_new_message();


--
-- Name: webchat_messages trg_sync_conversation_last_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_conversation_last_message AFTER INSERT OR DELETE OR UPDATE ON public.webchat_messages FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_last_message();


--
-- Name: scheduled_messages trg_validate_scheduled_message_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_scheduled_message_status BEFORE INSERT OR UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION public.validate_scheduled_message_status();


--
-- Name: agent_safety_limits update_agent_safety_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_safety_limits_updated_at BEFORE UPDATE ON public.agent_safety_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_training_materials update_agent_training_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_training_materials_updated_at BEFORE UPDATE ON public.agent_training_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_knowledge_base update_ai_knowledge_base_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_knowledge_base_updated_at BEFORE UPDATE ON public.ai_knowledge_base FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: auto_notification_settings update_auto_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_auto_notification_settings_updated_at BEFORE UPDATE ON public.auto_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_event_types update_booking_event_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_booking_event_types_updated_at BEFORE UPDATE ON public.booking_event_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_hours update_business_hours_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cadence_templates update_cadence_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cadence_templates_updated_at BEFORE UPDATE ON public.cadence_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: calendar_events update_calendar_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: capture_funnels update_capture_funnels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_capture_funnels_updated_at BEFORE UPDATE ON public.capture_funnels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chat_flows update_chat_flows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chat_flows_updated_at BEFORE UPDATE ON public.chat_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commission_rules update_commission_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_commission_rules_updated_at BEFORE UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: custom_fields update_custom_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: deals update_deals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: distribution_config update_distribution_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_distribution_config_updated_at BEFORE UPDATE ON public.distribution_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: evolution_instances update_evolution_instances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_evolution_instances_updated_at BEFORE UPDATE ON public.evolution_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: facebook_lead_integrations update_facebook_lead_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_facebook_lead_integrations_updated_at BEFORE UPDATE ON public.facebook_lead_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: form_templates update_form_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_form_templates_updated_at BEFORE UPDATE ON public.form_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: forms update_forms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_calendar_connections update_google_calendar_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_calendar_connections_updated_at BEFORE UPDATE ON public.google_calendar_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: help_articles update_help_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_help_articles_updated_at BEFORE UPDATE ON public.help_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: help_categories update_help_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_help_categories_updated_at BEFORE UPDATE ON public.help_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: integration_settings update_integration_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_integration_settings_updated_at BEFORE UPDATE ON public.integration_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lead_tags update_lead_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lead_tags_updated_at BEFORE UPDATE ON public.lead_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: materials update_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: objections update_objections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_objections_updated_at BEFORE UPDATE ON public.objections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: org_ai_credentials update_org_ai_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_org_ai_credentials_updated_at BEFORE UPDATE ON public.org_ai_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: org_ai_routing update_org_ai_routing_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_org_ai_routing_updated_at BEFORE UPDATE ON public.org_ai_routing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organization_orchestrator_config update_org_orchestrator_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_org_orchestrator_config_updated_at BEFORE UPDATE ON public.organization_orchestrator_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_email_settings update_platform_email_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_email_settings_updated_at BEFORE UPDATE ON public.platform_email_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_email_templates update_platform_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_email_templates_updated_at BEFORE UPDATE ON public.platform_email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_plans update_platform_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_plans_updated_at BEFORE UPDATE ON public.platform_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_releases update_platform_releases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_releases_updated_at BEFORE UPDATE ON public.platform_releases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_settings update_platform_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: post_sale_event_actions update_post_sale_event_actions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_sale_event_actions_updated_at BEFORE UPDATE ON public.post_sale_event_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_agents update_product_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_agents_updated_at BEFORE UPDATE ON public.product_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_ctas update_product_ctas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_ctas_updated_at BEFORE UPDATE ON public.product_ctas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_knowledge_sources update_product_knowledge_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_knowledge_sources_updated_at BEFORE UPDATE ON public.product_knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_onboarding_state update_product_onboarding_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_onboarding_state_updated_at BEFORE UPDATE ON public.product_onboarding_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_training_videos update_product_training_videos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_training_videos_updated_at BEFORE UPDATE ON public.product_training_videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quiz_templates update_quiz_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quiz_templates_updated_at BEFORE UPDATE ON public.quiz_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_goals update_sales_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sales_goals_updated_at BEFORE UPDATE ON public.sales_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_squads update_sales_squads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sales_squads_updated_at BEFORE UPDATE ON public.sales_squads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sectors update_sectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sectors_updated_at BEFORE UPDATE ON public.sectors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stage_values update_stage_values_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stage_values_updated_at BEFORE UPDATE ON public.stage_values FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscriptions update_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_tickets update_support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tag_automations update_tag_automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tag_automations_updated_at BEFORE UPDATE ON public.tag_automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_notification_settings update_user_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_notification_settings_updated_at BEFORE UPDATE ON public.user_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_status update_user_status_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_status_updated_at BEFORE UPDATE ON public.user_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webchat_agent_configs update_webchat_agent_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_webchat_agent_configs_updated_at BEFORE UPDATE ON public.webchat_agent_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webchat_conversations update_webchat_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_webchat_conversations_updated_at BEFORE UPDATE ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webchat_widgets update_webchat_widgets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_webchat_widgets_updated_at BEFORE UPDATE ON public.webchat_widgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webhooks update_webhooks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_agent_messages admin_agent_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_agent_messages
    ADD CONSTRAINT admin_agent_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: admin_notifications admin_notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: admin_notifications admin_notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_action_logs agent_action_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: agent_action_logs agent_action_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE SET NULL;


--
-- Name: agent_action_logs agent_action_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: agent_action_logs agent_action_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_action_logs agent_action_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_logs
    ADD CONSTRAINT agent_action_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: agent_activation_logs agent_activation_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE SET NULL;


--
-- Name: agent_activation_logs agent_activation_logs_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: agent_activation_logs agent_activation_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: agent_activation_logs agent_activation_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_activation_logs agent_activation_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: agent_activation_logs agent_activation_logs_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_activation_logs
    ADD CONSTRAINT agent_activation_logs_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: agent_post_sale_scenarios agent_post_sale_scenarios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_post_sale_scenarios
    ADD CONSTRAINT agent_post_sale_scenarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_post_sale_scenarios agent_post_sale_scenarios_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_post_sale_scenarios
    ADD CONSTRAINT agent_post_sale_scenarios_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_routing_rules agent_routing_rules_target_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routing_rules
    ADD CONSTRAINT agent_routing_rules_target_specialist_id_fkey FOREIGN KEY (target_specialist_id) REFERENCES public.agent_specialists(id) ON DELETE CASCADE;


--
-- Name: agent_training_materials agent_training_materials_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_materials
    ADD CONSTRAINT agent_training_materials_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.product_agents(id) ON DELETE CASCADE;


--
-- Name: agent_training_materials agent_training_materials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_materials
    ADD CONSTRAINT agent_training_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_training_materials agent_training_materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_materials
    ADD CONSTRAINT agent_training_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: ai_audits ai_audits_interaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_audits
    ADD CONSTRAINT ai_audits_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES public.interactions(id) ON DELETE CASCADE;


--
-- Name: ai_insights ai_insights_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_insights ai_insights_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: ai_insights ai_insights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_base ai_knowledge_base_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_base
    ADD CONSTRAINT ai_knowledge_base_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_base ai_knowledge_base_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_base
    ADD CONSTRAINT ai_knowledge_base_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: ai_outreach_queue ai_outreach_queue_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: ai_outreach_queue ai_outreach_queue_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE SET NULL;


--
-- Name: ai_outreach_queue ai_outreach_queue_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: ai_outreach_queue ai_outreach_queue_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_outreach_queue ai_outreach_queue_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: ai_outreach_queue ai_outreach_queue_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_outreach_queue
    ADD CONSTRAINT ai_outreach_queue_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE SET NULL;


--
-- Name: ai_prompt_variants ai_prompt_variants_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_variants
    ADD CONSTRAINT ai_prompt_variants_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.ai_prompt_experiments(id) ON DELETE CASCADE;


--
-- Name: ai_response_feedback ai_response_feedback_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_feedback
    ADD CONSTRAINT ai_response_feedback_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_response_feedback ai_response_feedback_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_feedback
    ADD CONSTRAINT ai_response_feedback_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: ai_response_feedback ai_response_feedback_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_feedback
    ADD CONSTRAINT ai_response_feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.webchat_messages(id) ON DELETE CASCADE;


--
-- Name: ai_response_feedback ai_response_feedback_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_feedback
    ADD CONSTRAINT ai_response_feedback_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: auto_notification_settings auto_notification_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_notification_settings
    ADD CONSTRAINT auto_notification_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: availability_overrides availability_overrides_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_overrides
    ADD CONSTRAINT availability_overrides_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: availability_overrides availability_overrides_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_overrides
    ADD CONSTRAINT availability_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: billing_history billing_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_history
    ADD CONSTRAINT billing_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: billing_history billing_history_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_history
    ADD CONSTRAINT billing_history_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: booking_event_types booking_event_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_event_types
    ADD CONSTRAINT booking_event_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_event_types booking_event_types_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_event_types
    ADD CONSTRAINT booking_event_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: booking_logs booking_logs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_logs
    ADD CONSTRAINT booking_logs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE;


--
-- Name: booking_logs booking_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_logs
    ADD CONSTRAINT booking_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_notification_settings booking_notification_settings_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_notification_settings
    ADD CONSTRAINT booking_notification_settings_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.booking_event_types(id) ON DELETE CASCADE;


--
-- Name: booking_notification_settings booking_notification_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_notification_settings
    ADD CONSTRAINT booking_notification_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_notification_settings booking_notification_settings_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_notification_settings
    ADD CONSTRAINT booking_notification_settings_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.evolution_instances(id) ON DELETE SET NULL;


--
-- Name: booking_reminders booking_reminders_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.booking_event_types(id) ON DELETE CASCADE;


--
-- Name: booking_reminders booking_reminders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_requests booking_requests_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.calendar_events(id) ON DELETE SET NULL;


--
-- Name: booking_requests booking_requests_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.booking_event_types(id) ON DELETE CASCADE;


--
-- Name: booking_requests booking_requests_host_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_host_user_id_fkey FOREIGN KEY (host_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: booking_requests booking_requests_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: booking_requests booking_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_scheduled_jobs booking_scheduled_jobs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_scheduled_jobs
    ADD CONSTRAINT booking_scheduled_jobs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE;


--
-- Name: booking_scheduled_jobs booking_scheduled_jobs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_scheduled_jobs
    ADD CONSTRAINT booking_scheduled_jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_scheduled_jobs booking_scheduled_jobs_reminder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_scheduled_jobs
    ADD CONSTRAINT booking_scheduled_jobs_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES public.booking_reminders(id) ON DELETE SET NULL;


--
-- Name: booking_status_history booking_status_history_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE;


--
-- Name: booking_status_history booking_status_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: business_holidays business_holidays_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_holidays
    ADD CONSTRAINT business_holidays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: business_hours business_hours_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: cadence_enrollments cadence_enrollments_cadence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_enrollments
    ADD CONSTRAINT cadence_enrollments_cadence_id_fkey FOREIGN KEY (cadence_id) REFERENCES public.cadences(id) ON DELETE CASCADE;


--
-- Name: cadence_enrollments cadence_enrollments_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_enrollments
    ADD CONSTRAINT cadence_enrollments_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.cadence_steps(id) ON DELETE SET NULL;


--
-- Name: cadence_step_runs cadence_step_runs_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_step_runs
    ADD CONSTRAINT cadence_step_runs_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.cadence_enrollments(id) ON DELETE CASCADE;


--
-- Name: cadence_step_runs cadence_step_runs_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_step_runs
    ADD CONSTRAINT cadence_step_runs_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.cadence_steps(id) ON DELETE CASCADE;


--
-- Name: cadence_steps cadence_steps_cadence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_steps
    ADD CONSTRAINT cadence_steps_cadence_id_fkey FOREIGN KEY (cadence_id) REFERENCES public.cadences(id) ON DELETE CASCADE;


--
-- Name: cadence_steps cadence_steps_context_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_steps
    ADD CONSTRAINT cadence_steps_context_id_fkey FOREIGN KEY (context_id) REFERENCES public.campaign_contexts(id) ON DELETE SET NULL;


--
-- Name: cadence_templates cadence_templates_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadence_templates
    ADD CONSTRAINT cadence_templates_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cakto_credentials cakto_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_credentials
    ADD CONSTRAINT cakto_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: cakto_orders cakto_orders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cakto_orders cakto_orders_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: cakto_orders cakto_orders_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.product_offers(id) ON DELETE SET NULL;


--
-- Name: cakto_orders cakto_orders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: cakto_orders cakto_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_orders
    ADD CONSTRAINT cakto_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: cakto_recovery_config cakto_recovery_config_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_config
    ADD CONSTRAINT cakto_recovery_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: cakto_recovery_config cakto_recovery_config_recovery_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_config
    ADD CONSTRAINT cakto_recovery_config_recovery_agent_id_fkey FOREIGN KEY (recovery_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: cakto_recovery_dispatches cakto_recovery_dispatches_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_dispatches
    ADD CONSTRAINT cakto_recovery_dispatches_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: cakto_recovery_dispatches cakto_recovery_dispatches_cakto_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_dispatches
    ADD CONSTRAINT cakto_recovery_dispatches_cakto_order_id_fkey FOREIGN KEY (cakto_order_id) REFERENCES public.cakto_orders(id) ON DELETE SET NULL;


--
-- Name: cakto_recovery_dispatches cakto_recovery_dispatches_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_dispatches
    ADD CONSTRAINT cakto_recovery_dispatches_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: cakto_recovery_dispatches cakto_recovery_dispatches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cakto_recovery_dispatches
    ADD CONSTRAINT cakto_recovery_dispatches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.calendar_events(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: campaign_targets campaign_targets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_post_cadence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_post_cadence_id_fkey FOREIGN KEY (post_cadence_id) REFERENCES public.cadences(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_assigned_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_assigned_squad_id_fkey FOREIGN KEY (assigned_squad_id) REFERENCES public.sales_squads(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: capture_funnels capture_funnels_post_quiz_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_post_quiz_agent_id_fkey FOREIGN KEY (post_quiz_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_post_quiz_cadence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_post_quiz_cadence_id_fkey FOREIGN KEY (post_quiz_cadence_id) REFERENCES public.cadences(id) ON DELETE SET NULL;


--
-- Name: capture_funnels capture_funnels_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_funnels
    ADD CONSTRAINT capture_funnels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: catalog_sync_logs catalog_sync_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_sync_logs
    ADD CONSTRAINT catalog_sync_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: catalog_sync_logs catalog_sync_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_sync_logs
    ADD CONSTRAINT catalog_sync_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: catalog_sync_logs catalog_sync_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_sync_logs
    ADD CONSTRAINT catalog_sync_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: chat_flows chat_flows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_flows
    ADD CONSTRAINT chat_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: chat_flows chat_flows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_flows
    ADD CONSTRAINT chat_flows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: chat_flows chat_flows_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_flows
    ADD CONSTRAINT chat_flows_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: commission_rules commission_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rules(id) ON DELETE SET NULL;


--
-- Name: conversation_notes conversation_notes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: conversation_transfers conversation_transfers_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_transfers conversation_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: conversation_transfers conversation_transfers_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id);


--
-- Name: conversation_transfers conversation_transfers_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles(id);


--
-- Name: custom_fields custom_fields_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: deals deals_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: deals deals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: deals deals_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: distribution_config distribution_config_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_config
    ADD CONSTRAINT distribution_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: distribution_config distribution_config_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_config
    ADD CONSTRAINT distribution_config_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: evolution_instances evolution_instances_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_instances
    ADD CONSTRAINT evolution_instances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: facebook_lead_integrations facebook_lead_integrations_assigned_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_integrations
    ADD CONSTRAINT facebook_lead_integrations_assigned_squad_id_fkey FOREIGN KEY (assigned_squad_id) REFERENCES public.sales_squads(id);


--
-- Name: facebook_lead_integrations facebook_lead_integrations_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_integrations
    ADD CONSTRAINT facebook_lead_integrations_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id);


--
-- Name: facebook_lead_integrations facebook_lead_integrations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_integrations
    ADD CONSTRAINT facebook_lead_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: facebook_lead_integrations facebook_lead_integrations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_integrations
    ADD CONSTRAINT facebook_lead_integrations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: facebook_lead_logs facebook_lead_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_logs
    ADD CONSTRAINT facebook_lead_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.facebook_lead_integrations(id) ON DELETE CASCADE;


--
-- Name: facebook_lead_logs facebook_lead_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_lead_logs
    ADD CONSTRAINT facebook_lead_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: form_blocks form_blocks_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_blocks
    ADD CONSTRAINT form_blocks_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: form_templates form_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: form_templates form_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: forms forms_assigned_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_assigned_squad_id_fkey FOREIGN KEY (assigned_squad_id) REFERENCES public.sales_squads(id);


--
-- Name: forms forms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: forms forms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: forms forms_post_cadence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_post_cadence_id_fkey FOREIGN KEY (post_cadence_id) REFERENCES public.cadences(id) ON DELETE SET NULL;


--
-- Name: forms forms_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: funnel_analytics funnel_analytics_funnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_analytics
    ADD CONSTRAINT funnel_analytics_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES public.capture_funnels(id) ON DELETE CASCADE;


--
-- Name: funnel_webhook_logs funnel_webhook_logs_funnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_webhook_logs
    ADD CONSTRAINT funnel_webhook_logs_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES public.capture_funnels(id) ON DELETE CASCADE;


--
-- Name: funnel_webhook_logs funnel_webhook_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_webhook_logs
    ADD CONSTRAINT funnel_webhook_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: funnel_webhook_logs funnel_webhook_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funnel_webhook_logs
    ADD CONSTRAINT funnel_webhook_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: google_calendar_connections google_calendar_connections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_connections
    ADD CONSTRAINT google_calendar_connections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: help_article_feedback help_article_feedback_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_feedback
    ADD CONSTRAINT help_article_feedback_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.help_articles(id) ON DELETE CASCADE;


--
-- Name: help_articles help_articles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.help_categories(id) ON DELETE SET NULL;


--
-- Name: help_articles help_articles_related_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_related_release_id_fkey FOREIGN KEY (related_release_id) REFERENCES public.platform_releases(id) ON DELETE SET NULL;


--
-- Name: hotmart_credentials hotmart_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_credentials
    ADD CONSTRAINT hotmart_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: hotmart_orders hotmart_orders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_orders
    ADD CONSTRAINT hotmart_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: hotmart_orders hotmart_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_orders
    ADD CONSTRAINT hotmart_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: hotmart_product_mapping hotmart_product_mapping_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_product_mapping
    ADD CONSTRAINT hotmart_product_mapping_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: hotmart_product_mapping hotmart_product_mapping_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotmart_product_mapping
    ADD CONSTRAINT hotmart_product_mapping_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: integration_settings integration_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_notes lead_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_queue lead_queue_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_queue lead_queue_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_queue lead_queue_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_queue lead_queue_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: lead_queue lead_queue_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_queue
    ADD CONSTRAINT lead_queue_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE SET NULL;


--
-- Name: lead_semantic_memory lead_semantic_memory_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_semantic_memory
    ADD CONSTRAINT lead_semantic_memory_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_stage_history lead_stage_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_stage_history
    ADD CONSTRAINT lead_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_stage_history lead_stage_history_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_stage_history
    ADD CONSTRAINT lead_stage_history_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: lead_tag_assignments lead_tag_assignments_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_tag_assignments lead_tag_assignments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_tag_assignments lead_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.lead_tags(id) ON DELETE CASCADE;


--
-- Name: lead_tags lead_tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_tags lead_tags_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_transfer_history lead_transfer_history_from_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_from_squad_id_fkey FOREIGN KEY (from_squad_id) REFERENCES public.sales_squads(id);


--
-- Name: lead_transfer_history lead_transfer_history_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id);


--
-- Name: lead_transfer_history lead_transfer_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_transfer_history lead_transfer_history_to_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_to_squad_id_fkey FOREIGN KEY (to_squad_id) REFERENCES public.sales_squads(id);


--
-- Name: lead_transfer_history lead_transfer_history_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles(id);


--
-- Name: lead_transfer_history lead_transfer_history_transferred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_transfer_history
    ADD CONSTRAINT lead_transfer_history_transferred_by_fkey FOREIGN KEY (transferred_by) REFERENCES public.profiles(id);


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_closer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_closer_id_fkey FOREIGN KEY (closer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_current_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_current_stage_id_fkey FOREIGN KEY (current_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: leads leads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: leads leads_sdr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_sdr_id_fkey FOREIGN KEY (sdr_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE SET NULL;


--
-- Name: leads leads_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE SET NULL;


--
-- Name: mass_email_campaigns mass_email_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_campaigns
    ADD CONSTRAINT mass_email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mass_email_campaigns mass_email_campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_campaigns
    ADD CONSTRAINT mass_email_campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mass_email_campaigns mass_email_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_campaigns
    ADD CONSTRAINT mass_email_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: mass_email_recipients mass_email_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_recipients
    ADD CONSTRAINT mass_email_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.mass_email_campaigns(id) ON DELETE CASCADE;


--
-- Name: mass_email_recipients mass_email_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mass_email_recipients
    ADD CONSTRAINT mass_email_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: materials materials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: materials materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.webchat_messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_logs notification_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_admin_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_admin_notification_id_fkey FOREIGN KEY (admin_notification_id) REFERENCES public.admin_notifications(id);


--
-- Name: notifications notifications_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: objections objections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objections
    ADD CONSTRAINT objections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: objections objections_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objections
    ADD CONSTRAINT objections_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: opportunity_scan_items opportunity_scan_items_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_scan_items
    ADD CONSTRAINT opportunity_scan_items_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.opportunity_scans(id) ON DELETE CASCADE;


--
-- Name: orchestration_logs orchestration_logs_agent_routed_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_agent_routed_to_fkey FOREIGN KEY (agent_routed_to) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: orchestration_logs orchestration_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE SET NULL;


--
-- Name: orchestration_logs orchestration_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: orchestration_logs orchestration_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: orchestration_logs orchestration_logs_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_logs
    ADD CONSTRAINT orchestration_logs_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: organization_orchestrator_config organization_orchestrator_config_orchestrator_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_orchestrator_config
    ADD CONSTRAINT organization_orchestrator_config_orchestrator_agent_id_fkey FOREIGN KEY (orchestrator_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: organization_orchestrator_config organization_orchestrator_config_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_orchestrator_config
    ADD CONSTRAINT organization_orchestrator_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);


--
-- Name: organizations organizations_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.platform_plans(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: platform_audit_logs platform_audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_logs
    ADD CONSTRAINT platform_audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: platform_release_reads platform_release_reads_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_release_reads
    ADD CONSTRAINT platform_release_reads_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.platform_releases(id) ON DELETE CASCADE;


--
-- Name: post_sale_event_actions post_sale_event_actions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_assign_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_assign_sector_id_fkey FOREIGN KEY (assign_sector_id) REFERENCES public.sectors(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_assign_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_assign_user_id_fkey FOREIGN KEY (assign_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_email_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_email_template_id_fkey FOREIGN KEY (email_template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chat_flows(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_notify_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_notify_user_id_fkey FOREIGN KEY (notify_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions post_sale_event_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: post_sale_event_actions post_sale_event_actions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: post_sale_event_actions post_sale_event_actions_target_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_actions
    ADD CONSTRAINT post_sale_event_actions_target_stage_id_fkey FOREIGN KEY (target_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_logs post_sale_event_logs_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_logs
    ADD CONSTRAINT post_sale_event_logs_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.post_sale_event_actions(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_logs post_sale_event_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_logs
    ADD CONSTRAINT post_sale_event_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_logs post_sale_event_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_logs
    ADD CONSTRAINT post_sale_event_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: post_sale_event_logs post_sale_event_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_event_logs
    ADD CONSTRAINT post_sale_event_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: post_sale_scheduled_runs post_sale_scheduled_runs_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_scheduled_runs
    ADD CONSTRAINT post_sale_scheduled_runs_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.post_sale_event_actions(id) ON DELETE CASCADE;


--
-- Name: post_sale_scheduled_runs post_sale_scheduled_runs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_sale_scheduled_runs
    ADD CONSTRAINT post_sale_scheduled_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: product_agents product_agents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_agents
    ADD CONSTRAINT product_agents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: product_agents product_agents_evolution_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_agents
    ADD CONSTRAINT product_agents_evolution_instance_id_fkey FOREIGN KEY (evolution_instance_id) REFERENCES public.evolution_instances(id) ON DELETE SET NULL;


--
-- Name: product_agents product_agents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_agents
    ADD CONSTRAINT product_agents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: product_agents product_agents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_agents
    ADD CONSTRAINT product_agents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_catalog_items product_catalog_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog_items
    ADD CONSTRAINT product_catalog_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: product_catalog_items product_catalog_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog_items
    ADD CONSTRAINT product_catalog_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: product_ctas product_ctas_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ctas
    ADD CONSTRAINT product_ctas_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: product_ctas product_ctas_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ctas
    ADD CONSTRAINT product_ctas_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_knowledge_sources product_knowledge_sources_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_knowledge_sources
    ADD CONSTRAINT product_knowledge_sources_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: product_knowledge_sources product_knowledge_sources_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_knowledge_sources
    ADD CONSTRAINT product_knowledge_sources_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_offers product_offers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_offers
    ADD CONSTRAINT product_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: product_onboarding_state product_onboarding_state_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_onboarding_state
    ADD CONSTRAINT product_onboarding_state_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: product_onboarding_state product_onboarding_state_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_onboarding_state
    ADD CONSTRAINT product_onboarding_state_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_training_videos product_training_videos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_training_videos
    ADD CONSTRAINT product_training_videos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: product_training_videos product_training_videos_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_training_videos
    ADD CONSTRAINT product_training_videos_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: product_training_videos product_training_videos_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_training_videos
    ADD CONSTRAINT product_training_videos_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: products products_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: products products_suite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_suite_id_fkey FOREIGN KEY (suite_id) REFERENCES public.product_suites(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: quick_replies quick_replies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: quick_replies quick_replies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: quiz_templates quiz_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_templates
    ADD CONSTRAINT quiz_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: quiz_templates quiz_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_templates
    ADD CONSTRAINT quiz_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sales_goals sales_goals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_goals
    ADD CONSTRAINT sales_goals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sales_goals sales_goals_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_goals
    ADD CONSTRAINT sales_goals_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: sales_squads sales_squads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_squads
    ADD CONSTRAINT sales_squads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sales_squads sales_squads_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_squads
    ADD CONSTRAINT sales_squads_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sankhya_mappings sankhya_mappings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sankhya_mappings
    ADD CONSTRAINT sankhya_mappings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: sankhya_sync_logs sankhya_sync_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sankhya_sync_logs
    ADD CONSTRAINT sankhya_sync_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: scheduled_messages scheduled_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: scheduled_messages scheduled_messages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: scheduled_messages scheduled_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: sector_members sector_members_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;


--
-- Name: sector_members sector_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: seller_notification_settings seller_notification_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notification_settings
    ADD CONSTRAINT seller_notification_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: seller_notification_settings seller_notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notification_settings
    ADD CONSTRAINT seller_notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: squad_members squad_members_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE CASCADE;


--
-- Name: stage_values stage_values_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_values
    ADD CONSTRAINT stage_values_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stage_values stage_values_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_values
    ADD CONSTRAINT stage_values_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.platform_plans(id) ON DELETE SET NULL;


--
-- Name: support_messages support_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_super_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_super_admin_fkey FOREIGN KEY (assigned_super_admin) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tag_automations tag_automations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tag_automations tag_automations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tag_automations tag_automations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: tag_automations tag_automations_tag_id_to_add_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_tag_id_to_add_fkey FOREIGN KEY (tag_id_to_add) REFERENCES public.lead_tags(id) ON DELETE CASCADE;


--
-- Name: tag_automations tag_automations_tag_id_to_remove_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_automations
    ADD CONSTRAINT tag_automations_tag_id_to_remove_fkey FOREIGN KEY (tag_id_to_remove) REFERENCES public.lead_tags(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_invitations team_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: team_invitations team_invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: team_invitations team_invitations_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE SET NULL;


--
-- Name: user_availability user_availability_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_availability user_availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_product_assignments user_product_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_assignments
    ADD CONSTRAINT user_product_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- Name: user_product_assignments user_product_assignments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_assignments
    ADD CONSTRAINT user_product_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: user_product_assignments user_product_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_assignments
    ADD CONSTRAINT user_product_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_status user_status_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status
    ADD CONSTRAINT user_status_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_status user_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status
    ADD CONSTRAINT user_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: webchat_agent_configs webchat_agent_configs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_agent_configs
    ADD CONSTRAINT webchat_agent_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: webchat_agent_configs webchat_agent_configs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_agent_configs
    ADD CONSTRAINT webchat_agent_configs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: webchat_agent_configs webchat_agent_configs_widget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_agent_configs
    ADD CONSTRAINT webchat_agent_configs_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES public.webchat_widgets(id) ON DELETE CASCADE;


--
-- Name: webchat_assignment_events webchat_assignment_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_assignment_events
    ADD CONSTRAINT webchat_assignment_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: webchat_assignment_events webchat_assignment_events_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_assignment_events
    ADD CONSTRAINT webchat_assignment_events_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webchat_assignment_events webchat_assignment_events_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_assignment_events
    ADD CONSTRAINT webchat_assignment_events_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_current_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_current_agent_id_fkey FOREIGN KEY (current_agent_id) REFERENCES public.product_agents(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_evolution_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_evolution_instance_id_fkey FOREIGN KEY (evolution_instance_id) REFERENCES public.evolution_instances(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: webchat_conversations webchat_conversations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE SET NULL;


--
-- Name: webchat_conversations webchat_conversations_widget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES public.webchat_widgets(id) ON DELETE CASCADE;


--
-- Name: webchat_messages webchat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: webchat_messages webchat_messages_forwarded_from_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_forwarded_from_message_id_fkey FOREIGN KEY (forwarded_from_message_id) REFERENCES public.webchat_messages(id);


--
-- Name: webchat_messages webchat_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.webchat_messages(id);


--
-- Name: webchat_messages webchat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webchat_widgets webchat_widgets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_widgets
    ADD CONSTRAINT webchat_widgets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: webchat_widgets webchat_widgets_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_widgets
    ADD CONSTRAINT webchat_widgets_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: webhook_logs webhook_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: webhook_logs webhook_logs_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: webhook_sample_requests webhook_sample_requests_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_sample_requests
    ADD CONSTRAINT webhook_sample_requests_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: webhooks webhooks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: webhooks webhooks_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: webhooks webhooks_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.sales_squads(id) ON DELETE SET NULL;


--
-- Name: post_sale_event_actions Acoes pos-venda visiveis pela organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Acoes pos-venda visiveis pela organizacao" ON public.post_sale_event_actions FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: opportunity_scans Admin can delete org scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete org scans" ON public.opportunity_scans FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: opportunity_scans Admin can insert org scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert org scans" ON public.opportunity_scans FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: opportunity_scans Admin can update org scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update org scans" ON public.opportunity_scans FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: opportunity_scans Admin can view org scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view org scans" ON public.opportunity_scans FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: opportunity_scan_items Admin manage scan items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage scan items" ON public.opportunity_scan_items TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: opportunity_scan_schedules Admin manage schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage schedules" ON public.opportunity_scan_schedules TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: cakto_recovery_config Admin org pode editar config recuperação; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin org pode editar config recuperação" ON public.cakto_recovery_config TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: cakto_recovery_config Admin org pode ver config recuperação; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin org pode ver config recuperação" ON public.cakto_recovery_config FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: cakto_recovery_dispatches Admin org pode ver histórico recuperação; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin org pode ver histórico recuperação" ON public.cakto_recovery_dispatches FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: opportunity_scan_items Admin view scan items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin view scan items" ON public.opportunity_scan_items FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: admin_notifications Admins and managers can create admin notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can create admin notifications" ON public.admin_notifications FOR INSERT WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: team_invitations Admins and managers can delete invitations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can delete invitations in their org" ON public.team_invitations FOR DELETE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: leads Admins and managers can delete leads in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can delete leads in their org" ON public.leads FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webhooks Admins and managers can delete webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can delete webhooks" ON public.webhooks FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: sales_goals Admins and managers can insert goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert goals" ON public.sales_goals FOR INSERT WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: team_invitations Admins and managers can insert invitations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert invitations in their org" ON public.team_invitations FOR INSERT TO authenticated WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: products Admins and managers can insert products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webhooks Admins and managers can insert webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert webhooks" ON public.webhooks FOR INSERT WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webchat_agent_configs Admins and managers can manage agent configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage agent configs" ON public.webchat_agent_configs USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: tasks Admins and managers can manage all tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage all tasks" ON public.tasks TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: cadence_templates Admins and managers can manage cadence templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage cadence templates" ON public.cadence_templates TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = cadence_templates.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: commission_rules Admins and managers can manage commission rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage commission rules" ON public.commission_rules USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: ai_knowledge_base Admins and managers can manage knowledge base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage knowledge base" ON public.ai_knowledge_base USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: materials Admins and managers can manage materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage materials" ON public.materials TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: objections Admins and managers can manage objections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage objections" ON public.objections TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: squad_members Admins and managers can manage squad members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage squad members" ON public.squad_members USING (((EXISTS ( SELECT 1
   FROM public.sales_squads s
  WHERE ((s.id = squad_members.squad_id) AND (s.organization_id = public.get_user_organization(auth.uid()))))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: sales_squads Admins and managers can manage squads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage squads" ON public.sales_squads USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: stage_values Admins and managers can manage stage values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage stage values" ON public.stage_values USING (((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = stage_values.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: pipeline_stages Admins and managers can manage stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage stages" ON public.pipeline_stages TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = pipeline_stages.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: product_training_videos Admins and managers can manage training videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage training videos" ON public.product_training_videos USING (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webchat_widgets Admins and managers can manage webchat widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can manage webchat widgets" ON public.webchat_widgets USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: admin_notifications Admins and managers can update admin notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update admin notifications" ON public.admin_notifications FOR UPDATE USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: commissions Admins and managers can update commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update commissions" ON public.commissions FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: deals Admins and managers can update deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update deals" ON public.deals FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: evolution_instances Admins and managers can update evolution instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update evolution instances" ON public.evolution_instances FOR UPDATE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: sales_goals Admins and managers can update goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update goals" ON public.sales_goals FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: team_invitations Admins and managers can update invitations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update invitations in their org" ON public.team_invitations FOR UPDATE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: products Admins and managers can update products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update products" ON public.products FOR UPDATE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webhooks Admins and managers can update webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can update webhooks" ON public.webhooks FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: admin_notifications Admins and managers can view admin notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can view admin notifications" ON public.admin_notifications FOR SELECT USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: evolution_instances Admins and managers can view evolution instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can view evolution instances" ON public.evolution_instances FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: team_invitations Admins and managers can view invitations in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can view invitations in their org" ON public.team_invitations FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: product_ctas Admins can delete CTAs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete CTAs" ON public.product_ctas FOR DELETE USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: calendar_events Admins can delete all org events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete all org events" ON public.calendar_events FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: product_catalog_items Admins can delete catalog items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete catalog items" ON public.product_catalog_items FOR DELETE USING (((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: capture_funnels Admins can delete funnels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete funnels" ON public.capture_funnels FOR DELETE TO authenticated USING ((((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: sales_goals Admins can delete goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete goals" ON public.sales_goals FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: facebook_lead_integrations Admins can delete integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete integrations" ON public.facebook_lead_integrations FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: products Admins can delete products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sectors Admins can delete sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete sectors" ON public.sectors FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: product_ctas Admins can insert CTAs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert CTAs" ON public.product_ctas FOR INSERT WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: product_catalog_items Admins can insert catalog items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert catalog items" ON public.product_catalog_items FOR INSERT WITH CHECK (((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: capture_funnels Admins can insert funnels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert funnels" ON public.capture_funnels FOR INSERT TO authenticated WITH CHECK ((((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: facebook_lead_integrations Admins can insert integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert integrations" ON public.facebook_lead_integrations FOR INSERT WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: auto_notification_settings Admins can manage auto notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage auto notification settings" ON public.auto_notification_settings USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: mass_email_campaigns Admins can manage campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage campaigns" ON public.mass_email_campaigns USING ((public.user_belongs_to_organization(organization_id, auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: distribution_config Admins can manage distribution config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage distribution config" ON public.distribution_config TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: email_templates Admins can manage email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage email templates" ON public.email_templates TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: chat_flows Admins can manage flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage flows" ON public.chat_flows USING (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: integration_settings Admins can manage integration settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage integration settings" ON public.integration_settings USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: sankhya_mappings Admins can manage org sankhya mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage org sankhya mappings" ON public.sankhya_mappings USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_permissions Admins can manage permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage permissions" ON public.user_permissions TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: mass_email_recipients Admins can manage recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage recipients" ON public.mass_email_recipients USING ((EXISTS ( SELECT 1
   FROM public.mass_email_campaigns c
  WHERE ((c.id = mass_email_recipients.campaign_id) AND public.user_belongs_to_organization(c.organization_id, auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: catalog_sync_logs Admins can manage sync logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage sync logs" ON public.catalog_sync_logs USING (((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid()))) WITH CHECK (((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: product_ctas Admins can update CTAs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update CTAs" ON public.product_ctas FOR UPDATE USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: calendar_events Admins can update all org events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all org events" ON public.calendar_events FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: product_catalog_items Admins can update catalog items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update catalog items" ON public.product_catalog_items FOR UPDATE USING (((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: capture_funnels Admins can update funnels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update funnels" ON public.capture_funnels FOR UPDATE TO authenticated USING ((((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)) OR public.is_super_admin(auth.uid())));


--
-- Name: facebook_lead_integrations Admins can update integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update integrations" ON public.facebook_lead_integrations FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: organizations Admins can update their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update their organization" ON public.organizations FOR UPDATE TO authenticated USING (((id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: calendar_events Admins can view all org events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all org events" ON public.calendar_events FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: lead_queue Admins can view all queue in org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all queue in org" ON public.lead_queue FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (squad_id IN ( SELECT squad_members.squad_id
   FROM public.squad_members
  WHERE (squad_members.user_id = auth.uid()))))));


--
-- Name: admin_agent_messages Admins can view their org admin agent messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view their org admin agent messages" ON public.admin_agent_messages FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: post_sale_event_actions Admins gerenciam acoes pos-venda; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam acoes pos-venda" ON public.post_sale_event_actions USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: tag_automations Admins gerenciam automacoes de tag; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam automacoes de tag" ON public.tag_automations USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: business_holidays Admins gerenciam feriados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam feriados" ON public.business_holidays USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: business_hours Admins gerenciam horarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam horarios" ON public.business_hours USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: lead_tags Admins gerenciam tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam tags" ON public.lead_tags USING ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: hotmart_credentials Admins manage hotmart credentials of their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage hotmart credentials of their org" ON public.hotmart_credentials TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: hotmart_orders Admins manage hotmart orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage hotmart orders" ON public.hotmart_orders TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: hotmart_product_mapping Admins manage hotmart product mapping; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage hotmart product mapping" ON public.hotmart_product_mapping TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: agent_training_materials Admins/Managers can manage training materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/Managers can manage training materials" ON public.agent_training_materials USING (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: user_product_assignments Admins/managers can delete assignments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can delete assignments in their org" ON public.user_product_assignments FOR DELETE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_product_assignments.user_id) AND (p.organization_id = public.get_user_organization(auth.uid())))))));


--
-- Name: custom_fields Admins/managers can delete custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can delete custom fields" ON public.custom_fields FOR DELETE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: agent_post_sale_scenarios Admins/managers can delete scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can delete scenarios" ON public.agent_post_sale_scenarios FOR DELETE USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: user_product_assignments Admins/managers can insert assignments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can insert assignments in their org" ON public.user_product_assignments FOR INSERT TO authenticated WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_product_assignments.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM public.products pr
  WHERE ((pr.id = user_product_assignments.product_id) AND (pr.organization_id = public.get_user_organization(auth.uid())))))));


--
-- Name: custom_fields Admins/managers can insert custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can insert custom fields" ON public.custom_fields FOR INSERT WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: agent_post_sale_scenarios Admins/managers can insert scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can insert scenarios" ON public.agent_post_sale_scenarios FOR INSERT WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: sectors Admins/managers can insert sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can insert sectors" ON public.sectors FOR INSERT WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: user_product_assignments Admins/managers can update assignments in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can update assignments in their org" ON public.user_product_assignments FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_product_assignments.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_product_assignments.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM public.products pr
  WHERE ((pr.id = user_product_assignments.product_id) AND (pr.organization_id = public.get_user_organization(auth.uid())))))));


--
-- Name: custom_fields Admins/managers can update custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can update custom fields" ON public.custom_fields FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: agent_post_sale_scenarios Admins/managers can update scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can update scenarios" ON public.agent_post_sale_scenarios FOR UPDATE USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: sectors Admins/managers can update sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can update sectors" ON public.sectors FOR UPDATE USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: agent_post_sale_scenarios Admins/managers can view scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can view scenarios" ON public.agent_post_sale_scenarios FOR SELECT USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: sector_members Admins/managers manage sector members - delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers manage sector members - delete" ON public.sector_members FOR DELETE USING ((public.user_in_sector_organization(auth.uid(), sector_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: sector_members Admins/managers manage sector members - insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers manage sector members - insert" ON public.sector_members FOR INSERT WITH CHECK ((public.user_in_sector_organization(auth.uid(), sector_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: facebook_lead_integrations Admins/managers view org integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers view org integrations" ON public.facebook_lead_integrations FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: message_reactions Agents can delete their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can delete their own reactions" ON public.message_reactions FOR DELETE USING (((reactor_type = 'agent'::text) AND (user_id = auth.uid())));


--
-- Name: message_reactions Agents can insert their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert their own reactions" ON public.message_reactions FOR INSERT WITH CHECK (((reactor_type = 'agent'::text) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.webchat_conversations c
     JOIN public.profiles p ON ((p.organization_id = c.organization_id)))
  WHERE ((c.id = message_reactions.conversation_id) AND (p.id = auth.uid()))))));


--
-- Name: webchat_conversations Allow conversation inserts via valid widget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow conversation inserts via valid widget" ON public.webchat_conversations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.webchat_widgets w
  WHERE ((w.id = webchat_conversations.widget_id) AND (w.organization_id = webchat_conversations.organization_id) AND (w.is_active = true)))));


--
-- Name: help_categories Anyone authenticated can view active help categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view active help categories" ON public.help_categories FOR SELECT TO authenticated USING (((is_active = true) OR public.is_super_admin(auth.uid())));


--
-- Name: platform_plans Anyone authenticated can view active plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view active plans" ON public.platform_plans FOR SELECT TO authenticated USING (true);


--
-- Name: help_articles Anyone authenticated can view published help articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view published help articles" ON public.help_articles FOR SELECT TO authenticated USING (((is_published = true) OR public.is_super_admin(auth.uid())));


--
-- Name: platform_releases Anyone authenticated can view published releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view published releases" ON public.platform_releases FOR SELECT TO authenticated USING (((is_published = true) OR public.is_super_admin(auth.uid())));


--
-- Name: booking_requests Anyone can create booking requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create booking requests" ON public.booking_requests FOR INSERT WITH CHECK (true);


--
-- Name: sales_leads Anyone can insert sales leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert sales leads" ON public.sales_leads FOR INSERT WITH CHECK (true);


--
-- Name: form_submissions Anyone can submit to active forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit to active forms" ON public.form_submissions FOR INSERT WITH CHECK ((form_id IN ( SELECT forms.id
   FROM public.forms
  WHERE (forms.status = 'active'::text))));


--
-- Name: booking_event_types Anyone can view active event types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active event types" ON public.booking_event_types FOR SELECT USING ((is_active = true));


--
-- Name: forms Anyone can view active forms by slug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active forms by slug" ON public.forms FOR SELECT USING ((status = 'active'::text));


--
-- Name: form_blocks Anyone can view blocks of active forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view blocks of active forms" ON public.form_blocks FOR SELECT USING ((form_id IN ( SELECT forms.id
   FROM public.forms
  WHERE (forms.status = 'active'::text))));


--
-- Name: lead_tag_assignments Atribuicoes visiveis por organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Atribuicoes visiveis por organizacao" ON public.lead_tag_assignments FOR SELECT USING ((public.is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND public.user_belongs_to_organization(auth.uid(), l.organization_id))))));


--
-- Name: platform_email_templates Authenticated can view active platform templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view active platform templates" ON public.platform_email_templates FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: ai_audits Authenticated users can insert audits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert audits" ON public.ai_audits FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.interactions i
  WHERE ((i.id = ai_audits.interaction_id) AND (i.user_id = auth.uid())))) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: ai_insights Authenticated users can insert insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert insights" ON public.ai_insights FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (organization_id = public.get_user_organization(auth.uid()))));


--
-- Name: notifications Authenticated users can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((user_id IS NOT NULL));


--
-- Name: tag_automations Automacoes visiveis por organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Automacoes visiveis por organizacao" ON public.tag_automations FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: business_holidays Feriados visiveis por organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Feriados visiveis por organizacao" ON public.business_holidays FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: business_hours Horarios visiveis por organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Horarios visiveis por organizacao" ON public.business_hours FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_requests Hosts can view and manage their bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can view and manage their bookings" ON public.booking_requests TO authenticated USING ((host_user_id = auth.uid()));


--
-- Name: post_sale_event_logs Logs visiveis pela organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Logs visiveis pela organizacao" ON public.post_sale_event_logs FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: calendar_events Managers can view all org events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view all org events" ON public.calendar_events FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: product_catalog_items Members can view catalog items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view catalog items" ON public.product_catalog_items FOR SELECT USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid())));


--
-- Name: catalog_sync_logs Members can view sync logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view sync logs" ON public.catalog_sync_logs FOR SELECT USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid())));


--
-- Name: lead_tag_assignments Membros da organizacao podem atribuir tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Membros da organizacao podem atribuir tags" ON public.lead_tag_assignments USING ((public.is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND public.user_belongs_to_organization(auth.uid(), l.organization_id)))))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND public.user_belongs_to_organization(auth.uid(), l.organization_id))))));


--
-- Name: support_tickets Membros podem criar tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Membros podem criar tickets" ON public.support_tickets FOR INSERT WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (created_by = auth.uid())));


--
-- Name: support_messages Mensagens podem ser criadas por envolvidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mensagens podem ser criadas por envolvidos" ON public.support_messages FOR INSERT WITH CHECK (((author_id = auth.uid()) AND (public.is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND public.user_belongs_to_organization(auth.uid(), t.organization_id)))))));


--
-- Name: support_messages Mensagens visiveis para envolvidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mensagens visiveis para envolvidos" ON public.support_messages FOR SELECT USING ((public.is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND public.user_belongs_to_organization(auth.uid(), t.organization_id))))));


--
-- Name: evolution_instances Only super admin can delete evolution instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only super admin can delete evolution instances" ON public.evolution_instances FOR DELETE USING (public.is_super_admin(auth.uid()));


--
-- Name: evolution_instances Only super admin can insert evolution instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only super admin can insert evolution instances" ON public.evolution_instances FOR INSERT WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: agent_safety_limits Org admin manages safety limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admin manages safety limits" ON public.agent_safety_limits TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: org_ai_credentials Org admins can delete AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can delete AI credentials" ON public.org_ai_credentials FOR DELETE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_routing Org admins can delete AI routing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can delete AI routing" ON public.org_ai_routing FOR DELETE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_credentials Org admins can insert AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can insert AI credentials" ON public.org_ai_credentials FOR INSERT TO authenticated WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_routing Org admins can insert AI routing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can insert AI routing" ON public.org_ai_routing FOR INSERT TO authenticated WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_credentials Org admins can update AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can update AI credentials" ON public.org_ai_credentials FOR UPDATE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_routing Org admins can update AI routing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can update AI routing" ON public.org_ai_routing FOR UPDATE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: billing_history Org admins can view own billing history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can view own billing history" ON public.billing_history FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: subscriptions Org admins can view own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can view own subscription" ON public.subscriptions FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: ai_router_failures Org admins can view router failures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can view router failures" ON public.ai_router_failures FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: org_ai_credentials Org admins can view their AI credentials status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can view their AI credentials status" ON public.org_ai_credentials FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: funnel_webhook_logs Org admins can view webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can view webhook logs" ON public.funnel_webhook_logs FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: cadence_api_keys Org admins manage their api keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins manage their api keys" ON public.cadence_api_keys TO authenticated USING (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: cakto_credentials Org admins manage their cakto credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins manage their cakto credentials" ON public.cakto_credentials USING (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: cakto_orders Org admins manage their cakto orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins manage their cakto orders" ON public.cakto_orders USING (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: cakto_credentials Org admins view their cakto credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins view their cakto credentials" ON public.cakto_credentials FOR SELECT USING (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: agent_activation_logs Org admins/managers can view activation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins/managers can view activation logs" ON public.agent_activation_logs FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: payment_links Org members can create payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can create payment links" ON public.payment_links FOR INSERT TO authenticated WITH CHECK (((organization_id = public.get_user_organization(auth.uid())) AND (created_by = auth.uid())));


--
-- Name: quiz_templates Org members can create templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can create templates" ON public.quiz_templates FOR INSERT TO authenticated WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_offers Org members can delete offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can delete offers" ON public.product_offers FOR DELETE USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: payment_links Org members can delete payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can delete payment links" ON public.payment_links FOR DELETE TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: product_suites Org members can delete suites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can delete suites" ON public.product_suites FOR DELETE USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: quiz_templates Org members can delete their templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can delete their templates" ON public.quiz_templates FOR DELETE TO authenticated USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: lead_semantic_memory Org members can insert lead memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can insert lead memory" ON public.lead_semantic_memory FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: product_offers Org members can insert offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can insert offers" ON public.product_offers FOR INSERT WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: product_suites Org members can insert suites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can insert suites" ON public.product_suites FOR INSERT WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: ai_prompt_experiments Org members can manage experiments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can manage experiments" ON public.ai_prompt_experiments TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id)) WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: agent_routing_rules Org members can manage routing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can manage routing rules" ON public.agent_routing_rules TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id)) WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: agent_specialists Org members can manage specialists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can manage specialists" ON public.agent_specialists TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id)) WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: ai_prompt_variants Org members can manage variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can manage variants" ON public.ai_prompt_variants TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id)) WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: ai_quality_evaluations Org members can read evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can read evaluations" ON public.ai_quality_evaluations FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: agent_handoff_history Org members can read handoff history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can read handoff history" ON public.agent_handoff_history FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: lead_semantic_memory Org members can read own lead memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can read own lead memory" ON public.lead_semantic_memory FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: product_offers Org members can update offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can update offers" ON public.product_offers FOR UPDATE USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: payment_links Org members can update payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can update payment links" ON public.payment_links FOR UPDATE TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: product_suites Org members can update suites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can update suites" ON public.product_suites FOR UPDATE USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: quiz_templates Org members can update their templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can update their templates" ON public.quiz_templates FOR UPDATE TO authenticated USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: org_ai_routing Org members can view AI routing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view AI routing" ON public.org_ai_routing FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: booking_event_types Org members can view all event types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view all event types" ON public.booking_event_types FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: availability_overrides Org members can view availability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view availability overrides" ON public.availability_overrides FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: product_offers Org members can view offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view offers" ON public.product_offers FOR SELECT USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: payment_links Org members can view payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view payment links" ON public.payment_links FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: message_reactions Org members can view reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view reactions" ON public.message_reactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.webchat_conversations c
     JOIN public.profiles p ON ((p.organization_id = c.organization_id)))
  WHERE ((c.id = message_reactions.conversation_id) AND (p.id = auth.uid())))));


--
-- Name: product_suites Org members can view suites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view suites" ON public.product_suites FOR SELECT USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: sectors Org members can view their sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members can view their sectors" ON public.sectors FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid())));


--
-- Name: booking_notification_settings Org members delete notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members delete notification settings" ON public.booking_notification_settings FOR DELETE TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_reminders Org members delete reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members delete reminders" ON public.booking_reminders FOR DELETE TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_logs Org members read booking logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read booking logs" ON public.booking_logs FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_scheduled_jobs Org members read jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read jobs" ON public.booking_scheduled_jobs FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_notification_settings Org members read notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read notification settings" ON public.booking_notification_settings FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_reminders Org members read reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read reminders" ON public.booking_reminders FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: agent_safety_limits Org members read safety limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read safety limits" ON public.agent_safety_limits FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid())));


--
-- Name: booking_status_history Org members read status history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read status history" ON public.booking_status_history FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: agent_tool_executions Org members read tool executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members read tool executions" ON public.agent_tool_executions FOR SELECT TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid())));


--
-- Name: booking_notification_settings Org members update notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members update notification settings" ON public.booking_notification_settings FOR UPDATE TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_reminders Org members update reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members update reminders" ON public.booking_reminders FOR UPDATE TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: hotmart_orders Org members view hotmart orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members view hotmart orders" ON public.hotmart_orders FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: hotmart_product_mapping Org members view hotmart product mapping; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members view hotmart product mapping" ON public.hotmart_product_mapping FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: cakto_orders Org members view their cakto orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members view their cakto orders" ON public.cakto_orders FOR SELECT USING (((scope = 'organization'::text) AND (organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: booking_notification_settings Org members write notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members write notification settings" ON public.booking_notification_settings FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: booking_reminders Org members write reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members write reminders" ON public.booking_reminders FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: capture_funnels Public can view active funnels by slug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active funnels by slug" ON public.capture_funnels FOR SELECT TO anon USING ((status = 'active'::text));


--
-- Name: user_availability Public can view availability of bookable hosts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view availability of bookable hosts" ON public.user_availability FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.booking_event_types bet
  WHERE ((bet.user_id = user_availability.user_id) AND (bet.is_active = true)))));


--
-- Name: quiz_templates Public/official templates are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public/official templates are readable" ON public.quiz_templates FOR SELECT USING (((is_public = true) OR (organization_id IS NULL) OR ((auth.uid() IS NOT NULL) AND (organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))))));


--
-- Name: seller_notification_settings Sellers manage own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers manage own notification settings" ON public.seller_notification_settings TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin(auth.uid()))) WITH CHECK (((user_id = auth.uid()) OR public.is_super_admin(auth.uid())));


--
-- Name: agent_action_logs Service role can insert action logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert action logs" ON public.agent_action_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: admin_agent_messages Service role can insert admin agent messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert admin agent messages" ON public.admin_agent_messages FOR INSERT TO authenticated WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: email_send_log Service role can insert send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: suppressed_emails Service role can insert suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can insert tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: funnel_webhook_logs Service role can insert webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert webhook logs" ON public.funnel_webhook_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: lead_queue Service role can manage queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage queue" ON public.lead_queue TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_send_state Service role can manage send state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage send state" ON public.email_send_state USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can mark tokens as used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_send_log Service role can read send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: suppressed_emails Service role can read suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can read tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: email_send_log Service role can update send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: ai_quality_evaluations Service role full access on evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on evaluations" ON public.ai_quality_evaluations TO service_role USING (true) WITH CHECK (true);


--
-- Name: ai_prompt_experiments Service role full access on experiments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on experiments" ON public.ai_prompt_experiments TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_handoff_history Service role full access on handoff history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on handoff history" ON public.agent_handoff_history TO service_role USING (true) WITH CHECK (true);


--
-- Name: lead_semantic_memory Service role full access on lead memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on lead memory" ON public.lead_semantic_memory TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_routing_rules Service role full access on routing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on routing rules" ON public.agent_routing_rules TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_specialists Service role full access on specialists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on specialists" ON public.agent_specialists TO service_role USING (true) WITH CHECK (true);


--
-- Name: ai_prompt_variants Service role full access on variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on variants" ON public.ai_prompt_variants TO service_role USING (true) WITH CHECK (true);


--
-- Name: cakto_recovery_dispatches Service role insere disparos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role insere disparos" ON public.cakto_recovery_dispatches FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: agent_activation_logs Service role inserts activation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role inserts activation logs" ON public.agent_activation_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: agent_tool_executions Service role inserts tool executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role inserts tool executions" ON public.agent_tool_executions FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: processed_messages Service role manages processed messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages processed messages" ON public.processed_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: conversation_processing_locks Service role manages processing locks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages processing locks" ON public.conversation_processing_locks TO service_role USING (true) WITH CHECK (true);


--
-- Name: sent_responses Service role manages sent responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages sent responses" ON public.sent_responses TO service_role USING (true) WITH CHECK (true);


--
-- Name: leads Squad members can view squad leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Squad members can view squad leads" ON public.leads FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (squad_id IN ( SELECT squad_members.squad_id
   FROM public.squad_members
  WHERE (squad_members.user_id = auth.uid())))));


--
-- Name: lead_queue Squad members can view their squad queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Squad members can view their squad queue" ON public.lead_queue FOR SELECT USING ((squad_id IN ( SELECT squad_members.squad_id
   FROM public.squad_members
  WHERE (squad_members.user_id = auth.uid()))));


--
-- Name: help_articles Super admin manages help articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages help articles" ON public.help_articles TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: help_categories Super admin manages help categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages help categories" ON public.help_categories TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: platform_releases Super admin manages releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages releases" ON public.platform_releases TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: agent_tool_executions Super admin reads all tool executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads all tool executions" ON public.agent_tool_executions FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: user_roles Super admins can delete all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can delete all user roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: platform_plans Super admins can delete plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can delete plans" ON public.platform_plans FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: user_roles Super admins can insert all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can insert all user roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: platform_plans Super admins can insert plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can insert plans" ON public.platform_plans FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: billing_history Super admins can manage all billing history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all billing history" ON public.billing_history USING (public.is_super_admin(auth.uid()));


--
-- Name: team_invitations Super admins can manage all invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all invitations" ON public.team_invitations TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: organizations Super admins can manage all organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all organizations" ON public.organizations USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: user_permissions Super admins can manage all permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all permissions" ON public.user_permissions TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: subscriptions Super admins can manage all subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all subscriptions" ON public.subscriptions USING (public.is_super_admin(auth.uid()));


--
-- Name: platform_audit_logs Super admins can manage audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage audit logs" ON public.platform_audit_logs USING (public.is_super_admin(auth.uid()));


--
-- Name: platform_email_settings Super admins can manage email settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage email settings" ON public.platform_email_settings USING (public.is_super_admin(auth.uid()));


--
-- Name: platform_settings Super admins can manage platform settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage platform settings" ON public.platform_settings USING (public.is_super_admin(auth.uid()));


--
-- Name: profiles Super admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: user_roles Super admins can update all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update all user roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: platform_plans Super admins can update plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update plans" ON public.platform_plans FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: profiles Super admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_super_admin(auth.uid()));


--
-- Name: user_roles Super admins can view all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all user roles" ON public.user_roles FOR SELECT USING (public.is_super_admin(auth.uid()));


--
-- Name: hotmart_credentials Super admins manage all hotmart credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage all hotmart credentials" ON public.hotmart_credentials TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: hotmart_orders Super admins manage all hotmart orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage all hotmart orders" ON public.hotmart_orders TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: hotmart_product_mapping Super admins manage all hotmart product mapping; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage all hotmart product mapping" ON public.hotmart_product_mapping TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: cakto_credentials Super admins manage platform cakto credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage platform cakto credentials" ON public.cakto_credentials USING (((scope = 'platform'::text) AND public.is_super_admin(auth.uid()))) WITH CHECK (((scope = 'platform'::text) AND public.is_super_admin(auth.uid())));


--
-- Name: cakto_orders Super admins manage platform cakto orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage platform cakto orders" ON public.cakto_orders USING (((scope = 'platform'::text) AND public.is_super_admin(auth.uid()))) WITH CHECK (((scope = 'platform'::text) AND public.is_super_admin(auth.uid())));


--
-- Name: platform_email_templates Super admins manage platform email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage platform email templates" ON public.platform_email_templates TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: sales_leads Super admins manage sales leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins manage sales leads" ON public.sales_leads USING (public.is_super_admin(auth.uid()));


--
-- Name: support_tickets Super admins podem deletar tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins podem deletar tickets" ON public.support_tickets FOR DELETE USING (public.is_super_admin(auth.uid()));


--
-- Name: cakto_orders Super admins view platform cakto orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins view platform cakto orders" ON public.cakto_orders FOR SELECT USING (((scope = 'platform'::text) AND public.is_super_admin(auth.uid())));


--
-- Name: user_badges System can insert badges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert badges" ON public.user_badges FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_badges.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: commissions System can insert commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert commissions" ON public.commissions FOR INSERT WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: notification_logs System can insert notification logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert notification logs" ON public.notification_logs FOR INSERT WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: sankhya_sync_logs System can insert sync logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert sync logs" ON public.sankhya_sync_logs FOR INSERT WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: webhook_logs System can insert webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert webhook logs" ON public.webhook_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: funnel_analytics System can manage analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage analytics" ON public.funnel_analytics TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.capture_funnels cf
  WHERE ((cf.id = funnel_analytics.funnel_id) AND ((cf.organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid()))))));


--
-- Name: sankhya_sync_logs System can update sync logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can update sync logs" ON public.sankhya_sync_logs FOR UPDATE USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: lead_tags Tags visiveis para a organizacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tags visiveis para a organizacao" ON public.lead_tags FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: user_availability Team can view availability in same organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view availability in same organization" ON public.user_availability FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid())));


--
-- Name: support_tickets Tickets editaveis por dono ou super admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tickets editaveis por dono ou super admin" ON public.support_tickets FOR UPDATE USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id))) WITH CHECK ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: support_tickets Tickets visiveis para a organizacao ou super admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tickets visiveis para a organizacao ou super admin" ON public.support_tickets FOR SELECT USING ((public.is_super_admin(auth.uid()) OR public.user_belongs_to_organization(auth.uid(), organization_id)));


--
-- Name: ai_response_feedback Users can create feedback for their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create feedback for their organization" ON public.ai_response_feedback FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_knowledge_sources Users can create knowledge sources for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create knowledge sources for their org" ON public.product_knowledge_sources FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: conversation_notes Users can create notes for conversations they have access to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create notes for conversations they have access to" ON public.conversation_notes FOR INSERT WITH CHECK (((conversation_id IN ( SELECT wc.id
   FROM (public.webchat_conversations wc
     JOIN public.webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))) AND (user_id = auth.uid())));


--
-- Name: calendar_events Users can create own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own events" ON public.calendar_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: quick_replies Users can create quick replies for their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create quick replies for their organization" ON public.quick_replies FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_onboarding_state Users can create their own onboarding state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own onboarding state" ON public.product_onboarding_state FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_transfer_history Users can create transfer history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create transfer history" ON public.lead_transfer_history FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.leads l
     JOIN public.profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_transfer_history.lead_id) AND (p.id = auth.uid())))));


--
-- Name: conversation_transfers Users can create transfers for conversations they have access t; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create transfers for conversations they have access t" ON public.conversation_transfers FOR INSERT WITH CHECK (((conversation_id IN ( SELECT wc.id
   FROM (public.webchat_conversations wc
     JOIN public.webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))) AND (created_by = auth.uid())));


--
-- Name: product_agents Users can delete agents in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete agents in their organization" ON public.product_agents FOR DELETE USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: form_blocks Users can delete blocks in their org forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete blocks in their org forms" ON public.form_blocks FOR DELETE USING ((form_id IN ( SELECT f.id
   FROM (public.forms f
     JOIN public.profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: ai_response_feedback Users can delete feedback from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete feedback from their organization" ON public.ai_response_feedback FOR DELETE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: forms Users can delete forms in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete forms in their organization" ON public.forms FOR DELETE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: calendar_events Users can delete own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own events" ON public.calendar_events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: quick_replies Users can delete quick replies from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete quick replies from their organization" ON public.quick_replies FOR DELETE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: form_templates Users can delete templates in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete templates in their org" ON public.form_templates FOR DELETE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_knowledge_sources Users can delete their org knowledge sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their org knowledge sources" ON public.product_knowledge_sources FOR DELETE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can delete their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: product_onboarding_state Users can delete their own onboarding state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own onboarding state" ON public.product_onboarding_state FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: product_agents Users can insert agents in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert agents in their organization" ON public.product_agents FOR INSERT WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: webchat_assignment_events Users can insert assignment events for their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert assignment events for their org" ON public.webchat_assignment_events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.webchat_conversations c
  WHERE ((c.id = webchat_assignment_events.conversation_id) AND (c.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: form_blocks Users can insert blocks in their org forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert blocks in their org forms" ON public.form_blocks FOR INSERT WITH CHECK ((form_id IN ( SELECT f.id
   FROM (public.forms f
     JOIN public.profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: deals Users can insert deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert deals" ON public.deals FOR INSERT WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: forms Users can insert forms in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert forms in their organization" ON public.forms FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: interactions Users can insert interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert interactions" ON public.interactions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_stage_history Users can insert lead history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert lead history" ON public.lead_stage_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_stage_history.lead_id) AND (l.organization_id = public.get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((l.squad_id IS NOT NULL) AND (l.squad_id IN ( SELECT squad_members.squad_id
           FROM public.squad_members
          WHERE (squad_members.user_id = auth.uid())))))))));


--
-- Name: leads Users can insert leads in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert leads in their org" ON public.leads FOR INSERT TO authenticated WITH CHECK ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: webchat_messages Users can insert messages to their org conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages to their org conversations" ON public.webchat_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.webchat_conversations c
  WHERE ((c.id = webchat_messages.conversation_id) AND ((c.organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid()))))));


--
-- Name: lead_notes Users can insert notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notes" ON public.lead_notes FOR INSERT WITH CHECK ((author_id = auth.uid()));


--
-- Name: ai_outreach_queue Users can insert outreach in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert outreach in their org" ON public.ai_outreach_queue FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: user_status Users can insert own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own status" ON public.user_status FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: form_templates Users can insert templates in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert templates in their org" ON public.form_templates FOR INSERT WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: user_availability Users can manage own availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own availability" ON public.user_availability TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: google_calendar_connections Users can manage own connection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own connection" ON public.google_calendar_connections USING ((auth.uid() = user_id));


--
-- Name: booking_event_types Users can manage own event types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own event types" ON public.booking_event_types TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: availability_overrides Users can manage own overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own overrides" ON public.availability_overrides TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: scheduled_messages Users can manage own scheduled messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own scheduled messages" ON public.scheduled_messages USING ((created_by = auth.uid()));


--
-- Name: webhook_sample_requests Users can manage samples for webhooks in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage samples for webhooks in their organization" ON public.webhook_sample_requests USING ((EXISTS ( SELECT 1
   FROM public.webhooks w
  WHERE ((w.id = webhook_sample_requests.webhook_id) AND (w.organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: tasks Users can manage their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own tasks" ON public.tasks TO authenticated USING ((user_id = auth.uid()));


--
-- Name: product_agents Users can update agents in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update agents in their organization" ON public.product_agents FOR UPDATE USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: form_blocks Users can update blocks in their org forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update blocks in their org forms" ON public.form_blocks FOR UPDATE USING ((form_id IN ( SELECT f.id
   FROM (public.forms f
     JOIN public.profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: ai_response_feedback Users can update feedback from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update feedback from their organization" ON public.ai_response_feedback FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: forms Users can update forms in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update forms in their organization" ON public.forms FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: leads Users can update leads in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update leads in their org" ON public.leads FOR UPDATE TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (assigned_to = auth.uid()) OR ((squad_id IS NOT NULL) AND (squad_id IN ( SELECT squad_members.squad_id
   FROM public.squad_members
  WHERE (squad_members.user_id = auth.uid())))))));


--
-- Name: ai_outreach_queue Users can update outreach in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update outreach in their org" ON public.ai_outreach_queue FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: calendar_events Users can update own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own events" ON public.calendar_events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_status Users can update own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own status" ON public.user_status FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: quick_replies Users can update quick replies from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update quick replies from their organization" ON public.quick_replies FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: form_templates Users can update templates in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update templates in their org" ON public.form_templates FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can update their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: webchat_conversations Users can update their org conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their org conversations" ON public.webchat_conversations FOR UPDATE USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: product_knowledge_sources Users can update their org knowledge sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their org knowledge sources" ON public.product_knowledge_sources FOR UPDATE USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_onboarding_state Users can update their own onboarding state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own onboarding state" ON public.product_onboarding_state FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: product_ctas Users can view CTAs from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view CTAs from their organization" ON public.product_ctas FOR SELECT USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: agent_action_logs Users can view action logs from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view action logs from their organization" ON public.agent_action_logs FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_agents Users can view agents in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agents in their organization" ON public.product_agents FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: funnel_analytics Users can view analytics of their funnels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view analytics of their funnels" ON public.funnel_analytics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.capture_funnels cf
  WHERE ((cf.id = funnel_analytics.funnel_id) AND ((cf.organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid()))))));


--
-- Name: webchat_assignment_events Users can view assignment events from their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assignment events from their org" ON public.webchat_assignment_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.webchat_conversations c
  WHERE ((c.id = webchat_assignment_events.conversation_id) AND (c.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: ai_audits Users can view audits of their interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view audits of their interactions" ON public.ai_audits FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.interactions i
     JOIN public.leads l ON ((l.id = i.lead_id)))
  WHERE ((i.id = ai_audits.interaction_id) AND (l.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: user_badges Users can view badges in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view badges in their org" ON public.user_badges FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_badges.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: form_blocks Users can view blocks from their org forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view blocks from their org forms" ON public.form_blocks FOR SELECT USING ((form_id IN ( SELECT f.id
   FROM (public.forms f
     JOIN public.profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: cadence_templates Users can view cadence templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view cadence templates" ON public.cadence_templates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = cadence_templates.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: commission_rules Users can view commission rules of their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view commission rules of their org" ON public.commission_rules FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: custom_fields Users can view custom fields of their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view custom fields of their org" ON public.custom_fields FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: deals Users can view deals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view deals in their org" ON public.deals FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND ((seller_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: distribution_config Users can view distribution config in org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view distribution config in org" ON public.distribution_config FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: ai_response_feedback Users can view feedback from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view feedback from their organization" ON public.ai_response_feedback FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: chat_flows Users can view flows from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view flows from their organization" ON public.chat_flows FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: forms Users can view forms from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view forms from their organization" ON public.forms FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: capture_funnels Users can view funnels of their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view funnels of their organization" ON public.capture_funnels FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid())));


--
-- Name: sales_goals Users can view goals in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view goals in their org" ON public.sales_goals FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: interactions Users can view interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view interactions" ON public.interactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = interactions.lead_id) AND (l.organization_id = public.get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: ai_knowledge_base Users can view knowledge base of their org products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view knowledge base of their org products" ON public.ai_knowledge_base FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = ai_knowledge_base.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: lead_stage_history Users can view lead history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view lead history" ON public.lead_stage_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_stage_history.lead_id) AND (l.organization_id = public.get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: leads Users can view leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view leads" ON public.leads FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND ((assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: webhook_logs Users can view logs for webhooks in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view logs for webhooks in their organization" ON public.webhook_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.webhooks w
  WHERE ((w.id = webhook_logs.webhook_id) AND (w.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: materials Users can view materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view materials" ON public.materials FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = materials.product_id) AND (p.organization_id = public.get_user_organization(auth.uid())))))));


--
-- Name: webchat_messages Users can view messages from their org conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages from their org conversations" ON public.webchat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.webchat_conversations c
  WHERE ((c.id = webchat_messages.conversation_id) AND (c.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: conversation_notes Users can view notes for conversations they have access to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notes for conversations they have access to" ON public.conversation_notes FOR SELECT USING ((conversation_id IN ( SELECT wc.id
   FROM (public.webchat_conversations wc
     JOIN public.webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: lead_notes Users can view notes from same org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notes from same org" ON public.lead_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.leads l
     JOIN public.profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_notes.lead_id) AND (p.id = auth.uid())))));


--
-- Name: objections Users can view objections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view objections" ON public.objections FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = objections.product_id) AND (p.organization_id = public.get_user_organization(auth.uid())))))));


--
-- Name: sankhya_mappings Users can view org sankhya mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view org sankhya mappings" ON public.sankhya_mappings FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: sankhya_sync_logs Users can view org sync logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view org sync logs" ON public.sankhya_sync_logs FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: ai_outreach_queue Users can view outreach in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view outreach in their org" ON public.ai_outreach_queue FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: calendar_events Users can view own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own events" ON public.calendar_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_permissions Users can view own permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: products Users can view products in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view products in their org" ON public.products FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: profiles Users can view profiles in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view profiles in their org" ON public.profiles FOR SELECT TO authenticated USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: form_templates Users can view public and org templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view public and org templates" ON public.form_templates FOR SELECT USING (((is_public = true) OR (is_system = true) OR (organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--
-- Name: quick_replies Users can view quick replies from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view quick replies from their organization" ON public.quick_replies FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: user_roles Users can view roles in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view roles in their org" ON public.user_roles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_roles.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: webhook_sample_requests Users can view samples for webhooks in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view samples for webhooks in their organization" ON public.webhook_sample_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.webhooks w
  WHERE ((w.id = webhook_sample_requests.webhook_id) AND (w.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: squad_members Users can view squad members in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view squad members in their org" ON public.squad_members FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sales_squads s
  WHERE ((s.id = squad_members.squad_id) AND (s.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: sales_squads Users can view squads in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view squads in their org" ON public.sales_squads FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: stage_values Users can view stage values of their org products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view stage values of their org products" ON public.stage_values FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = stage_values.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: pipeline_stages Users can view stages of their org products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view stages of their org products" ON public.pipeline_stages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = pipeline_stages.product_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))));


--
-- Name: user_status Users can view statuses in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view statuses in their org" ON public.user_status FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: form_submissions Users can view submissions from their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view submissions from their org" ON public.form_submissions FOR SELECT USING ((form_id IN ( SELECT f.id
   FROM (public.forms f
     JOIN public.profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: commissions Users can view their commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their commissions" ON public.commissions FOR SELECT USING (((organization_id = public.get_user_organization(auth.uid())) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: ai_insights Users can view their insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their insights" ON public.ai_insights FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (organization_id = public.get_user_organization(auth.uid()))));


--
-- Name: notification_logs Users can view their notification logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their notification logs" ON public.notification_logs FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: notifications Users can view their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: webchat_agent_configs Users can view their org agent configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org agent configs" ON public.webchat_agent_configs FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: auto_notification_settings Users can view their org auto notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org auto notification settings" ON public.auto_notification_settings FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: mass_email_campaigns Users can view their org campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org campaigns" ON public.mass_email_campaigns FOR SELECT USING (public.user_belongs_to_organization(organization_id, auth.uid()));


--
-- Name: webchat_conversations Users can view their org conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org conversations" ON public.webchat_conversations FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: email_templates Users can view their org email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org email templates" ON public.email_templates FOR SELECT USING (public.user_belongs_to_organization(organization_id, auth.uid()));


--
-- Name: integration_settings Users can view their org integration settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org integration settings" ON public.integration_settings FOR SELECT USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: product_knowledge_sources Users can view their org knowledge sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org knowledge sources" ON public.product_knowledge_sources FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: facebook_lead_logs Users can view their org logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org logs" ON public.facebook_lead_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.facebook_lead_integrations fi
  WHERE ((fi.id = facebook_lead_logs.integration_id) AND ((fi.organization_id = public.get_user_organization(auth.uid())) OR public.is_super_admin(auth.uid()))))));


--
-- Name: mass_email_recipients Users can view their org recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org recipients" ON public.mass_email_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.mass_email_campaigns c
  WHERE ((c.id = mass_email_recipients.campaign_id) AND public.user_belongs_to_organization(c.organization_id, auth.uid())))));


--
-- Name: webchat_widgets Users can view their org webchat widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their org webchat widgets" ON public.webchat_widgets FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: organizations Users can view their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT TO authenticated USING ((id = public.get_user_organization(auth.uid())));


--
-- Name: product_onboarding_state Users can view their own onboarding state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own onboarding state" ON public.product_onboarding_state FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: tasks Users can view their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tasks" ON public.tasks FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: agent_training_materials Users can view training materials in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view training materials in their org" ON public.agent_training_materials FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: product_training_videos Users can view training videos from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view training videos from their organization" ON public.product_training_videos FOR SELECT USING ((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: lead_transfer_history Users can view transfer history for leads in their org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view transfer history for leads in their org" ON public.lead_transfer_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.leads l
     JOIN public.profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_transfer_history.lead_id) AND (p.id = auth.uid())))));


--
-- Name: conversation_transfers Users can view transfers for conversations they have access to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view transfers for conversations they have access to" ON public.conversation_transfers FOR SELECT USING ((conversation_id IN ( SELECT wc.id
   FROM (public.webchat_conversations wc
     JOIN public.webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: webhooks Users can view webhooks in their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view webhooks in their organization" ON public.webhooks FOR SELECT USING ((organization_id = public.get_user_organization(auth.uid())));


--
-- Name: help_article_feedback Users create their own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users create their own feedback" ON public.help_article_feedback FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_notification_settings Users delete their notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their notification settings" ON public.user_notification_settings FOR DELETE USING (((user_id = auth.uid()) OR public.is_super_admin(auth.uid())));


--
-- Name: help_article_feedback Users delete their own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their own feedback" ON public.help_article_feedback FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: platform_release_reads Users delete their own release reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their own release reads" ON public.platform_release_reads FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_notification_settings Users insert their notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their notification settings" ON public.user_notification_settings FOR INSERT WITH CHECK (((user_id = auth.uid()) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid())))));


--
-- Name: platform_release_reads Users mark releases as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users mark releases as read" ON public.platform_release_reads FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_notification_settings Users update their notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their notification settings" ON public.user_notification_settings FOR UPDATE USING (((user_id = auth.uid()) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid())))));


--
-- Name: help_article_feedback Users update their own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their own feedback" ON public.help_article_feedback FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: help_article_feedback Users view all feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view all feedback" ON public.help_article_feedback FOR SELECT TO authenticated USING (true);


--
-- Name: user_notification_settings Users view their notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view their notification settings" ON public.user_notification_settings FOR SELECT USING (((user_id = auth.uid()) OR ((organization_id = public.get_user_organization(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.is_super_admin(auth.uid())))));


--
-- Name: platform_release_reads Users view their own release reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view their own release reads" ON public.platform_release_reads FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: leads Users with view_all_kanban_cards can view all org leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with view_all_kanban_cards can view all org leads" ON public.leads FOR SELECT TO authenticated USING (((organization_id = public.get_user_organization(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.user_permissions up
  WHERE ((up.user_id = auth.uid()) AND (up.view_all_kanban_cards = true))))));


--
-- Name: user_product_assignments View assignments scoped to org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View assignments scoped to org" ON public.user_product_assignments FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin(auth.uid()) OR ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_product_assignments.user_id) AND (p.organization_id = public.get_user_organization(auth.uid()))))))));


--
-- Name: sector_members View sector members in same org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View sector members in same org" ON public.sector_members FOR SELECT USING ((public.user_in_sector_organization(auth.uid(), sector_id) OR public.is_super_admin(auth.uid())));


--
-- Name: admin_agent_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_agent_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_action_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_activation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_activation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_handoff_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_handoff_history ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_post_sale_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_post_sale_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_routing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_routing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_safety_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_safety_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_specialists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_specialists ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tool_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tool_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_training_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_training_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_base; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_outreach_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_outreach_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_prompt_experiments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_prompt_experiments ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_prompt_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_prompt_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_quality_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_quality_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_response_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_response_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_router_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_router_failures ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: availability_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_event_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_event_types ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_scheduled_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_scheduled_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: business_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: business_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: cadence_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadence_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: cadence_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadence_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: cadence_enrollments cadence_enrollments_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadence_enrollments_org_access ON public.cadence_enrollments TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: cadence_step_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadence_step_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: cadence_step_runs cadence_step_runs_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadence_step_runs_org_access ON public.cadence_step_runs TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: cadence_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadence_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: cadence_steps cadence_steps_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadence_steps_org_access ON public.cadence_steps TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.cadences c
  WHERE ((c.id = cadence_steps.cadence_id) AND (public.user_belongs_to_organization(auth.uid(), c.organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cadences c
  WHERE ((c.id = cadence_steps.cadence_id) AND (public.user_belongs_to_organization(auth.uid(), c.organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));


--
-- Name: cadence_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: cadences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadences ENABLE ROW LEVEL SECURITY;

--
-- Name: cadences cadences_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cadences_org_access ON public.cadences TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: cakto_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cakto_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: cakto_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cakto_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: cakto_recovery_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cakto_recovery_config ENABLE ROW LEVEL SECURITY;

--
-- Name: cakto_recovery_dispatches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cakto_recovery_dispatches ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_contexts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_contexts ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_contexts campaign_contexts_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_contexts_org_access ON public.campaign_contexts TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: campaign_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_targets campaign_targets_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_targets_org_access ON public.campaign_targets TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_org_access ON public.campaigns TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: capture_funnels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capture_funnels ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_processing_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_processing_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: distribution_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.distribution_config ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: evolution_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_lead_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facebook_lead_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_lead_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facebook_lead_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: form_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: form_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

--
-- Name: funnel_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funnel_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: funnel_webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funnel_webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: help_article_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: help_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: help_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: hotmart_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotmart_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: hotmart_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotmart_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: hotmart_product_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotmart_product_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_semantic_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_semantic_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_stage_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_transfer_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_transfer_history ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: mass_email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mass_email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: mass_email_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mass_email_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: objections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_scan_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_scan_items ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_scan_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_scan_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_scans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_scans ENABLE ROW LEVEL SECURITY;

--
-- Name: orchestration_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchestration_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_orchestrator_config org admins can delete orchestrator config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org admins can delete orchestrator config" ON public.organization_orchestrator_config FOR DELETE TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: organization_orchestrator_config org admins can insert orchestrator config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org admins can insert orchestrator config" ON public.organization_orchestrator_config FOR INSERT TO authenticated WITH CHECK ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: organization_orchestrator_config org admins can update orchestrator config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org admins can update orchestrator config" ON public.organization_orchestrator_config FOR UPDATE TO authenticated USING ((public.user_belongs_to_organization(auth.uid(), organization_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))));


--
-- Name: orchestration_logs org members can view orchestration logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members can view orchestration logs" ON public.orchestration_logs FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: organization_orchestrator_config org members can view orchestrator config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members can view orchestrator config" ON public.organization_orchestrator_config FOR SELECT TO authenticated USING (public.user_belongs_to_organization(auth.uid(), organization_id));


--
-- Name: org_ai_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ai_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: org_ai_routing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_ai_routing ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_orchestrator_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_orchestrator_config ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_email_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_email_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_release_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_release_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_releases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_releases ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: post_sale_event_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_sale_event_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: post_sale_event_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_sale_event_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: post_sale_scheduled_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_sale_scheduled_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: post_sale_scheduled_runs post_sale_scheduled_runs_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_sale_scheduled_runs_org_read ON public.post_sale_scheduled_runs FOR SELECT TO authenticated USING (((organization_id IN ( SELECT profiles.organization_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: processed_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: product_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_catalog_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_catalog_items ENABLE ROW LEVEL SECURITY;

--
-- Name: product_ctas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_ctas ENABLE ROW LEVEL SECURITY;

--
-- Name: product_knowledge_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_knowledge_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: product_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: product_onboarding_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_onboarding_state ENABLE ROW LEVEL SECURITY;

--
-- Name: product_suites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_suites ENABLE ROW LEVEL SECURITY;

--
-- Name: product_training_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_training_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: quiz_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quiz_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_squads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_squads ENABLE ROW LEVEL SECURITY;

--
-- Name: sankhya_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sankhya_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: sankhya_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sankhya_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: sector_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;

--
-- Name: sectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: sent_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sent_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: squad_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_values ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: suppressed_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: tag_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tag_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: user_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_product_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_product_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_agent_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_agent_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_assignment_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_assignment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_widgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_sample_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_sample_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



-- ===== migrations_erp (delta para paridade 167) =====
-- >>> 20260609_erp_oficina.sql
-- ============================================================
-- ERP de Oficina — reintegração ao schema sales-spark
-- Tabelas: clientes, veiculos, ordens_servico, orcamentos, lancamentos
-- Todas org-scoped (organization_id) + RLS no padrão do schema:
--   organization_id = public.get_user_organization(auth.uid())
-- Campos derivados das telas antigas (338c9e5^) + entities base44.
-- ============================================================

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS public.clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  telefone        text,
  email           text,
  cpf_cnpj        text,
  endereco        text,
  status          text NOT NULL DEFAULT 'ativo',
  tags            text[] DEFAULT '{}'::text[],
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_org ON public.clientes(organization_id);

-- ---------- VEICULOS ----------
CREATE TABLE IF NOT EXISTS public.veiculos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome    text,
  marca           text,
  modelo          text,
  ano             integer,
  placa           text,
  cor             text,
  quilometragem   integer,
  ultima_revisao  date,
  proxima_revisao date,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_veiculos_org ON public.veiculos(organization_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON public.veiculos(cliente_id);

-- ---------- ORDENS DE SERVICO ----------
CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero           text,
  orcamento_id     uuid,
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     text,
  veiculo_id       uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  veiculo_desc     text,
  data_abertura    date DEFAULT CURRENT_DATE,
  data_prevista    date,
  data_conclusao   date,
  status           text NOT NULL DEFAULT 'aberta',
  tecnico          text,
  tecnico_id       uuid,
  prioridade       text NOT NULL DEFAULT 'normal',
  total            numeric(12,2) DEFAULT 0,
  itens            jsonb DEFAULT '[]'::jsonb,
  observacoes      text,
  pagamento_status text NOT NULL DEFAULT 'pendente',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ordens_org ON public.ordens_servico(organization_id);
CREATE INDEX IF NOT EXISTS idx_ordens_cliente ON public.ordens_servico(cliente_id);

-- ---------- ORCAMENTOS ----------
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero           text,
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     text,
  veiculo_id       uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  veiculo_desc     text,
  data             date DEFAULT CURRENT_DATE,
  validade         date,
  status           text NOT NULL DEFAULT 'pendente',
  total            numeric(12,2) DEFAULT 0,
  itens            jsonb DEFAULT '[]'::jsonb,
  observacoes      text,
  convertido_em_os boolean NOT NULL DEFAULT false,
  os_id            uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_org ON public.orcamentos(organization_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON public.orcamentos(cliente_id);

-- ---------- LANCAMENTOS (financeiro) ----------
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  descricao       text NOT NULL,
  tipo            text NOT NULL DEFAULT 'entrada',
  valor           numeric(12,2) NOT NULL DEFAULT 0,
  data            date DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'confirmado',
  forma           text,
  categoria       text,
  os_id           uuid,
  orcamento_id    uuid,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_org ON public.lancamentos(organization_id);

-- ============================================================
-- RLS — org-scoped, padrao do schema sales-spark
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','veiculos','ordens_servico','orcamentos','lancamentos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can view %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can view %1$s" ON public.%1$I FOR SELECT USING (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can insert %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can update %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can update %1$s" ON public.%1$I FOR UPDATE USING (organization_id = public.get_user_organization(auth.uid())) WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can delete %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can delete %1$s" ON public.%1$I FOR DELETE USING (organization_id = public.get_user_organization(auth.uid()));', t);
  END LOOP;
END $$;

-- >>> 20260610145231_onboarding_modules.sql
-- ============================================================
-- Onboarding / Módulos — migração ADITIVA (idempotente)
-- NÃO aplicado automaticamente — aplicar via `supabase db push`/CLI
-- após revisão.
--
-- Escopo:
--   1. platform_plans.modules      jsonb  -> módulos liberados pelo PLANO
--   2. organizations.enabled_modules jsonb -> módulos ativados pela ORG no onboarding
--   3. servico_catalogo (nova)             -> catálogo de serviços da oficina (org-scoped)
--   4. seed seguro de modules p/ planos existentes (evita travar quem já tem plano)
--
-- Tudo ADITIVO: sem DROP de coluna/tabela, sem destrutivo. Re-rodável.
-- Padrão RLS copiado de 20260609_erp_oficina.sql:
--   organization_id = public.get_user_organization(auth.uid())
-- ============================================================

-- ---------- 1. platform_plans.modules ----------
-- Módulos que o plano LIBERA. Default '[]' = nada liberado explicitamente
-- (o seed abaixo preenche os planos atuais p/ não quebrar nada).
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------- 2. organizations.enabled_modules ----------
-- Módulos que a ORG ativou no onboarding/wizard. Subconjunto dos liberados
-- pelo plano. Default '[]' = onboarding ainda não escolheu.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------- 3. SERVICO_CATALOGO (catálogo de serviços da oficina) ----------
CREATE TABLE IF NOT EXISTS public.servico_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  preco_base      numeric,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servico_catalogo_org ON public.servico_catalogo(organization_id);

-- RLS org-scoped (mesmo padrão do schema sales-spark / ERP oficina)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['servico_catalogo']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can view %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can view %1$s" ON public.%1$I FOR SELECT USING (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can insert %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can update %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can update %1$s" ON public.%1$I FOR UPDATE USING (organization_id = public.get_user_organization(auth.uid())) WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can delete %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can delete %1$s" ON public.%1$I FOR DELETE USING (organization_id = public.get_user_organization(auth.uid()));', t);
  END LOOP;
END $$;

-- GRANTs explícitos p/ a nova tabela (o schema sales-spark concede no nível
-- de schema, mas garantimos aqui de forma idempotente p/ os roles do Supabase).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servico_catalogo TO authenticated;
GRANT ALL ON public.servico_catalogo TO service_role;

-- ---------- 4. SEED SEGURO ----------
-- Preenche os planos ATUAIS com o conjunto completo de módulos da oficina,
-- p/ que ninguém com plano existente fique sem acesso por causa do default '[]'.
-- Só toca planos vazios/null — não sobrescreve planos já configurados.
UPDATE public.platform_plans
SET modules = '["erp_oficina","crm_vendas","atendimento","administracao"]'::jsonb
WHERE (modules = '[]'::jsonb OR modules IS NULL);

