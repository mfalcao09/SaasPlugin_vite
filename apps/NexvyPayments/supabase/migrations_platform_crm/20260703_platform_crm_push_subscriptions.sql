-- D9 (web-push) — fundação: tabela de subscriptions da PLATAFORMA, desacoplada do tenant.
-- Aplicada em prod via MCP apply_migration em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
--
-- Contexto: o CRM de plataforma (super_admin, gestao.*) não tinha web-push. A tabela
-- de tenant `push_subscriptions` é a versão VELHA (org_id + flag `ativo`/`ultimo_erro`).
-- Os edges push-subscribe/-dispatch do modelo (novo) esperam o schema com
-- `revoked_at`/`platform`/`is_standalone`/`last_seen_at`. Esta tabela adota esse schema
-- novo e desacopla: SEM organization_id (RLS super_admin isola os dados).
--
-- Escrita via service_role pelos edges platform-push-* (ignora RLS); leitura direta
-- pelo client só por super_admin.
CREATE TABLE IF NOT EXISTS public.platform_crm_push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  platform      text,
  is_standalone boolean NOT NULL DEFAULT false,
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- lookup de dispatch: subscriptions ativas por usuário
CREATE INDEX IF NOT EXISTS idx_platform_crm_push_subs_user_active
  ON public.platform_crm_push_subscriptions (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.platform_crm_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_push_subscriptions_super_admin_only ON public.platform_crm_push_subscriptions;
CREATE POLICY platform_crm_push_subscriptions_super_admin_only
  ON public.platform_crm_push_subscriptions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
