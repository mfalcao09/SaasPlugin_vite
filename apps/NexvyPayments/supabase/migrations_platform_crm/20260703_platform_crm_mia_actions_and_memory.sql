-- D5 (Mia ações + memória) — fundação: 2 tabelas da PLATAFORMA, desacopladas do tenant.
-- Aplicada em prod via MCP apply_migration em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
--
-- Contexto: a Mia da plataforma (platform-mia) é read-only hoje (chat + 22 tools de
-- consulta). Este é o alicerce pra dar AÇÕES (fluxo propor->confirmar->executar) + MEMÓRIA.
-- Twin de mia_actions / mia_user_memory do modelo, SEM organization_id (RLS super_admin
-- isola). UX de confirmação escolhida: botões inline no chat (decisão Marcelo).
--
-- Resto do stack D5 (edges platform-mia-prepare-action/-execute-action, hooks
-- usePlatformCrmMiaActions/-Memory, UI PlatformCrmMiaPendingActions, + tools de
-- draft/confirm/memory no platform-mia) a seguir.

CREATE TABLE IF NOT EXISTS public.platform_crm_mia_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type   text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview       text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'waiting_confirmation',
  result        jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  executed_at   timestamptz,
  cancelled_at  timestamptz,
  CONSTRAINT platform_crm_mia_actions_status_check CHECK (status IN ('draft','waiting_confirmation','approved','executed','cancelled','failed')),
  CONSTRAINT platform_crm_mia_actions_type_check CHECK (action_type IN (
    'create_task','schedule_followup','notify_seller',
    'open_conversation','open_lead','open_calendar','open_tasks','open_report'
  ))
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_mia_actions_user_status
  ON public.platform_crm_mia_actions (user_id, status);
ALTER TABLE public.platform_crm_mia_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_mia_actions_super_admin_only ON public.platform_crm_mia_actions;
CREATE POLICY platform_crm_mia_actions_super_admin_only ON public.platform_crm_mia_actions
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.platform_crm_mia_user_memory (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          text,
  role_label            text,
  timezone              text DEFAULT 'America/Sao_Paulo',
  locale                text DEFAULT 'pt-BR',
  preferences           jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_active_entities  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.platform_crm_mia_user_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_mia_user_memory_super_admin_only ON public.platform_crm_mia_user_memory;
CREATE POLICY platform_crm_mia_user_memory_super_admin_only ON public.platform_crm_mia_user_memory
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
