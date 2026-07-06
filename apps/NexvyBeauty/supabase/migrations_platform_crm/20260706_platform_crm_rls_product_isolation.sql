-- ============================================================================
-- F6 — RLS opção (c): isolamento por REP + PRODUTO em platform_crm_leads
-- ----------------------------------------------------------------------------
-- Objetivo: "vendedor vê SÓ os leads DELE, dentro dos produtos autorizados via
-- platform_crm_user_product_assignments". super_admin e service_role: inalterados.
--
-- NÃO-QUEBRA (por construção):
--   • A policy vigente `platform_crm_leads_super_admin_only` (FOR ALL) permanece.
--   • Políticas permissivas do Postgres se somam por OR → super_admin segue vendo tudo.
--   • service_role bypassa RLS → edge functions/webhooks inalterados.
--   • Adicionamos SÓ uma policy FOR SELECT para o rep. Rep NÃO ganha INSERT/UPDATE/DELETE
--     (escrita de rep = follow-on, fora do escopo desta rodada).
--
-- PRÉ-REQUISITO (F1): platform_crm_leads.product_id, platform_crm_products e
-- platform_crm_user_product_assignments precisam existir no schema. Existem no
-- remoto (types.ts); F1 versiona. Aplicar F1 → F4 → F6, nesta ordem.
--
-- STATUS: DRAFT v1. Aplicar via MCP apply_migration. Idempotente.
-- ============================================================================

-- ─── Helper: o usuário atual está atribuído a este produto? ───────────────────
-- SECURITY DEFINER de propósito: a checagem lê platform_crm_user_product_assignments.
-- Rodando como dono, ignora a RLS dessa tabela e evita recursão/deny (risco #2 do recon).
-- search_path travado = hardening padrão Supabase.
CREATE OR REPLACE FUNCTION public.platform_crm_user_has_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_crm_user_product_assignments a
    WHERE a.user_id = auth.uid()
      AND a.product_id = p_product_id
  );
$$;

REVOKE ALL ON FUNCTION public.platform_crm_user_has_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_crm_user_has_product(uuid) TO authenticated;

-- ─── Policy do rep: SELECT só do lead DELE, em produto autorizado ─────────────
-- Ownership = assigned_to (decisão travada; sdr_id/closer_id ficam de fora nesta rodada).
DROP POLICY IF EXISTS "platform_crm_leads_rep_select" ON public.platform_crm_leads;
CREATE POLICY "platform_crm_leads_rep_select" ON public.platform_crm_leads
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND product_id IS NOT NULL
    AND public.platform_crm_user_has_product(product_id)
  );

-- ============================================================================
-- CHECK (rodar pós-aplicação, com 2 JWTs):
--   • Rep A (assigned_to=A, produto P1 em user_product_assignments):
--       SELECT ... FROM platform_crm_leads  → só vê leads assigned_to=A E product_id=P1.
--   • Rep A NÃO vê: leads do produto P2, nem leads de outro rep (assigned_to<>A).
--   • super_admin: vê todos. service_role: vê todos.
-- ============================================================================

-- ─── EXTENSÃO (F6b, follow-on — NÃO aplicada aqui) ───────────────────────────
-- Para propagar o isolamento às tabelas-filhas do lead (lead_notes, lead_stage_history,
-- lead_tag_assignments, tasks, deals…), o padrão é uma policy SELECT que exista o lead-pai
-- visível ao rep, ex.:
--   CREATE POLICY "<t>_rep_select" ON public.<t> FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.platform_crm_leads l
--                  WHERE l.id = <t>.lead_id
--                    AND l.assigned_to = auth.uid()
--                    AND l.product_id IS NOT NULL
--                    AND public.platform_crm_user_has_product(l.product_id)));
-- Deixado fora desta rodada para manter o incremento provável e provado (só leads).
