-- ============================================================
-- platform_crm INBOX MOTOR — preparação do motor do inbox
-- (edited_at nas mensagens + leitura pública da config do widget).
-- ============================================================
-- Regras de design (mesmas do 20260701_platform_crm_schema.sql — não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id,
--     SEM product_id / product-scoping.
--   * FKs internas SÓ para platform_crm_* / auth.users (jamais organizations
--     ou profiles do tenant).
--   * RLS super_admin-only via public.has_role — MANTIDA intacta; aqui apenas
--     SOMAMOS uma policy de SELECT anônimo no widget (config pública).
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) edited_at em platform_crm_messages
--    Timestamp da última edição da mensagem pelo agente — habilita o
--    indicador "(editada)" na bolha (paridade 1:1 com o MessageBubble
--    do CRM Vendus). Nullable: NULL = nunca editada.
-- ------------------------------------------------------------
ALTER TABLE public.platform_crm_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ------------------------------------------------------------
-- 2) Leitura PÚBLICA da config do widget (platform_crm_webchat_widgets)
--    O widget embedado no site precisa carregar sua config SEM login.
--    Policy de SELECT para anon filtrada por widget ATIVO. As policies
--    super_admin existentes (FOR ALL) permanecem — policies PERMISSIVE
--    somam (OR), não substituem. Resolve o "TODO política pública do
--    widget" do 20260701_platform_crm_inbox.sql.
-- ------------------------------------------------------------
ALTER TABLE public.platform_crm_webchat_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_crm_webchat_widgets_public_read_active"
  ON public.platform_crm_webchat_widgets;
CREATE POLICY "platform_crm_webchat_widgets_public_read_active"
  ON public.platform_crm_webchat_widgets
  FOR SELECT TO anon
  USING (is_active = true);

-- GRANT necessário para o role anon enxergar a tabela (a RLS acima continua
-- filtrando linha-a-linha; sem o GRANT a policy nunca é avaliada).
GRANT SELECT ON public.platform_crm_webchat_widgets TO anon;

-- ============================================================
-- FIM — 1 coluna (edited_at) + 1 policy pública de SELECT no widget ativo.
-- ============================================================
