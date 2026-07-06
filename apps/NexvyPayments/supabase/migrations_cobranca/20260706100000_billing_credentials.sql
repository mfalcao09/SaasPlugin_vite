-- ============================================================================
-- COFRE de credenciais de cobrança (NexvyPayments) — decisão 2 do blueprint §3
-- (billing_credentials) + NFR §11 do CLAUDE.md (API keys NUNCA no frontend).
--
-- Org-scoped (multi-tenant, organization_id obrigatório). Guarda as credenciais
-- de PROVEDORES de cobrança/fiscal (C6, NotaAS, certificado A1) SEMPRE CIFRADAS
-- em coluna de texto no formato 'v1:'+base64 (AES-256-GCM, envelope do
-- _shared/meta-crypto.ts, byte-idêntico ao herdado do Beauty/Vendus). A coluna
-- `metadata` guarda APENAS dados mascaráveis/não-sigilosos (keyPrefix, subjectCN,
-- validade do A1) — NUNCA o segredo em claro.
--
-- SEGURANÇA (blueprint §3.1 / CLAUDE.md §11.1): esta tabela é a MAIS RESTRITA do
-- domínio. RLS ON e NENHUMA policy permissiva para o client (anon/authenticated).
-- SELECT/ALL negados a todos os papéis de usuário — o acesso é EXCLUSIVO por
-- `service_role` dentro das Edge Functions (o BYPASSRLS do service_role dispensa
-- policy). O front nunca lê esta tabela; recupera só `metadata` (mascarado) via
-- edge function `cobranca-onboarding?action=status`.
--
-- ADITIVA: cria tabela/índice NOVOS. Zero ALTER/DROP em tabela do core.
-- Espelha o estilo de migrations_salao/ (public., IF NOT EXISTS, gen_random_uuid()).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  provider text NOT NULL,                          -- 'c6' | 'notaas' | 'a1_cert'
  cnpj text,                                       -- CNPJ (só dígitos) do emissor associado à credencial
  cred_cifrada text NOT NULL,                       -- 'v1:'+base64 (AES-256-GCM, _shared/meta-crypto.ts) — NUNCA em claro
  metadata jsonb DEFAULT '{}'::jsonb,               -- {keyPrefix, subjectCN, a1_valid_until} — dados MASCARÁVEIS, NUNCA segredo
  status text NOT NULL DEFAULT 'ativo',             -- 'ativo' | 'inativo' | 'revogado'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotência: uma credencial por (org, provider, cnpj). O CNPJ no UNIQUE
  -- permite múltiplos emissores por provider dentro da mesma org (ex.: matriz+filial).
  UNIQUE (organization_id, provider, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_billing_credentials_org
  ON public.billing_credentials (organization_id);

-- RLS: negado ao client (blueprint §3.1 + §256). Habilitada, SEM policy alguma
-- para anon/authenticated. service_role opera por baixo da RLS (BYPASSRLS).
ALTER TABLE public.billing_credentials ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade (NÃO confiar só na RLS): o schema public do Supabase concede
-- SELECT a anon/authenticated via DEFAULT PRIVILEGES do baseline — mesmo sem GRANT explícito
-- aqui, a tabela nasce "SELECT-able" no nível de privilégio (a RLS é que devolve 0 linhas).
-- Para a tabela MAIS sensível do sistema (segredos de C6/NotaAS/A1), revogamos o privilégio
-- herdado explicitamente: se algum dia a RLS for desabilitada por engano, o client ainda
-- não enxerga nada. Só service_role (Edge Functions server-side) opera o cofre.
REVOKE ALL ON public.billing_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_credentials TO service_role;
