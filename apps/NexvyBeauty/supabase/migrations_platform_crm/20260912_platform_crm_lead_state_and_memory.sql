-- ============================================================================
-- PRD-03 — Canonical lead state + memory tables
-- Created: 2026-09-12 | Apply only after PRD-03 production approval.
--
-- Tabelas:
--   platform_crm_lead_state   — 1 linha/lead, CAS via version, estado derivado
--   platform_crm_lead_memory  — append-only, provenance + idempotency, vector opt
--
-- Convenções da casa (ver 20260712_platform_crm_lead_extractions.sql):
--   • product-scoped puro: FK product_id → platform_crm_products.
--   • RLS super_admin_only (has_role) + GRANT service_role.
--   • Trigger updated_at → public.platform_crm_set_updated_at().
--   • Idempotente: IF NOT EXISTS, OR REPLACE, DROP IF EXISTS.
--   • Sem IVFFlat ainda: volume mínimo não atingido.
--   • SECURITY DEFINER RPCs com SET search_path = 'public'.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) platform_crm_lead_state
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  version         integer NOT NULL DEFAULT 0,
  summary         text,
  derived_stage   text,
  next_action     text,
  facts           jsonb NOT NULL DEFAULT '{}'::jsonb,
  objections      jsonb NOT NULL DEFAULT '[]'::jsonb,
  commitments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  consents        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(facts) = 'object'),
  CHECK (jsonb_typeof(objections) = 'array'),
  CHECK (jsonb_typeof(commitments) = 'array'),
  CHECK (jsonb_typeof(consents) = 'object'),
  CONSTRAINT platform_crm_lead_state_lead_product_unique UNIQUE (lead_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_state_product_id
  ON public.platform_crm_lead_state (product_id);

-- Torna find/create por telefone atômico. Preflight live: 0 grupos duplicados
-- exatos em 2026-09-12.
DO $prd03_lead_phone_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_crm_leads
    WHERE product_id IS NOT NULL AND phone IS NOT NULL
    GROUP BY product_id, phone
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'PRD-03 blocker: duplicate (product_id, phone) in platform_crm_leads';
  END IF;
END;
$prd03_lead_phone_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_platform_crm_leads_product_phone
  ON public.platform_crm_leads (product_id, phone)
  WHERE product_id IS NOT NULL AND phone IS NOT NULL;

DROP TRIGGER IF EXISTS trg_platform_crm_lead_state_updated_at
  ON public.platform_crm_lead_state;
CREATE TRIGGER trg_platform_crm_lead_state_updated_at
  BEFORE UPDATE ON public.platform_crm_lead_state
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

ALTER TABLE public.platform_crm_lead_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_lead_state_super_admin_only
  ON public.platform_crm_lead_state;
CREATE POLICY platform_crm_lead_state_super_admin_only
  ON public.platform_crm_lead_state
  FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

REVOKE SELECT ON public.platform_crm_lead_state FROM authenticated;
GRANT ALL ON public.platform_crm_lead_state TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) platform_crm_lead_memory
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_memory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  source_message_id   uuid
    REFERENCES public.platform_crm_messages(id) ON DELETE SET NULL,
  conversation_id     uuid
    REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  source_type         text NOT NULL DEFAULT 'message'
    CHECK (source_type IN ('message', 'journey_event', 'manual', 'ai', 'webhook', 'backfill')),
  memory_type         text NOT NULL DEFAULT 'fact'
    CHECK (memory_type IN ('fact', 'summary', 'commitment', 'objection', 'consent', 'context', 'system')),
  content             text NOT NULL CHECK (length(btrim(content)) > 0),
  confidence          numeric(4,3) NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  valid_until         timestamptz,
  superseded_by       uuid REFERENCES public.platform_crm_lead_memory(id),
  is_active           boolean NOT NULL DEFAULT true,
  -- vector(1536): pgvector 0.8.0 já ativo; sem IVFFlat até volume mínimo
  embedding           vector(1536),
  idempotency_key     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_memory_lead_product
  ON public.platform_crm_lead_memory (lead_id, product_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_memory_active
  ON public.platform_crm_lead_memory (lead_id, product_id, created_at DESC)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_memory_conversation
  ON public.platform_crm_lead_memory (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_platform_crm_lead_memory_idempotency
  ON public.platform_crm_lead_memory (lead_id, product_id, idempotency_key);

-- Uma mensagem só origina uma memória ativa por conversa.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_platform_crm_lead_memory_qr_message
  ON public.platform_crm_lead_memory (conversation_id, source_message_id)
  WHERE source_type = 'message'
    AND conversation_id IS NOT NULL
    AND source_message_id IS NOT NULL;

-- Elimina a corrida opening + first inbound na origem. Preflight live: 0 grupos
-- duplicados em 2026-09-12.
DO $prd03_qr_conversation_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_crm_conversations
    WHERE wa_qr_instance_id IS NOT NULL
      AND channel IN ('whatsapp_qr', 'whatsapp_evolution')
    GROUP BY visitor_id, channel, wa_qr_instance_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'PRD-03 blocker: duplicate QR conversation identity';
  END IF;
END;
$prd03_qr_conversation_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_platform_crm_qr_conversation_identity
  ON public.platform_crm_conversations (visitor_id, channel, wa_qr_instance_id)
  WHERE wa_qr_instance_id IS NOT NULL
    AND channel IN ('whatsapp_qr', 'whatsapp_evolution');

ALTER TABLE public.platform_crm_lead_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_lead_memory_super_admin_only
  ON public.platform_crm_lead_memory;
CREATE POLICY platform_crm_lead_memory_super_admin_only
  ON public.platform_crm_lead_memory
  FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

REVOKE SELECT ON public.platform_crm_lead_memory FROM authenticated;
GRANT ALL ON public.platform_crm_lead_memory TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) RPCs SECURITY DEFINER
-- ════════════════════════════════════════════════════════════════════════════

-- 3a) CAS patch atomico
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
BEGIN
  IF jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_patch');
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

  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'conflict', true,
        'current_version', 0, 'expected_version', p_expected_version
      );
    END IF;
    INSERT INTO public.platform_crm_lead_state
      (lead_id, product_id, version, summary, derived_stage, next_action,
       facts, objections, commitments, consents)
    VALUES
      (p_lead_id, p_product_id, 1,
       p_patch->>'summary', p_patch->>'derived_stage', p_patch->>'next_action',
       COALESCE(p_patch->'facts', '{}'::jsonb),
       COALESCE(p_patch->'objections', '[]'::jsonb),
       COALESCE(p_patch->'commitments', '[]'::jsonb),
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
    RETURN jsonb_build_object(
      'ok', false, 'conflict', true,
      'current_version', v_current, 'expected_version', p_expected_version
    );
  END IF;

  v_new := v_current + 1;
  UPDATE public.platform_crm_lead_state SET
    version       = v_new,
    summary       = CASE WHEN p_patch ? 'summary'       THEN p_patch->>'summary'       ELSE summary       END,
    derived_stage = CASE WHEN p_patch ? 'derived_stage' THEN p_patch->>'derived_stage' ELSE derived_stage END,
    next_action   = CASE WHEN p_patch ? 'next_action'   THEN p_patch->>'next_action'   ELSE next_action   END,
    facts         = CASE WHEN p_patch ? 'facts'         THEN facts || COALESCE(p_patch->'facts', '{}'::jsonb) ELSE facts END,
    objections    = CASE WHEN p_patch ? 'objections'    THEN COALESCE(p_patch->'objections',  '[]'::jsonb) ELSE objections  END,
    commitments   = CASE WHEN p_patch ? 'commitments'   THEN COALESCE(p_patch->'commitments', '[]'::jsonb) ELSE commitments END,
    consents      = CASE WHEN p_patch ? 'consents'      THEN consents || COALESCE(p_patch->'consents', '{}'::jsonb) ELSE consents END,
    updated_at    = now()
  WHERE lead_id = p_lead_id AND product_id = p_product_id
    AND version = p_expected_version
  RETURNING version INTO v_new;

  IF v_new IS NULL THEN
    SELECT version INTO v_current
    FROM public.platform_crm_lead_state
    WHERE lead_id = p_lead_id AND product_id = p_product_id;
    RETURN jsonb_build_object(
      'ok', false, 'conflict', true,
      'current_version', v_current, 'expected_version', p_expected_version
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'version', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_lead_state_cas_patch(uuid, uuid, integer, jsonb)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_lead_state_cas_patch(uuid, uuid, integer, jsonb)
  TO service_role;

-- 3b) Memory append / supersede
CREATE OR REPLACE FUNCTION public.platform_crm_lead_memory_append(
  p_lead_id           uuid,
  p_product_id        uuid,
  p_idempotency_key   text,
  p_source_message_id uuid,
  p_conversation_id   uuid,
  p_source_type       text,
  p_memory_type       text,
  p_content           text,
  p_confidence        numeric,
  p_valid_until       timestamptz  DEFAULT NULL,
  p_supersede_ids     uuid[]       DEFAULT NULL,
  p_embedding         vector(1536) DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id  uuid;
  v_new boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_leads
    WHERE id = p_lead_id AND product_id = p_product_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_product_mismatch');
  END IF;
  IF length(btrim(COALESCE(p_idempotency_key, ''))) = 0
     OR length(btrim(COALESCE(p_content, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_memory');
  END IF;

  INSERT INTO public.platform_crm_lead_memory
    (lead_id, product_id, idempotency_key,
     source_message_id, conversation_id, source_type,
     memory_type, content, confidence, valid_until, embedding)
  VALUES
    (p_lead_id, p_product_id, p_idempotency_key,
     p_source_message_id, p_conversation_id, p_source_type,
     p_memory_type, p_content, p_confidence, p_valid_until, p_embedding)
  ON CONFLICT (lead_id, product_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    v_new := true;

    IF p_supersede_ids IS NOT NULL AND array_length(p_supersede_ids, 1) > 0 THEN
      UPDATE public.platform_crm_lead_memory
      SET is_active = false, superseded_by = v_id, valid_until = now()
      WHERE id = ANY(p_supersede_ids)
        AND lead_id = p_lead_id AND product_id = p_product_id
        AND is_active = true;
    END IF;
  ELSE
    SELECT id INTO v_id
    FROM public.platform_crm_lead_memory
    WHERE lead_id = p_lead_id AND product_id = p_product_id
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'created', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_lead_memory_append(
  uuid, uuid, text, uuid, uuid, text, text, text, numeric, timestamptz, uuid[], vector
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_lead_memory_append(
  uuid, uuid, text, uuid, uuid, text, text, text, numeric, timestamptz, uuid[], vector
) TO service_role;

-- 3c) Context read (estado + memórias ativas)
CREATE OR REPLACE FUNCTION public.platform_crm_lead_context_read(
  p_lead_id    uuid,
  p_product_id uuid,
  p_limit      integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state    jsonb;
  v_memories jsonb;
BEGIN
  SELECT to_jsonb(s) INTO v_state
  FROM public.platform_crm_lead_state s
  WHERE lead_id = p_lead_id AND product_id = p_product_id;

  SELECT jsonb_agg(m ORDER BY m.created_at DESC) INTO v_memories
  FROM (
    SELECT id, lead_id, product_id, memory_type, content, confidence,
           source_type, conversation_id, source_message_id, is_active, created_at
    FROM public.platform_crm_lead_memory
    WHERE lead_id = p_lead_id AND product_id = p_product_id AND is_active = true
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ) m;

  RETURN jsonb_build_object(
    'state',    COALESCE(v_state, 'null'::jsonb),
    'memories', COALESCE(v_memories, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_lead_context_read(uuid, uuid, integer)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_lead_context_read(uuid, uuid, integer)
  TO service_role;

-- 3d) Backfill idempotente (chave determinística igual ao TS makeIdempotencyKey)
CREATE OR REPLACE FUNCTION public.platform_crm_lead_memory_backfill(
  p_lead_id    uuid,
  p_product_id uuid,
  p_limit      integer DEFAULT 500,
  p_after_seq  bigint DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_crm_leads
    WHERE id = p_lead_id AND product_id = p_product_id
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.platform_crm_lead_memory (
    lead_id, product_id, source_message_id, conversation_id,
    source_type, memory_type, content, confidence, idempotency_key
  )
  SELECT
    p_lead_id,
    p_product_id,
    m.id,
    m.conversation_id,
    'backfill',
    'context',
    m.content,
    0.7,
    'msg:' || m.conversation_id::text || ':' || m.id::text
  FROM public.platform_crm_messages m
  JOIN public.platform_crm_conversations c ON c.id = m.conversation_id
  WHERE c.lead_id = p_lead_id
    AND c.product_id = p_product_id
    AND m.direction = 'inbound'
    AND m.sender_type = 'visitor'
    AND m.is_deleted = false
    AND length(btrim(COALESCE(m.content, ''))) > 0
    AND COALESCE(m.seq, 0) > p_after_seq
  ORDER BY m.seq ASC NULLS LAST, m.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 5000)
  ON CONFLICT (lead_id, product_id, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_lead_memory_backfill(uuid, uuid, integer, bigint)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_lead_memory_backfill(uuid, uuid, integer, bigint)
  TO service_role;

-- 3e) Backfill das conversas QR existentes sem disparar mensagem.
CREATE OR REPLACE FUNCTION public.platform_crm_backfill_qr_lead_bindings(
  p_product_id      uuid,
  p_conversation_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r             record;
  v_phone       text;
  v_name        text;
  v_lead_id     uuid;
  v_stage_id    uuid;
  v_stage_bound uuid;
  v_bound       integer := 0;
  v_skipped     integer := 0;
BEGIN
  SELECT id INTO v_stage_id
  FROM public.platform_crm_pipeline_stages
  WHERE COALESCE(is_won, false) = false
    AND COALESCE(is_lost, false) = false
  ORDER BY order_index ASC
  LIMIT 1;

  FOR r IN
    SELECT id, lead_id, visitor_phone, visitor_whatsapp, visitor_name, metadata
    FROM public.platform_crm_conversations
    WHERE id = ANY(COALESCE(p_conversation_ids, '{}'::uuid[]))
      AND product_id = p_product_id
      AND channel IN ('whatsapp_qr', 'whatsapp_evolution')
    ORDER BY created_at ASC
  LOOP
    v_lead_id := r.lead_id;
    v_phone := COALESCE(NULLIF(r.visitor_phone, ''), NULLIF(r.visitor_whatsapp, ''));
    IF v_phone IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_product_id::text || ':' || v_phone, 0)
    );

    IF v_lead_id IS NULL THEN
      SELECT id INTO v_lead_id
      FROM public.platform_crm_leads
      WHERE product_id = p_product_id AND phone = v_phone
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    v_name := COALESCE(
      NULLIF(r.metadata->'wa_profile'->>'greeting_name', ''),
      NULLIF(r.visitor_name, '')
    );
    IF v_name IS NULL
       OR lower(v_name) = ANY(ARRAY[
         'lash', 'expert', 'studio', 'nail', 'nails', 'beauty',
         'maquiagem', 'sobrancelha', 'designer'
       ])
       OR regexp_replace(v_name, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
    THEN
      v_name := 'WhatsApp ' || v_phone;
    END IF;

    IF v_lead_id IS NULL THEN
      INSERT INTO public.platform_crm_leads (
        product_id, name, phone, source, lead_channel
      ) VALUES (
        p_product_id, v_name, v_phone, 'whatsapp_qr', 'whatsapp_qr'
      )
      ON CONFLICT (product_id, phone)
        WHERE product_id IS NOT NULL AND phone IS NOT NULL
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_lead_id;
    ELSE
      UPDATE public.platform_crm_leads
      SET name = CASE
        WHEN name IS NULL OR name LIKE 'WhatsApp %'
          OR lower(name) = ANY(ARRAY[
            'lash', 'expert', 'studio', 'nail', 'nails', 'beauty',
            'maquiagem', 'sobrancelha', 'designer'
          ])
        THEN v_name ELSE name END,
        updated_at = now()
      WHERE id = v_lead_id;

    END IF;

    v_stage_bound := NULL;
    IF v_stage_id IS NOT NULL THEN
      UPDATE public.platform_crm_leads
      SET current_stage_id = v_stage_id, updated_at = now()
      WHERE id = v_lead_id AND current_stage_id IS NULL
      RETURNING id INTO v_stage_bound;
      IF v_stage_bound IS NOT NULL THEN
        INSERT INTO public.platform_crm_lead_stage_history (lead_id, stage_id)
        VALUES (v_lead_id, v_stage_id);
      END IF;
    END IF;

    UPDATE public.platform_crm_conversations
    SET lead_id = v_lead_id,
        visitor_name = CASE
          WHEN visitor_name IS NULL
            OR lower(visitor_name) = ANY(ARRAY[
              'lash', 'expert', 'studio', 'nail', 'nails', 'beauty',
              'maquiagem', 'sobrancelha', 'designer'
            ])
          THEN NULLIF(v_name, 'WhatsApp ' || v_phone)
          ELSE visitor_name
        END
    WHERE id = r.id;

    INSERT INTO public.platform_crm_lead_state (lead_id, product_id)
    VALUES (v_lead_id, p_product_id)
    ON CONFLICT (lead_id, product_id) DO NOTHING;

    PERFORM public.platform_crm_lead_memory_backfill(
      v_lead_id, p_product_id, 5000, 0
    );
    v_bound := v_bound + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'bound', v_bound,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_backfill_qr_lead_bindings(uuid, uuid[])
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_backfill_qr_lead_bindings(uuid, uuid[])
  TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Comentários
-- ════════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE public.platform_crm_lead_state IS
  'PRD-03: Estado canônico derivado (1 linha/lead/produto). CAS via platform_crm_lead_state_cas_patch.';
COMMENT ON TABLE public.platform_crm_lead_memory IS
  'PRD-03: Memória append-only. Supersessão cria nova linha (is_active=false na antiga).';
COMMENT ON COLUMN public.platform_crm_lead_state.version IS
  'CAS counter incrementado atomicamente no RPC. Conflito quando expected != atual.';
COMMENT ON COLUMN public.platform_crm_lead_memory.idempotency_key IS
  'msg:<conversation_id>:<message_id> para mensagens. UNIQUE por (lead_id, product_id, key).';
