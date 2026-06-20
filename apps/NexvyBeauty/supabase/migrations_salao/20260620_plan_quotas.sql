-- ============================================================================
-- 20260620_plan_quotas.sql — NexvyBeauty: controle por PLANO (quotas)
-- ----------------------------------------------------------------------------
-- NÃO aplicado automaticamente — aplicar via `supabase db query --linked -f` / CLI.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
-- Projeto Supabase: fzhlbwhdejumkyqosuvq
--
-- Contexto: módulos do NexvyBeauty são FIXOS (Salão+CRM+Atendimento). A
-- diferenciação entre clientes é por PLANO, controlando QUANTITATIVOS:
--   - instâncias WhatsApp  -> platform_plans.max_connections (JÁ existe; já
--     enforced em supabase/functions/evolution-proxy/index.ts). É a quota de
--     "Conexões WhatsApp" (1 linha em evolution_instances = 1 instância).
--   - usuários             -> platform_plans.max_users (JÁ existe; SEM gate até
--     agora — este arquivo adiciona o enforcement via trigger em profiles).
--   - agentes de IA        -> max_ai_agents (NOVO; só existia o boolean
--     feature_ai_agents). Este arquivo cria a coluna + enforcement via trigger.
--
-- Decisões (Marcelo, 2026-06-20):
--   max_ai_agents por tier -> Trial 0 / Starter 0 / Pro 3 / Enterprise 5
--   max_users -> gate duro no momento que a vaga é consumida (vira membro);
--                convite PENDENTE não reserva vaga (só membros contam).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Documentação da semântica de max_connections (item 1: reusar, não criar
--    max_whatsapp_instances). max_connections == nº de instâncias WhatsApp.
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.platform_plans.max_connections IS
  'Quota de instâncias WhatsApp (Conexões WhatsApp). 1 instância = 1 linha em evolution_instances. Enforced em evolution-proxy (create_instance_self).';
COMMENT ON COLUMN public.organizations.max_connections IS
  'Override por-org da quota de instâncias WhatsApp; NULL = usa o plano (platform_plans.max_connections).';

-- ----------------------------------------------------------------------------
-- 2. Nova quota: max_ai_agents
--    - platform_plans.max_ai_agents : NOT NULL DEFAULT 0 (planos novos nascem
--      sem agentes até o super-admin liberar).
--    - organizations.max_ai_agents  : NULL = usa o plano (mesmo padrão dos
--      outros 3 overrides por-org: max_users, max_connections, max_products).
-- ----------------------------------------------------------------------------
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS max_ai_agents integer NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_ai_agents integer;

COMMENT ON COLUMN public.platform_plans.max_ai_agents IS
  'Quota de agentes de IA (product_agents) por organização neste plano. 0 = nenhum (coerente com feature_ai_agents=false).';
COMMENT ON COLUMN public.organizations.max_ai_agents IS
  'Override por-org da quota de agentes de IA; NULL = usa o plano (platform_plans.max_ai_agents).';

-- ----------------------------------------------------------------------------
-- 3. Seed dos valores por tier (idempotente — UPDATE por slug).
--    Trial/Starter têm feature_ai_agents=false => 0 mantém coerência.
-- ----------------------------------------------------------------------------
UPDATE public.platform_plans SET max_ai_agents = 0 WHERE slug IN ('trial', 'starter');
UPDATE public.platform_plans SET max_ai_agents = 3 WHERE slug = 'pro';
UPDATE public.platform_plans SET max_ai_agents = 5 WHERE slug = 'enterprise';

-- ----------------------------------------------------------------------------
-- 4. RPC get_organization_effective_limits: adicionar max_ai_agents ao bloco
--    limits. CORPO REPRODUZIDO VERBATIM do baseline + a única linha nova
--    (limits.max_ai_agents). Merge: override org -> plano -> default (0).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_effective_limits(p_org_id uuid)
RETURNS jsonb
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
      'max_ai_tokens_month', COALESCE(v_plan.max_ai_tokens_month, 100000),
      'max_ai_agents', COALESCE(v_org.max_ai_agents, v_plan.max_ai_agents, 0)
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

-- ----------------------------------------------------------------------------
-- 5. Enforcement server-side (inbypassável): triggers BEFORE INSERT.
--    Espelham o padrão do evolution-proxy (max_connections), mas no banco —
--    porque agentes/usuários são gravados por insert direto do cliente e por
--    edge functions (create-team-member) / RPC (accept_invitation): o trigger
--    cobre TODOS os caminhos num único ponto.
-- ----------------------------------------------------------------------------

-- 5a. max_ai_agents -> product_agents
CREATE OR REPLACE FUNCTION public.enforce_max_ai_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW; -- sem org: RLS cuida, não há quota a aplicar
  END IF;

  v_limit := COALESCE(
    (public.get_organization_effective_limits(NEW.organization_id) #>> '{limits,max_ai_agents}')::integer,
    0
  );

  SELECT count(*) INTO v_count
  FROM public.product_agents
  WHERE organization_id = NEW.organization_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de % agente(s) de IA do plano atingido. Faça upgrade para criar mais.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_ai_agents ON public.product_agents;
CREATE TRIGGER trg_enforce_max_ai_agents
  BEFORE INSERT ON public.product_agents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_ai_agents();

-- 5b. max_users -> profiles (vaga consumida quando organization_id vira/ muda
--     para não-nulo). Conta membros existentes (id <> NEW.id): o 1º dono passa
--     (0 outros < limite). Convite pendente (team_invitations) NÃO conta.
CREATE OR REPLACE FUNCTION public.enforce_max_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW; -- profile sem org (ex.: handle_new_user antes do vínculo)
  END IF;

  -- só é "nova vaga" quando o vínculo muda para esta org
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  v_limit := COALESCE(
    (public.get_organization_effective_limits(NEW.organization_id) #>> '{limits,max_users}')::integer,
    5
  );

  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE organization_id = NEW.organization_id
    AND id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de % usuário(s) do plano atingido. Faça upgrade para adicionar mais membros.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_users ON public.profiles;
CREATE TRIGGER trg_enforce_max_users
  BEFORE INSERT OR UPDATE OF organization_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();

COMMIT;

-- ============================================================================
-- Notas operacionais:
--  * Orgs que JÁ têm agentes/usuários acima do novo limite mantêm os existentes
--    (trigger só bloqueia NOVAS criações). Coerente: Trial/Starter já tinham
--    feature_ai_agents=false.
--  * Escape hatch: super-admin pode elevar organizations.max_ai_agents /
--    max_users / max_connections (override por-org) para liberar uma org sem
--    mudar o plano — o RPC já dá precedência ao override.
--  * Verificação pós-apply (smoke):
--      SELECT slug, max_ai_agents FROM platform_plans ORDER BY display_order;
--      SELECT public.get_organization_effective_limits('<org_uuid>') -> 'limits';
-- ============================================================================
