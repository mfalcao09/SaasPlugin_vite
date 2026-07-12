-- ============================================================================
-- MÓDULO JORNADA DO LEAD — camada PLATAFORMA (super_admin), PRODUCT-SCOPED
-- ----------------------------------------------------------------------------
-- PORTE product-scoped do módulo "Jornada do Lead" do CRM Vendus (org-scoped).
-- Fonte: supabase/migrations/20260702192218_...sql (Vendus) — tabela
-- lead_journey_events + enums + triggers que populam a jornada a partir de
-- leads / conversas / deals / mensagens / tarefas / agenda / stage_history.
--
-- Adaptações para a camada platform_crm_* (super_admin, single-plataforma):
--   • organization_id  →  REMOVIDO. Escopo passa a ser product_id (chave).
--   • lead_journey_events → platform_crm_journey_events.
--   • Tabelas de origem dos triggers → gêmeas platform_crm_* (leads, deals,
--     conversations, messages, tasks, calendar_events, lead_stage_history).
--   • Enums journey_* → platform_crm_journey_event_type / _category, com TODOS
--     os ~63 valores (base + os que o Vendus adicionava por ALTER TYPE ADD VALUE)
--     CONSOLIDADOS num único CREATE TYPE cada (sem ALTERs incrementais).
--   • RLS = padrão vigente `_super_admin_only` (has_role super_admin ::app_role),
--     idêntico às demais 22+ tabelas platform_crm_*.
--   • Coluna jsonb mantém o nome `payload` (fidelidade 1:1 ao lib e aos triggers
--     portados — o "metadata jsonb" do briefing é esta coluna).
--
-- product_id é derivado do LEAD nos triggers cujo row de origem não carrega
-- product_id de forma garantida (stage_history / calendar_events / tasks /
-- messages). pcrm_log_journey_event é best-effort: se product_id vier NULL, o
-- evento é ignorado e a operação principal NUNCA é bloqueada (EXCEPTION WHEN
-- OTHERS).
--
-- Idempotente: CREATE TYPE via DO/EXCEPTION, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS.
-- ⚠️ ESCRITA-NÃO-APLICADA: não rodar sem revisão. Segurança: nada de input de
-- usuário concatenado; triggers usam jsonb_build_object (sem SQL dinâmico).
-- ============================================================================

-- ─── Enums CONSOLIDADOS ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.platform_crm_journey_event_type AS ENUM (
    -- base (Vendus CREATE TYPE original)
    'lead_created','lead_updated','lead_assigned','lead_transferred',
    'lead_archived','lead_reopened','lead_qualified','lead_disqualified',
    'temperature_changed','tag_added','tag_removed','field_changed',
    'first_conversation','first_message_in','first_reply_out',
    'human_reply','ai_reply','conversation_accepted','conversation_transferred',
    'conversation_archived','conversation_reopened','message_scheduled',
    'message_sent','message_read','call_made',
    'opportunity_created','pipeline_changed','stage_changed',
    'meeting_created','meeting_confirmed','meeting_cancelled',
    'task_created','task_completed','followup_created','followup_done',
    'proposal_created','proposal_sent','proposal_viewed',
    'pix_generated','pix_paid','checkout_created',
    'sale_completed','post_sale_started','customer_lost','customer_reactivated',
    -- adicionados no Vendus via ALTER TYPE ADD VALUE (folded-in)
    'ad_click_received','agent_tool_executed','ai_handoff',
    'cadence_completed','cadence_enrolled','cadence_step_sent',
    'campaign_identified','commission_created','human_handoff',
    'meta_click_received','meta_ctwa_received','owner_changed',
    'sale_cancelled','sale_refunded','session_ended','session_started',
    'wa_template_sent','wa_window_expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_crm_journey_event_category AS ENUM (
    'origin','contact','attendance','qualification','opportunity',
    'meeting','proposal','negotiation','sale','post_sale','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tabela principal ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_journey_events (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                  uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id                     uuid
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  conversation_id             uuid
    REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  deal_id                     uuid
    REFERENCES public.platform_crm_deals(id) ON DELETE SET NULL,
  pipeline_stage_id           uuid
    REFERENCES public.platform_crm_pipeline_stages(id) ON DELETE SET NULL,
  user_id                     uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  -- agent_id: sem FK (best-effort; product_agents não é dependência crítica)
  agent_id                    uuid,
  event_type                  public.platform_crm_journey_event_type NOT NULL,
  event_category              public.platform_crm_journey_event_category
                                NOT NULL DEFAULT 'system',
  channel                     text,
  source                      text,
  title                       text,
  description                 text,
  payload                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at                 timestamptz NOT NULL DEFAULT now(),
  previous_event_id           uuid,
  time_since_previous_seconds integer,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices (product-scoped) ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_product_lead_time
  ON public.platform_crm_journey_events (product_id, lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_product_type_time
  ON public.platform_crm_journey_events (product_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_product_category_time
  ON public.platform_crm_journey_events (product_id, event_category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_product_channel
  ON public.platform_crm_journey_events (product_id, channel);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_product_time
  ON public.platform_crm_journey_events (product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_lead_time
  ON public.platform_crm_journey_events (lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_created
  ON public.platform_crm_journey_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_conversation
  ON public.platform_crm_journey_events (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcrm_journey_payload_gin
  ON public.platform_crm_journey_events USING GIN (payload);

-- ─── RLS: super_admin only (padrão vigente) ──────────────────────────────────
ALTER TABLE public.platform_crm_journey_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_journey_events_super_admin_only
  ON public.platform_crm_journey_events;
CREATE POLICY platform_crm_journey_events_super_admin_only
  ON public.platform_crm_journey_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS QUE POPULAM A JORNADA (SECURITY DEFINER, best-effort)
-- ════════════════════════════════════════════════════════════════════════════

-- BEFORE INSERT: calcula previous_event_id + delta por lead.
CREATE OR REPLACE FUNCTION public.pcrm_fill_journey_previous_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev RECORD;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT id, occurred_at INTO prev
    FROM public.platform_crm_journey_events
    WHERE lead_id = NEW.lead_id AND occurred_at <= NEW.occurred_at
    ORDER BY occurred_at DESC, created_at DESC
    LIMIT 1;

    IF prev.id IS NOT NULL THEN
      NEW.previous_event_id := prev.id;
      NEW.time_since_previous_seconds :=
        GREATEST(0, EXTRACT(EPOCH FROM (NEW.occurred_at - prev.occurred_at))::INT);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_fill_journey_previous
  ON public.platform_crm_journey_events;
CREATE TRIGGER trg_pcrm_fill_journey_previous
  BEFORE INSERT ON public.platform_crm_journey_events
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_fill_journey_previous_event();

-- Helper de gravação segura (best-effort). Escopo = product_id (1º arg).
CREATE OR REPLACE FUNCTION public.pcrm_log_journey_event(
  p_product      uuid,
  p_lead         uuid,
  p_type         public.platform_crm_journey_event_type,
  p_category     public.platform_crm_journey_event_category,
  p_channel      text DEFAULT NULL,
  p_source       text DEFAULT NULL,
  p_title        text DEFAULT NULL,
  p_description  text DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb,
  p_conversation uuid DEFAULT NULL,
  p_deal         uuid DEFAULT NULL,
  p_stage        uuid DEFAULT NULL,
  p_user         uuid DEFAULT NULL,
  p_agent        uuid DEFAULT NULL,
  p_occurred     timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Sem produto não há como escopar o evento no painel product-scoped → ignora.
  IF p_product IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.platform_crm_journey_events (
    product_id, lead_id, conversation_id, deal_id, pipeline_stage_id,
    user_id, agent_id, event_type, event_category,
    channel, source, title, description, payload, occurred_at
  ) VALUES (
    p_product, p_lead, p_conversation, p_deal, p_stage,
    p_user, p_agent, p_type, p_category,
    p_channel, p_source, p_title, p_description, COALESCE(p_payload,'{}'::jsonb), p_occurred
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- best-effort: nunca bloqueia a operação principal
END;
$$;

-- ─── Trigger: platform_crm_leads ─────────────────────────────────────────────
-- (sem coluna `tags` na gêmea → branch de etiquetas removido)
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_lead_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.pcrm_log_journey_event(
      NEW.product_id, NEW.id, 'lead_created', 'origin',
      NEW.lead_channel, COALESCE(NEW.lead_origin, NEW.source, NEW.utm_source),
      'Lead criado', NEW.name,
      jsonb_build_object(
        'utm_source', NEW.utm_source, 'utm_medium', NEW.utm_medium,
        'utm_campaign', NEW.utm_campaign, 'utm_term', NEW.utm_term,
        'utm_content', NEW.utm_content, 'referrer', NEW.referrer_url,
        'landing_page', NEW.landing_page, 'phone', NEW.phone, 'email', NEW.email
      ),
      NULL, NULL, NEW.current_stage_id, NEW.assigned_to, NULL, NEW.created_at
    );
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    PERFORM public.pcrm_log_journey_event(
      NEW.product_id, NEW.id,
      CASE WHEN OLD.assigned_to IS NULL THEN 'lead_assigned' ELSE 'lead_transferred' END,
      'attendance', NULL, NULL,
      CASE WHEN OLD.assigned_to IS NULL THEN 'Lead atribuído' ELSE 'Lead transferido' END,
      NULL,
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to,
                         'reason', NEW.transfer_reason),
      NULL, NULL, NEW.current_stage_id, NEW.assigned_to, NULL, now()
    );
  END IF;

  IF NEW.temperature IS DISTINCT FROM OLD.temperature THEN
    PERFORM public.pcrm_log_journey_event(
      NEW.product_id, NEW.id, 'temperature_changed', 'qualification',
      NULL, NULL, 'Temperatura alterada',
      OLD.temperature::text || ' → ' || NEW.temperature::text,
      jsonb_build_object('from', OLD.temperature, 'to', NEW.temperature),
      NULL, NULL, NEW.current_stage_id, NEW.assigned_to, NULL, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_leads ON public.platform_crm_leads;
CREATE TRIGGER trg_pcrm_journey_leads
  AFTER INSERT OR UPDATE ON public.platform_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_lead_change();

-- ─── Trigger: platform_crm_lead_stage_history ────────────────────────────────
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead  RECORD;
  v_stage RECORD;
BEGIN
  SELECT product_id, assigned_to INTO v_lead
    FROM public.platform_crm_leads WHERE id = NEW.lead_id;
  IF v_lead.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT name, color, is_won, is_lost, order_index INTO v_stage
    FROM public.platform_crm_pipeline_stages WHERE id = NEW.stage_id;

  PERFORM public.pcrm_log_journey_event(
    v_lead.product_id, NEW.lead_id,
    CASE
      WHEN v_stage.is_won  THEN 'sale_completed'
      WHEN v_stage.is_lost THEN 'customer_lost'
      ELSE 'stage_changed'
    END,
    CASE
      WHEN v_stage.is_won  THEN 'sale'
      WHEN v_stage.is_lost THEN 'negotiation'
      ELSE 'opportunity'
    END,
    NULL, NULL,
    COALESCE(v_stage.name, 'Mudança de etapa'),
    NULL,
    jsonb_build_object('stage_name', v_stage.name, 'order', v_stage.order_index,
                       'is_won', v_stage.is_won, 'is_lost', v_stage.is_lost),
    NULL, NULL, NEW.stage_id, v_lead.assigned_to, NULL,
    COALESCE(NEW.entered_at, now())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_stage ON public.platform_crm_lead_stage_history;
CREATE TRIGGER trg_pcrm_journey_stage
  AFTER INSERT ON public.platform_crm_lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_stage_change();

-- ─── Trigger: platform_crm_deals ─────────────────────────────────────────────
-- (deals gêmeo só tem status won/lost/cancelled; product_id derivado do lead
--  como fallback caso a coluna do deal esteja NULL)
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_deal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
BEGIN
  SELECT COALESCE(NEW.product_id, l.product_id) INTO v_product
    FROM public.platform_crm_leads l WHERE l.id = NEW.lead_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id, 'opportunity_created', 'opportunity',
      NULL, NULL, 'Oportunidade criada', NULL,
      jsonb_build_object('deal_value', NEW.deal_value, 'status', NEW.status),
      NULL, NEW.id, NULL, NEW.seller_id, NULL, NEW.created_at
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'won' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'sale_completed','sale',NULL,NULL,'Venda concluída',NULL,
        jsonb_build_object('deal_value',NEW.deal_value),
        NULL,NEW.id,NULL,NEW.seller_id,NULL,now());
    ELSIF NEW.status = 'lost' OR NEW.status = 'cancelled' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'customer_lost','negotiation',NULL,NULL,'Cliente perdido',NULL,
        jsonb_build_object('status',NEW.status),
        NULL,NEW.id,NULL,NEW.seller_id,NULL,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_deals ON public.platform_crm_deals;
CREATE TRIGGER trg_pcrm_journey_deals
  AFTER INSERT OR UPDATE ON public.platform_crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_deal_change();

-- ─── Trigger: platform_crm_calendar_events (reuniões) ────────────────────────
-- product_id derivado do lead (a gêmea de agenda removeu product_id local).
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_calendar_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  SELECT product_id INTO v_product FROM public.platform_crm_leads WHERE id = NEW.lead_id;
  IF v_product IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id, 'meeting_created', 'meeting',
      NULL, NULL, 'Reunião agendada', NEW.title,
      jsonb_build_object('event_type', NEW.event_type, 'status', NEW.status,
                         'start', NEW.start_time),
      NULL, NULL, NULL, NEW.user_id, NULL, NEW.created_at
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'meeting_confirmed','meeting',NULL,NULL,'Reunião confirmada',NEW.title,
        jsonb_build_object('start',NEW.start_time),NULL,NULL,NULL,NEW.user_id,NULL,now());
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'meeting_cancelled','meeting',NULL,NULL,'Reunião cancelada',NEW.title,
        '{}'::jsonb,NULL,NULL,NULL,NEW.user_id,NULL,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_calendar ON public.platform_crm_calendar_events;
CREATE TRIGGER trg_pcrm_journey_calendar
  AFTER INSERT OR UPDATE ON public.platform_crm_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_calendar_event();

-- ─── Trigger: platform_crm_tasks ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  SELECT product_id INTO v_product FROM public.platform_crm_leads WHERE id = NEW.lead_id;
  IF v_product IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id,
      CASE WHEN NEW.type = 'follow_up' THEN 'followup_created' ELSE 'task_created' END,
      'attendance', NULL, NULL,
      COALESCE(NEW.title,'Tarefa criada'), NEW.description,
      jsonb_build_object('type',NEW.type,'due_date',NEW.due_date),
      NULL, NULL, NULL, NEW.user_id, NULL, NEW.created_at
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'completed' THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id,
      CASE WHEN NEW.type = 'follow_up' THEN 'followup_done' ELSE 'task_completed' END,
      'attendance', NULL, NULL,
      COALESCE(NEW.title,'Tarefa concluída'), NULL,
      jsonb_build_object('type',NEW.type),
      NULL, NULL, NULL, NEW.user_id, NULL, now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_tasks ON public.platform_crm_tasks;
CREATE TRIGGER trg_pcrm_journey_tasks
  AFTER INSERT OR UPDATE ON public.platform_crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_task_change();

-- ─── Trigger: platform_crm_conversations ─────────────────────────────────────
-- (assigned_user_id → assigned_to; status enum: bot_active/waiting_human/
--  human_active/closed → só 'closed' é terminal)
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_conversation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
BEGIN
  v_product := COALESCE(
    NEW.product_id,
    (SELECT product_id FROM public.platform_crm_leads WHERE id = NEW.lead_id)
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id, 'first_conversation', 'contact',
      NEW.channel, NEW.channel, 'Conversa iniciada', NULL,
      jsonb_build_object('channel',NEW.channel,'status',NEW.status),
      NEW.id, NULL, NULL, NEW.assigned_to, NULL, NEW.created_at
    );
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public.pcrm_log_journey_event(
      v_product, NEW.lead_id,
      CASE WHEN OLD.assigned_to IS NULL THEN 'conversation_accepted'
           ELSE 'conversation_transferred' END,
      'attendance', NEW.channel, NULL,
      CASE WHEN OLD.assigned_to IS NULL
           THEN 'Conversa aceita' ELSE 'Conversa transferida' END,
      NULL,
      jsonb_build_object('from',OLD.assigned_to,'to',NEW.assigned_to),
      NEW.id, NULL, NULL, NEW.assigned_to, NULL, now()
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'closed' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'conversation_archived','attendance',NEW.channel,NULL,
        'Conversa arquivada',NULL,jsonb_build_object('status',NEW.status),
        NEW.id,NULL,NULL,NEW.assigned_to,NULL,now());
    ELSIF OLD.status::text = 'closed' AND NEW.status::text <> 'closed' THEN
      PERFORM public.pcrm_log_journey_event(v_product, NEW.lead_id,
        'conversation_reopened','attendance',NEW.channel,NULL,
        'Conversa reaberta',NULL,'{}'::jsonb,
        NEW.id,NULL,NULL,NEW.assigned_to,NULL,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_conversations ON public.platform_crm_conversations;
CREATE TRIGGER trg_pcrm_journey_conversations
  AFTER INSERT OR UPDATE ON public.platform_crm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_conversation_change();

-- ─── Trigger: platform_crm_messages (1ª entrada/saída + ai/human replies) ────
CREATE OR REPLACE FUNCTION public.pcrm_journey_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv         RECORD;
  v_has_inbound  BOOLEAN;
  v_has_outbound BOOLEAN;
BEGIN
  SELECT product_id, lead_id, channel INTO v_conv
    FROM public.platform_crm_conversations WHERE id = NEW.conversation_id;
  IF v_conv IS NULL THEN RETURN NEW; END IF;

  IF NEW.direction = 'inbound' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.platform_crm_messages
      WHERE conversation_id = NEW.conversation_id
        AND direction = 'inbound' AND id <> NEW.id
    ) INTO v_has_inbound;
    IF NOT v_has_inbound THEN
      PERFORM public.pcrm_log_journey_event(
        v_conv.product_id, v_conv.lead_id, 'first_message_in','contact',
        v_conv.channel, NULL, 'Primeira mensagem do lead',
        LEFT(COALESCE(NEW.content,''), 200), '{}'::jsonb,
        NEW.conversation_id, NULL, NULL, NULL, NULL, NEW.created_at
      );
    END IF;
  ELSIF NEW.direction = 'outbound' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.platform_crm_messages
      WHERE conversation_id = NEW.conversation_id
        AND direction = 'outbound' AND id <> NEW.id
    ) INTO v_has_outbound;
    IF NOT v_has_outbound THEN
      PERFORM public.pcrm_log_journey_event(
        v_conv.product_id, v_conv.lead_id, 'first_reply_out','contact',
        v_conv.channel, NULL, 'Primeira resposta enviada',
        LEFT(COALESCE(NEW.content,''), 200),
        jsonb_build_object('sender_type', NEW.sender_type),
        NEW.conversation_id, NULL, NULL, NEW.sender_id, NULL, NEW.created_at
      );
    ELSE
      IF NEW.sender_type = 'bot' THEN
        PERFORM public.pcrm_log_journey_event(
          v_conv.product_id, v_conv.lead_id, 'ai_reply','attendance',
          v_conv.channel, NULL, 'Resposta IA',
          LEFT(COALESCE(NEW.content,''), 200), '{}'::jsonb,
          NEW.conversation_id, NULL, NULL, NULL, NULL, NEW.created_at
        );
      ELSIF NEW.sender_type = 'agent' THEN
        PERFORM public.pcrm_log_journey_event(
          v_conv.product_id, v_conv.lead_id, 'human_reply','attendance',
          v_conv.channel, NULL, 'Resposta humana',
          LEFT(COALESCE(NEW.content,''), 200), '{}'::jsonb,
          NEW.conversation_id, NULL, NULL, NEW.sender_id, NULL, NEW.created_at
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcrm_journey_messages ON public.platform_crm_messages;
CREATE TRIGGER trg_pcrm_journey_messages
  AFTER INSERT ON public.platform_crm_messages
  FOR EACH ROW EXECUTE FUNCTION public.pcrm_journey_on_message_insert();

-- ============================================================================
-- FIM — módulo Jornada do Lead (platform_crm, product-scoped)
-- ============================================================================
