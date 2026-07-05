-- F2 (O Cérebro) — fundação do supervisor multi-agente da PLATAFORMA.
-- Twin do agent-supervisor do tenant (specialists + routing_rules), SEM
-- organization_id — RLS super_admin isola, mesmo padrão de
-- 20260703_platform_crm_mia_actions_and_memory.sql.
--
-- NÃO aplicar aqui: o orquestrador aplica via MCP apply_migration
-- (projeto fzhlbwhdejumkyqosuvq), como as demais migrations platform_crm.
--
-- Contrato de colunas conforme decidido pelo orquestrador F2:
--   platform_crm_agent_specialists     — sub-personas de um agente-mãe.
--   platform_crm_agent_routing_rules   — regras (descrição do gatilho) → especialista.
-- Ambas referenciam platform_crm_product_agents(id) (o agente-mãe da persona).

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_specialists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text,
  focus       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_agent_specialists_agent_id
  ON public.platform_crm_agent_specialists (agent_id);
ALTER TABLE public.platform_crm_agent_specialists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_agent_specialists_super_admin_only ON public.platform_crm_agent_specialists;
CREATE POLICY platform_crm_agent_specialists_super_admin_only ON public.platform_crm_agent_specialists
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_routing_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  trigger_description  text,
  target_specialist_id uuid REFERENCES public.platform_crm_agent_specialists(id) ON DELETE SET NULL,
  priority             int NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_agent_routing_rules_agent_id
  ON public.platform_crm_agent_routing_rules (agent_id);
ALTER TABLE public.platform_crm_agent_routing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_agent_routing_rules_super_admin_only ON public.platform_crm_agent_routing_rules;
CREATE POLICY platform_crm_agent_routing_rules_super_admin_only ON public.platform_crm_agent_routing_rules
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
