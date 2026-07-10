-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_payment_links.sql — A1.3 (tabela pendente do porte A1.2)
--
-- ENTREGA 4: cria SÓ platform_crm_payment_links (a que falta).
--   * platform_crm_tasks JÁ EXISTE em prod (20260701_platform_crm_schema.sql §7.1
--     + product_id em prod) e a UI portada (PlatformCrmScheduleFollowupDialog)
--     insere exatamente o shape existente (title, description, due_date, user_id,
--     created_by, lead_id, type, priority, status) — NÃO recriar, NÃO alterar.
--   * platform_crm_payment_links NÃO existe (ausente do types.ts de prod). A UI
--     PlatformCrmPaymentLinkDialog.tsx hoje insere best-effort num try/catch que
--     só faz console.warn quando a tabela falta. Esta migration destrava isso.
--
-- Shape ALINHADO AO CONTRATO REAL DA UI (ground truth = o insert do dialog),
-- não à prosa do V5: o dialog envia created_by, conversation_id, lead_id, title,
-- description, amount, currency='BRL', url. Colunas extras (id, product_id,
-- plan_ref, status, created_at, updated_at) são default/nullable, então o insert
-- atual (que as omite) passa sem alteração na UI.
--   * url  → nome canônico do link (o dialog usa `url`, não `cakto_url`).
--   * product_id → nullable, para o cascateamento produto→link (ENTREGA 2).
--   * plan_ref → nullable, referência do plano (217/387/687) p/ relatórios futuros.
--
-- Padrão de design idêntico ao schema principal: prefixo platform_crm_, SEM
-- organization_id, FKs só para platform_crm_* / auth.users, RLS super_admin-only
-- via public.has_role, trigger updated_at reusando platform_crm_set_updated_at,
-- migration idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_crm_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid
    REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  lead_id uuid
    REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  product_id uuid
    REFERENCES public.platform_crm_products(id) ON DELETE SET NULL,
  plan_ref text,
  title text NOT NULL,
  description text,
  url text NOT NULL,
  amount numeric DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL'::text,
  status text NOT NULL DEFAULT 'sent'::text
    CHECK (status IN ('sent','paid','expired','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_payment_links_conversation
  ON public.platform_crm_payment_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_payment_links_lead
  ON public.platform_crm_payment_links(lead_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_payment_links_product
  ON public.platform_crm_payment_links(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_crm_payment_links_created_at
  ON public.platform_crm_payment_links(created_at);

-- Trigger updated_at (reusa helper já existente do schema principal)
DROP TRIGGER IF EXISTS trg_platform_crm_payment_links_updated_at
  ON public.platform_crm_payment_links;
CREATE TRIGGER trg_platform_crm_payment_links_updated_at
  BEFORE UPDATE ON public.platform_crm_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

-- RLS super_admin-only + GRANTs (mesmo padrão de todas as platform_crm_*)
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_payment_links'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 1 tabela nova (platform_crm_payment_links), RLS super_admin-only.
-- platform_crm_tasks NÃO tocada (já existe e atende a UI).
-- ─────────────────────────────────────────────────────────────────────────────
