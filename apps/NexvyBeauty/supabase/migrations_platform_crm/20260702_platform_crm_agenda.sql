-- ============================================================
-- platform_crm — Seção AGENDA (CalendarManager) do super-admin.
-- Schema TOTALMENTE ISOLADO / DESACOPLADO do tenant (single-tenant).
-- ============================================================
-- Regras de design (não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id.
--   * Pipeline ÚNICO => SEM product_id / product-scoping.
--   * FKs internas SÓ apontam para platform_crm_* ou auth.users.
--   * Refs de usuário (user_id, host_user_id, created_by) => auth.users(id).
--   * lead_id => platform_crm_leads (nunca leads do tenant).
--   * RLS em TODAS: super_admin-only via public.has_role(...,'super_admin').
--   * updated_at via public.platform_crm_set_updated_at() (já existe).
--   * Idempotente (CREATE ... IF NOT EXISTS, enums/FKs via DO-block).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (idempotente; já criado no schema base,
--    recriado aqui por segurança caso esta migration rode isolada)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_crm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1) CALENDAR EVENTS (visão de calendário mês/semana/dia/lista)
--    Dropados no desacoplamento: organization_id, product_id, deal_id.
--    user_id/created_by -> auth.users; lead_id -> platform_crm_leads.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event Data
  title text NOT NULL,
  description text,
  location text,
  event_type text DEFAULT 'meeting'::text,

  -- Dates and Times
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  timezone text DEFAULT 'America/Sao_Paulo'::text,

  -- Recurrence
  is_recurring boolean DEFAULT false,
  recurrence_rule text,
  recurrence_end_date date,
  parent_event_id uuid REFERENCES public.platform_crm_calendar_events(id) ON DELETE CASCADE,

  -- Links (só platform_crm_leads; product_id/deal_id removidos)
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,

  -- Attendees
  attendees jsonb DEFAULT '[]'::jsonb,

  -- Status and Reminders
  status text DEFAULT 'confirmed'::text,
  reminder_minutes integer[] DEFAULT ARRAY[15, 60],

  -- Google Calendar Integration
  google_event_id text,
  google_calendar_id text,
  last_synced_at timestamptz,
  sync_status text DEFAULT 'local_only'::text,

  -- Google Meet
  meet_link text,
  create_meet boolean DEFAULT false,

  -- Metadata
  color text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_calendar_events_user
  ON public.platform_crm_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_calendar_events_start_time
  ON public.platform_crm_calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_platform_crm_calendar_events_lead
  ON public.platform_crm_calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_calendar_events_google
  ON public.platform_crm_calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_calendar_events_type
  ON public.platform_crm_calendar_events(event_type);

-- ============================================================
-- 2) GOOGLE CALENDAR CONNECTIONS (sync do vendedor/super-admin)
--    Dropado: organization_id. user_id -> auth.users.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- OAuth2 Tokens
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,

  -- Settings
  calendar_id text DEFAULT 'primary'::text,
  sync_enabled boolean DEFAULT true,
  sync_direction text DEFAULT 'both'::text,
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  sync_error text,

  -- Timestamps
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_gcal_conn_user
  ON public.platform_crm_google_calendar_connections(user_id);

-- ============================================================
-- 3) BOOKING EVENT TYPES (tipos de evento p/ agendamento)
--    Dropado: organization_id. user_id -> auth.users (era profiles).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  duration_minutes integer NOT NULL DEFAULT 30,
  location_type text NOT NULL DEFAULT 'google_meet'::text,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_booking_event_types_user_slug_uniq UNIQUE (user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bet_user
  ON public.platform_crm_booking_event_types(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bet_slug
  ON public.platform_crm_booking_event_types(slug);

-- ============================================================
-- 4) USER AVAILABILITY (disponibilidade semanal)
--    Dropado: organization_id. user_id -> auth.users (era profiles).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_user_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_user_availability_uniq UNIQUE (user_id, day_of_week, start_time)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_user_availability_user
  ON public.platform_crm_user_availability(user_id);

-- ============================================================
-- 5) AVAILABILITY OVERRIDES (exceções: férias/bloqueios)
--    Dropado: organization_id. user_id -> auth.users (era profiles).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_available boolean DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_availability_overrides_uniq UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_avail_overrides_user_date
  ON public.platform_crm_availability_overrides(user_id, date);

-- ============================================================
-- 6) BOOKING REQUESTS (agendamentos recebidos / reuniões)
--    Dropado: organization_id. host_user_id -> auth.users;
--    event_type_id/calendar_event_id -> platform_crm_*; lead_id -> platform_crm_leads.
--    Status inclui os valores estendidos do fluxo de confirmação.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL
    REFERENCES public.platform_crm_booking_event_types(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id uuid
    REFERENCES public.platform_crm_calendar_events(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo'::text,
  status text DEFAULT 'confirmed'::text CHECK (status = ANY (ARRAY[
    'pending','confirmed','cancelled','completed',
    'agendado','confirmacao_enviada','confirmado','lembrete_enviado',
    'reagendamento_solicitado','cancelado','no_show','concluido'
  ])),
  additional_info jsonb DEFAULT '{}'::jsonb,
  cancellation_reason text,
  confirmation_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  tracking jsonb DEFAULT '{}'::jsonb,
  -- Campos do fluxo de confirmação por WhatsApp
  whatsapp_message_id text,
  last_reply_at timestamptz,
  last_reply_text text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_host
  ON public.platform_crm_booking_requests(host_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_event_type
  ON public.platform_crm_booking_requests(event_type_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_start_time
  ON public.platform_crm_booking_requests(start_time);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_token
  ON public.platform_crm_booking_requests(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_status
  ON public.platform_crm_booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_booking_requests_phone
  ON public.platform_crm_booking_requests(guest_phone);

-- ============================================================
-- 7) BOOKING NOTIFICATION SETTINGS (1:1 com event_type)
--    Dropado: organization_id. REMOVIDO whatsapp_instance_id
--    (referenciava evolution_instances do tenant — isolamento).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL UNIQUE
    REFERENCES public.platform_crm_booking_event_types(id) ON DELETE CASCADE,

  send_email boolean NOT NULL DEFAULT true,
  send_whatsapp boolean NOT NULL DEFAULT false,

  confirmation_message_whatsapp text,
  confirmation_subject_email text,
  confirmation_html_email text,

  notify_seller_on_new boolean NOT NULL DEFAULT true,
  notify_seller_on_confirm boolean NOT NULL DEFAULT true,
  notify_seller_on_reschedule boolean NOT NULL DEFAULT true,
  notify_seller_on_cancel boolean NOT NULL DEFAULT true,
  internal_channel text NOT NULL DEFAULT 'both'::text
    CHECK (internal_channel IN ('whatsapp','email','both')),
  internal_message_template text,

  recovery_enabled boolean NOT NULL DEFAULT false,
  recovery_offset_value integer NOT NULL DEFAULT 3,
  recovery_offset_unit text NOT NULL DEFAULT 'hours'::text
    CHECK (recovery_offset_unit IN ('minutes','hours','days')),
  recovery_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bns_event
  ON public.platform_crm_booking_notification_settings(event_type_id);

-- ============================================================
-- 8) BOOKING REMINDERS (N por event_type)
--    Dropado: organization_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL
    REFERENCES public.platform_crm_booking_event_types(id) ON DELETE CASCADE,
  offset_value integer NOT NULL,
  offset_unit text NOT NULL CHECK (offset_unit IN ('minutes','hours','days')),
  channel text NOT NULL DEFAULT 'whatsapp'::text
    CHECK (channel IN ('whatsapp','email','both')),
  message_template text NOT NULL,
  email_subject text,
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_br_event
  ON public.platform_crm_booking_reminders(event_type_id);

-- ============================================================
-- 9) BOOKING STATUS HISTORY
--    Dropado: organization_id. booking_id -> platform_crm_booking_requests.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL
    REFERENCES public.platform_crm_booking_requests(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  source text NOT NULL DEFAULT 'system'::text
    CHECK (source IN ('system','lead_reply','seller','cron','admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bsh_booking
  ON public.platform_crm_booking_status_history(booking_id);

-- ============================================================
-- 10) BOOKING LOGS (auditoria de envios/replies)
--     Dropado: organization_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL
    REFERENCES public.platform_crm_booking_requests(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'confirmation_sent','reminder_sent','recovery_sent','reply_received',
    'notification_sent','send_failed','status_changed'
  )),
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bl_booking
  ON public.platform_crm_booking_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bl_created
  ON public.platform_crm_booking_logs(created_at DESC);

-- ============================================================
-- 11) BOOKING SCHEDULED JOBS (fila durável de disparos)
--     Dropado: organization_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_booking_scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL
    REFERENCES public.platform_crm_booking_requests(id) ON DELETE CASCADE,
  reminder_id uuid
    REFERENCES public.platform_crm_booking_reminders(id) ON DELETE SET NULL,
  kind text NOT NULL
    CHECK (kind IN ('confirmation','reminder','recovery','internal_notification')),
  channel text NOT NULL DEFAULT 'whatsapp'::text
    CHECK (channel IN ('whatsapp','email','both')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_bsj_due
  ON public.platform_crm_booking_scheduled_jobs(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_platform_crm_bsj_booking
  ON public.platform_crm_booking_scheduled_jobs(booking_id);

-- ============================================================
-- 12) SELLER NOTIFICATION SETTINGS (por usuário)
--     Dropado: organization_id. user_id -> auth.users (era profiles).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_seller_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_new_booking boolean NOT NULL DEFAULT true,
  notify_confirmed boolean NOT NULL DEFAULT true,
  notify_reschedule boolean NOT NULL DEFAULT true,
  notify_cancel boolean NOT NULL DEFAULT true,
  channel text NOT NULL DEFAULT 'both'::text
    CHECK (channel IN ('whatsapp','email','both')),
  whatsapp_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sns_user
  ON public.platform_crm_seller_notification_settings(user_id);

-- ============================================================
-- 13) TRIGGER de status history (desacoplado: sem organization_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_crm_booking_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_crm_booking_status_history (booking_id, from_status, to_status, source)
    VALUES (NEW.id, NULL, NEW.status, 'system');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.platform_crm_booking_status_history (booking_id, from_status, to_status, source)
    VALUES (NEW.id, OLD.status, NEW.status, 'system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_crm_booking_status_history
  ON public.platform_crm_booking_requests;
CREATE TRIGGER trg_platform_crm_booking_status_history
  AFTER INSERT OR UPDATE OF status ON public.platform_crm_booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_booking_log_status_change();

-- ============================================================
-- 14) TRIGGERS de updated_at (idempotentes) — só tabelas com updated_at
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_calendar_events',
    'platform_crm_google_calendar_connections',
    'platform_crm_booking_event_types',
    'platform_crm_booking_requests',
    'platform_crm_booking_notification_settings',
    'platform_crm_booking_reminders',
    'platform_crm_booking_scheduled_jobs',
    'platform_crm_seller_notification_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();',
      t, t
    );
  END LOOP;
END$$;

-- ============================================================
-- 15) RLS — super_admin-only em TODAS as tabelas de agenda
--     (helper public.has_role já existe: SECURITY DEFINER sobre user_roles)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_calendar_events',
    'platform_crm_google_calendar_connections',
    'platform_crm_booking_event_types',
    'platform_crm_user_availability',
    'platform_crm_availability_overrides',
    'platform_crm_booking_requests',
    'platform_crm_booking_notification_settings',
    'platform_crm_booking_reminders',
    'platform_crm_booking_status_history',
    'platform_crm_booking_logs',
    'platform_crm_booking_scheduled_jobs',
    'platform_crm_seller_notification_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_super_admin_only" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_super_admin_only" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
      'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role));',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END$$;

-- ============================================================
-- FIM — 12 tabelas platform_crm_* (agenda) isoladas, RLS super_admin-only.
-- ============================================================
