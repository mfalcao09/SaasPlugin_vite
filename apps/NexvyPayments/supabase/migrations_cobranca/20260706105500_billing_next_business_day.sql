-- ============================================================================
-- DIA ÚTIL DE VENCIMENTO (NexvyPayments) — blueprint §3.2 B3.
--
-- Suporte ao invoice-batch-generate: quando o vencimento calculado cai em
-- fim de semana (sáb/dom) ou feriado, ROLA para o próximo dia útil. Duas peças,
-- ambas ADITIVAS e ISOLADAS nesta esteira (hard fork §0): ZERO ALTER/DROP no core.
--
-- POR QUE UMA TABELA NOVA (billing_holidays) E NÃO platform_crm_business_holidays:
--   A única tabela de feriados herdada do core é `platform_crm_business_holidays`
--   (migrations_platform_crm/…_horarios.sql:59) — GLOBAL, single-tenant,
--   super-admin-only, SEM organization_id. Cobrança é MULTI-ORG e feriado é
--   por município/UF do prestador → precisa de escopo por org. Criamos
--   `billing_holidays` org-scoped (com linhas de escopo NACIONAL via
--   organization_id NULL, compartilhadas por todas as orgs). Fim de semana é
--   regra universal e NÃO depende de tabela alguma (EXTRACT(DOW)).
--
-- MOLDE: estilo billing_model.sql (public., IF NOT EXISTS, gen_random_uuid,
-- RLS org-scoped get_user_organization/has_role) + a função helper espelha o
-- padrão SECURITY DEFINER + SET search_path TO 'public' das RPCs do core.
--
-- CRITÉRIO BINÁRIO (§3.2 B3): vencimento em sábado -> segunda-feira; feriado ->
-- próximo dia útil. A função é determinística e pura (não muta estado).
-- ============================================================================


-- ============================================================================
-- 1. BILLING_HOLIDAYS — feriados por org (ou nacionais quando org IS NULL)
-- ----------------------------------------------------------------------------
-- `organization_id` NULL = feriado NACIONAL (vale p/ todas as orgs); preenchido
-- = feriado local/municipal daquela org. `data` é a chave. UNIQUE parcial por
-- (org, data) impede duplicar o mesmo feriado no cadastro. Índice por `data`
-- serve o lookup do próximo dia útil.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = feriado NACIONAL (todas as orgs)
  data date NOT NULL,
  descricao text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Uma linha por (org, data). NULL é distinto em UNIQUE do Postgres, então
-- feriado nacional (org NULL) e municipal (org preenchida) na MESMA data coexistem
-- sem colidir — exatamente o que queremos. O índice parcial abaixo garante a
-- unicidade REAL dos nacionais (onde org IS NULL, que o UNIQUE comum não cobre).
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_holidays_org_data
  ON public.billing_holidays (organization_id, data)
  WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_holidays_nacional_data
  ON public.billing_holidays (data)
  WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_billing_holidays_data ON public.billing_holidays (data);

ALTER TABLE public.billing_holidays ENABLE ROW LEVEL SECURITY;
-- Leitura: membro da org vê os feriados DA org + os NACIONAIS (org NULL).
CREATE POLICY "org members can view billing_holidays" ON public.billing_holidays
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id = get_user_organization(auth.uid())
  );
-- Gestão de feriado da própria org: admin/manager.
CREATE POLICY "org admin/manager can insert billing_holidays" ON public.billing_holidays
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update billing_holidays" ON public.billing_holidays
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete billing_holidays" ON public.billing_holidays
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
-- super-admin do grupo gerencia tudo (inclusive os feriados NACIONAIS org NULL).
CREATE POLICY "super admin manage billing_holidays" ON public.billing_holidays
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

GRANT ALL ON public.billing_holidays TO authenticated, service_role;


-- ============================================================================
-- 2. billing_is_business_day(org, date) — dia útil? (não sáb/dom, não feriado)
-- ----------------------------------------------------------------------------
-- STABLE: depende só do input + linhas de billing_holidays (não muta nada).
-- SECURITY DEFINER + search_path fixo: o batch a chama sob service_role, mas a
-- função é usável com segurança de qualquer contexto (só LÊ feriados). DOW: 0=dom
-- .. 6=sáb (padrão Postgres). Feriado casa org-específico OU nacional (org NULL).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.billing_is_business_day(
  p_org uuid,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXTRACT(DOW FROM p_date) NOT IN (0, 6)              -- não domingo, não sábado
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_holidays h
      WHERE h.data = p_date
        AND (h.organization_id = p_org OR h.organization_id IS NULL)  -- da org OU nacional
    );
$$;


-- ============================================================================
-- 3. billing_next_business_day(org, date) — rola p/ o próximo dia útil
-- ----------------------------------------------------------------------------
-- Se `p_date` já é dia útil, devolve-o inalterado (idempotente). Senão, avança
-- 1 dia por vez até achar o primeiro dia útil. LIMITE DE SEGURANÇA: no máximo
-- 30 iterações (nunca haverá 30 dias corridos não-úteis) — evita loop infinito
-- caso alguém popule feriados absurdos. Usada pelo invoice-batch-generate para
-- o `vencimento` e replicável em C6/régua. Determinística.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.billing_next_business_day(
  p_org uuid,
  p_date date
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date date := p_date;
  v_guard int := 0;
BEGIN
  WHILE NOT public.billing_is_business_day(p_org, v_date) AND v_guard < 30 LOOP
    v_date := v_date + 1;
    v_guard := v_guard + 1;
  END LOOP;
  RETURN v_date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_is_business_day(uuid, date)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_next_business_day(uuid, date) TO authenticated, service_role;

-- ============================================================================
-- FIM — 1 tabela org-scoped (billing_holidays) + 2 funções de dia útil.
-- ============================================================================
