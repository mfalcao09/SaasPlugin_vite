-- ============================================================
-- Onboarding / Módulos — migração ADITIVA (idempotente)
-- NÃO aplicado automaticamente — aplicar via `supabase db push`/CLI
-- após revisão.
--
-- Escopo:
--   1. platform_plans.modules      jsonb  -> módulos liberados pelo PLANO
--   2. organizations.enabled_modules jsonb -> módulos ativados pela ORG no onboarding
--   3. servico_catalogo (nova)             -> catálogo de serviços da oficina (org-scoped)
--   4. seed seguro de modules p/ planos existentes (evita travar quem já tem plano)
--
-- Tudo ADITIVO: sem DROP de coluna/tabela, sem destrutivo. Re-rodável.
-- Padrão RLS copiado de 20260609_erp_oficina.sql:
--   organization_id = public.get_user_organization(auth.uid())
-- ============================================================

-- ---------- 1. platform_plans.modules ----------
-- Módulos que o plano LIBERA. Default '[]' = nada liberado explicitamente
-- (o seed abaixo preenche os planos atuais p/ não quebrar nada).
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------- 2. organizations.enabled_modules ----------
-- Módulos que a ORG ativou no onboarding/wizard. Subconjunto dos liberados
-- pelo plano. Default '[]' = onboarding ainda não escolheu.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------- 3. SERVICO_CATALOGO (catálogo de serviços da oficina) ----------
CREATE TABLE IF NOT EXISTS public.servico_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  preco_base      numeric,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servico_catalogo_org ON public.servico_catalogo(organization_id);

-- RLS org-scoped (mesmo padrão do schema sales-spark / ERP oficina)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['servico_catalogo']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can view %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can view %1$s" ON public.%1$I FOR SELECT USING (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can insert %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can update %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can update %1$s" ON public.%1$I FOR UPDATE USING (organization_id = public.get_user_organization(auth.uid())) WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can delete %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can delete %1$s" ON public.%1$I FOR DELETE USING (organization_id = public.get_user_organization(auth.uid()));', t);
  END LOOP;
END $$;

-- GRANTs explícitos p/ a nova tabela (o schema sales-spark concede no nível
-- de schema, mas garantimos aqui de forma idempotente p/ os roles do Supabase).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servico_catalogo TO authenticated;
GRANT ALL ON public.servico_catalogo TO service_role;

-- ---------- 4. SEED SEGURO ----------
-- Preenche os planos ATUAIS com o conjunto completo de módulos da oficina,
-- p/ que ninguém com plano existente fique sem acesso por causa do default '[]'.
-- Só toca planos vazios/null — não sobrescreve planos já configurados.
UPDATE public.platform_plans
SET modules = '["erp_oficina","crm_vendas","atendimento","administracao"]'::jsonb
WHERE (modules = '[]'::jsonb OR modules IS NULL);
