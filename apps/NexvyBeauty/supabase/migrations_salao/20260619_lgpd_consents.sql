-- ============================================================================
-- Prova de consentimento LGPD (Lei 13.709/2018) — tabela de AUDITORIA imutável.
-- Registra, no opt-in afirmativo, a prova jurídica do consentimento: identidade
-- do titular, timestamp do servidor, IP, user-agent, versao/texto exato aceito e
-- geolocalizacao aproximada (derivada do IP). Gravada SOMENTE server-side
-- (Edge Function capture-lead, service_role). Imutavel: sem UPDATE/DELETE no app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,                                 -- sales_leads.id (quando houver)
  email text,                                   -- identidade do titular
  scope text NOT NULL DEFAULT 'lead_capture',   -- onde o consentimento foi dado
  accepted boolean NOT NULL DEFAULT true,
  terms_version text,                           -- versao dos Termos de Uso aceitos
  privacy_version text,                         -- versao da Politica de Privacidade
  consent_text text,                            -- TEXTO EXATO exibido ao titular
  ip text,                                      -- IP de origem (x-forwarded-for)
  user_agent text,
  country text,
  region text,
  city text,
  metadata jsonb DEFAULT '{}'::jsonb,           -- referrer, landing_page, etc.
  created_at timestamptz NOT NULL DEFAULT now() -- timestamp do servidor (fonte de verdade)
);
CREATE INDEX IF NOT EXISTS idx_lgpd_consents_email ON public.lgpd_consents(lower(email));
CREATE INDEX IF NOT EXISTS idx_lgpd_consents_lead ON public.lgpd_consents(lead_id);

ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
-- Auditoria: super admin lê. Sem policy de UPDATE/DELETE -> imutavel pela app.
CREATE POLICY "super admin reads lgpd_consents" ON public.lgpd_consents
  FOR SELECT USING (is_super_admin(auth.uid()));

-- INSERT apenas via service_role (Edge Function). authenticated só pode SELECT
-- (e a RLS restringe ao super admin). Sem GRANT de UPDATE/DELETE = imutavel.
GRANT SELECT ON public.lgpd_consents TO authenticated;
GRANT SELECT, INSERT ON public.lgpd_consents TO service_role;
