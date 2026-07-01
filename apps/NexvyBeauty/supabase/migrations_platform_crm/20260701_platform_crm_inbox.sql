-- ============================================================
-- platform_crm INBOX — Atendimento/Chat do CRM de venda de SaaS
-- do SUPER-ADMIN (NexvyBeauty). Schema TOTALMENTE ISOLADO do tenant.
-- ============================================================
-- Regras de design (mesmas do 20260701_platform_crm_schema.sql — não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id,
--     SEM sector_id, SEM product_id, SEM evolution_instance_id em NENHUMA tabela.
--   * Canal WhatsApp/Meta é FASE FUTURA => colunas de instância/conexão OMITIDAS.
--     channel default 'web_chat' fica pronto para extensão futura.
--   * FKs internas SÓ apontam para platform_crm_* / auth.users. JAMAIS para
--     webchat_* ou leads do tenant (proibido tocar essas).
--   * lead_id -> platform_crm_leads(id) ON DELETE SET NULL (nullable).
--   * RLS em TODAS: acesso exclusivo a super_admin via public.has_role.
--   * Realtime: SÓ platform_crm_conversations entra em supabase_realtime
--     (inbox lista usa postgres_changes). platform_crm_messages FICA DE FORA
--     de propósito — mensagens propagam via broadcast, não postgres_changes
--     (evita duplicação; mesmo gotcha do inbox do tenant).
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Enum de status da conversa
--    O webchat_conversation_status vive no schema do TENANT e não é garantido
--    no banco destino da plataforma. Criamos o nosso, prefixado, com os mesmos
--    valores (bot_active/waiting_human/human_active/closed). Idempotente.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'platform_crm_conversation_status'
  ) THEN
    CREATE TYPE public.platform_crm_conversation_status AS ENUM (
      'bot_active',
      'waiting_human',
      'human_active',
      'closed'
    );
  END IF;
END$$;

-- ============================================================
-- 1) CONVERSAS (inbox da plataforma)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'web_chat'::text,
  status platform_crm_conversation_status
    NOT NULL DEFAULT 'bot_active'::platform_crm_conversation_status,
  visitor_id text NOT NULL,
  visitor_name text,
  visitor_phone text,
  visitor_whatsapp text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid
    REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  needs_human boolean NOT NULL DEFAULT false,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  current_agent_id uuid,
  unread_count_agents integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_status
  ON public.platform_crm_conversations(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_last_message_at
  ON public.platform_crm_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_assigned_to
  ON public.platform_crm_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_lead
  ON public.platform_crm_conversations(lead_id);

-- ============================================================
-- 2) MENSAGENS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.platform_crm_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'text'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_type text DEFAULT 'text'::text,
  reply_to_message_id uuid
    REFERENCES public.platform_crm_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_messages_conversation
  ON public.platform_crm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_messages_created_at
  ON public.platform_crm_messages(created_at);

-- ============================================================
-- 3) NOTAS INTERNAS DA CONVERSA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.platform_crm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversation_notes_conversation
  ON public.platform_crm_conversation_notes(conversation_id);

-- ============================================================
-- 4) CONFIG DE AGENTE (persona / typing) — global, SEM organization_id
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  persona_prompt text,
  typing_delay_ms integer NOT NULL DEFAULT 1500,
  handoff_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5) WIDGET PÚBLICO — config do widget web, global, SEM organization_id
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_webchat_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Widget Principal'::text,
  public_key text NOT NULL,
  welcome_message text DEFAULT 'Olá! Como posso ajudar?'::text,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_webchat_widgets_public_key_uniq UNIQUE (public_key)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webchat_widgets_public_key
  ON public.platform_crm_webchat_widgets(public_key);

-- ============================================================
-- 6) TRIGGERS de updated_at (idempotentes; reusa helper já existente
--    public.platform_crm_set_updated_at do 20260701_platform_crm_schema.sql)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_conversations',
    'platform_crm_agent_configs',
    'platform_crm_webchat_widgets'
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
-- 7) RLS — super_admin-only em TODAS as tabelas do inbox
--     (helper public.has_role já existe: SECURITY DEFINER sobre user_roles)
--
--     // TODO política pública do widget:
--     platform_crm_webchat_widgets vai precisar, na FASE FUTURA de canal
--     público, de uma policy de SELECT anônimo/público filtrada por public_key
--     (para o widget embedado carregar sua config sem login). Por ora fica
--     super_admin-only como todas as outras.
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_conversations',
    'platform_crm_messages',
    'platform_crm_conversation_notes',
    'platform_crm_agent_configs',
    'platform_crm_webchat_widgets'
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
-- 8) REALTIME — SÓ conversations (lista usa postgres_changes).
--    platform_crm_messages FICA DE FORA (broadcast, não postgres_changes).
--    Idempotente: só adiciona se ainda não estiver na publicação.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'platform_crm_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.platform_crm_conversations;
  END IF;
END$$;

-- ============================================================
-- FIM — 5 tabelas de inbox platform_crm_* isoladas, RLS super_admin-only,
--       realtime só em conversations.
-- ============================================================
