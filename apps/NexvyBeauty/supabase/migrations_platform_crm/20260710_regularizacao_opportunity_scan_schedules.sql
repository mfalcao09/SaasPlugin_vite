-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_regularizacao_opportunity_scan_schedules.sql — B7 FIRE-NOW
-- Data: 2026-07-10 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP).
--
-- ⚠️ REGULARIZAÇÃO: a tabela public.opportunity_scan_schedules JÁ EXISTE em
-- prod (criada via MCP, sem migration versionada). Este arquivo é o espelho
-- para RECONSTRUÇÃO do banco — em prod, o CREATE TABLE IF NOT EXISTS é no-op.
--
-- NOTA: tabela ORG-SCOPED do Radar IA do salão (não é platform_crm_*); vive
-- nesta pasta porque a onda B7 do provisionamento a seeda e ela não tinha
-- migration em lugar nenhum. Shape reconstruído por engenharia reversa de:
--   * types.ts:7300-7346 (fonte canônica de colunas/nullability/defaults);
--   * src/hooks/useOpportunityScan.ts:190-245 (CRUD da UI; upsert manda
--     organization_id + created_by; select sem filtro → depende de RLS);
--   * supabase/functions/opportunity-scan-cron/index.ts (service_role: lê
--     is_active/cron_expression/last_run_at/filters/actions_config/
--     organization_id; grava last_run_at/last_scan_id);
--   * supabase/functions/_shared/cakto-plan-provisioning.ts:474-539 (seed B7:
--     insert só organization_id+name+cron_expression ⇒ filters/actions_config/
--     is_active têm DEFAULT; comentário confirma "is_active default true").
--
-- LIMITES da engenharia reversa (conferir em prod antes de confiar cegamente
-- no espelho — pg_constraint/pg_policies via MCP):
--   * FKs: types.ts registra Relationships: [] ⇒ NENHUMA FK para tabelas
--     public (nem organization_id→organizations, nem last_scan_id→
--     opportunity_scans — padrão dos irmãos opportunity_scans, idem sem FK de
--     org). FK p/ auth.users em created_by é INVISÍVEL ao gerador de types —
--     omitida aqui por fidelidade conservadora.
--   * notify_user_ids: types diz string[]; são user ids ⇒ uuid[] (se prod for
--     text[], ajustar).
--   * Literais de DEFAULT de filters/actions_config inferidos como '{}'::jsonb
--     (objetos no código; podem ser outro literal em prod).
--   * Trigger de updated_at: inexistência NÃO comprovada — nenhum consumidor
--     grava updated_at; espelho SEM trigger (não adicionar comportamento novo
--     numa regularização).
--   * RLS: policies de prod não são visíveis no repo. A policy abaixo é a
--     MÍNIMA que faz os consumidores atuais funcionarem (membros da org via
--     public.get_user_organization, padrão de salon_automation_rules em
--     20260626_salon_automation_foundation.sql). Se prod tiver policy com
--     outro nome, aplicar este arquivo ADICIONA uma policy permissiva ao lado
--     da existente (RLS permissivo = OR) — revisar pg_policies antes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.opportunity_scan_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  cron_expression text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notify_user_ids uuid[] NULL,
  last_run_at timestamptz NULL,
  last_scan_id uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opportunity_scan_schedules IS
  'Agenda do Radar IA de oportunidades (org-scoped, salão). Consumida por useOpportunityScan (UI), opportunity-scan-cron (service_role) e seedada no provisionamento Cakto (B7: Radar Automático diário 08h UTC). REGULARIZADA em migration 2026-07-10 — tabela pré-existia em prod via MCP.';
COMMENT ON COLUMN public.opportunity_scan_schedules.cron_expression IS
  'Expressão cron simplificada (min hora * * *) interpretada por shouldRunNow() do opportunity-scan-cron — só minuto/hora UTC são avaliados.';
COMMENT ON COLUMN public.opportunity_scan_schedules.last_scan_id IS
  'Último opportunity_scans.id disparado por esta agenda (sem FK — padrão das tabelas do Radar).';

-- Índices: cron varre is_active=true globalmente; UI lista por org.
CREATE INDEX IF NOT EXISTS idx_opportunity_scan_schedules_org
  ON public.opportunity_scan_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_scan_schedules_active
  ON public.opportunity_scan_schedules(is_active) WHERE is_active = true;

-- ─── RLS — policy REAL de prod (lida de pg_policies em 2026-07-10) ──────────
-- "Admin manage schedules": super_admin OU (org do usuário E admin/manager).
ALTER TABLE public.opportunity_scan_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage schedules" ON public.opportunity_scan_schedules;
CREATE POLICY "Admin manage schedules"
  ON public.opportunity_scan_schedules
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      organization_id = public.get_user_organization(auth.uid())
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      organization_id = public.get_user_organization(auth.uid())
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_scan_schedules TO authenticated;
GRANT ALL ON public.opportunity_scan_schedules TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — espelho de reconstrução (no-op em prod, exceto policy/índices se
-- faltarem lá). Conferir pg_policies/pg_constraint antes de confiar 100%.
-- ─────────────────────────────────────────────────────────────────────────────
