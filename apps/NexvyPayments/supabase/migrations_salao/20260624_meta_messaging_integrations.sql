-- ============================================================================
-- Meta Messaging (Instagram Direct + Messenger) — storage seguro por tenant
-- Bloco 3 do plano docs/plano-ig-messenger-inbox-2026-06-24.md
--
-- PRINCÍPIOS (CLAUDE.md Seção 11 — segurança SaaS):
--   * O Page access token é SEGREDO por-tenant -> Supabase Vault, NUNCA plaintext.
--     (corrige a dívida de facebook_lead_integrations.page_access_token em texto puro).
--   * A tabela guarda só um PONTEIRO (token_vault_key) para o segredo no Vault.
--     O token só é decifrável via RPC SECURITY DEFINER restrita a service_role.
--   * App Secret e Verify Token são do APP NEXVY inteiro (não por-tenant) ->
--     vivem como env var da edge function (META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN),
--     não como coluna aqui. O HMAC X-Hub-Signature-256 usa o app secret único.
--
-- MODELO: 1 linha por PÁGINA conectada (1 conexão OAuth = 1 token). A MESMA Página
--   serve Messenger (webhook object=page) e Instagram (object=instagram), por isso
--   flags messenger_enabled / instagram_enabled em vez de 1 linha por canal.
-- ============================================================================

-- 0. Vault (idempotente; no Supabase já costuma vir habilitado)
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 1. TABELA: conexões Meta Messaging por organização (tenant)
CREATE TABLE IF NOT EXISTS public.meta_messaging_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Página do Facebook conectada (chave de roteamento do webhook Messenger)
  page_id text NOT NULL,
  page_name text,

  -- Conta profissional do Instagram ligada à Página (nullable: só se IG conectado).
  -- É a chave de roteamento do webhook Instagram (entry[].id == este id).
  instagram_business_account_id text,
  instagram_username text,

  -- Quais canais esta conexão atende (uma Página pode ter os dois)
  messenger_enabled boolean NOT NULL DEFAULT false,
  instagram_enabled boolean NOT NULL DEFAULT false,

  -- Ponteiro para o segredo no Vault (NUNCA o token em si).
  -- Convenção do nome: 'meta_page_token:' || organization_id || ':' || page_id
  token_vault_key text NOT NULL,

  -- Auditoria do que foi subscrito via POST /{page_id}/subscribed_apps
  subscribed_fields text[] NOT NULL DEFAULT '{}',

  is_active boolean NOT NULL DEFAULT true,
  connected_by uuid,                 -- profiles.id que conectou (observabilidade)
  token_expires_at timestamptz,      -- long-lived ~60d; renovar antes
  last_inbound_at timestamptz,
  last_error text,                   -- último erro de envio/refresh (observabilidade)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (organization_id, page_id)
);

-- Índices de roteamento do webhook: cada id resolve a NO MÁXIMO 1 conexão ativa
-- (determinismo: webhook não pode ficar ambíguo entre dois tenants).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mmi_page_active
  ON public.meta_messaging_integrations(page_id) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mmi_ig_active
  ON public.meta_messaging_integrations(instagram_business_account_id)
  WHERE is_active AND instagram_business_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mmi_org
  ON public.meta_messaging_integrations(organization_id);

-- 2. RLS: tenant gerencia só a própria org; super admin gerencia tudo.
--    Mesmo com SELECT liberado, o token NÃO está na tabela (está no Vault) —
--    token_vault_key é apenas um nome, não o segredo.
ALTER TABLE public.meta_messaging_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manages own meta integrations"
  ON public.meta_messaging_integrations
  FOR ALL
  USING (organization_id = get_user_organization(auth.uid()))
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "super admin manages all meta integrations"
  ON public.meta_messaging_integrations
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

GRANT ALL ON public.meta_messaging_integrations TO authenticated, service_role;

-- 3. RPCs do Vault (SECURITY DEFINER) — escrita/leitura de segredo SÓ via service_role.
--    O frontend (authenticated/anon) NUNCA consegue decifrar o token.

-- 3a. set_meta_secret: cria ou atualiza um segredo no Vault por nome. Retorna o id.
CREATE OR REPLACE FUNCTION public.set_meta_secret(p_key text, p_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_key;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_value, p_key, 'Meta messaging secret (managed by NexvyBeauty app)');
  ELSE
    PERFORM vault.update_secret(v_id, p_value);
  END IF;
  RETURN v_id;
END;
$$;

-- 3b. get_vault_secret_by_key: decifra um segredo do Vault pelo nome.
CREATE OR REPLACE FUNCTION public.get_vault_secret_by_key(p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_key LIMIT 1;
$$;

-- 3c. delete_meta_secret: remove segredo (usado ao desconectar a Página).
CREATE OR REPLACE FUNCTION public.delete_meta_secret(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = p_key;
END;
$$;

-- Gating duro: revoga de todos e concede SÓ a service_role (edge functions server-side).
REVOKE ALL ON FUNCTION public.set_meta_secret(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vault_secret_by_key(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_meta_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_meta_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vault_secret_by_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_meta_secret(text) TO service_role;

COMMENT ON TABLE public.meta_messaging_integrations IS
  'Conexões Meta Messaging (Instagram Direct + Messenger) por tenant. Token de Página no Vault (token_vault_key), nunca plaintext. App secret/verify token são env globais da edge function.';
