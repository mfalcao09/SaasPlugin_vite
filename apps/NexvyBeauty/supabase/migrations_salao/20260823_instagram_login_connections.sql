-- Instagram Login (NEXVY - IGLOG) — conexões org-scoped do tenant app.*.
-- NÃO reusa meta_messaging_integrations: aquela tabela exige page_id NOT NULL
-- (Facebook Page). Instagram Login emite token de usuário IG, sem page_id.

CREATE TABLE IF NOT EXISTS public.instagram_login_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text,
  name text,
  account_type text,
  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  last_error text,
  connected_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, instagram_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ig_login_user_active
  ON public.instagram_login_connections(instagram_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ig_login_org
  ON public.instagram_login_connections(organization_id);

ALTER TABLE public.instagram_login_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manages own instagram login connections"
  ON public.instagram_login_connections
  FOR ALL
  USING (organization_id = get_user_organization(auth.uid()))
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "super admin manages all instagram login connections"
  ON public.instagram_login_connections
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

GRANT ALL ON public.instagram_login_connections TO authenticated, service_role;

COMMENT ON TABLE public.instagram_login_connections IS
  'Instagram Login (Direct) por tenant. Token cifrado (encryptSecret). Sem page_id — não reusar meta_messaging_integrations.';
