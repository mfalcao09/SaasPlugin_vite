-- ============================================================================
-- LGPD MÍNIMO + AUDITORIA DE PII no módulo de cobrança (NexvyPayments) ─ E2.
-- Esteira NOVA e ISOLADA `migrations_cobranca/` (hard fork §0). SÓ CREATE de
-- objetos NOVOS. ZERO ALTER/DROP em tabela do core Vendus/Beauty. A base de
-- dados de cobrança (payers/invoices/...) já existe (migration billing_model);
-- aqui só ANEXAMOS a camada de conformidade — trigger de auditoria, função de
-- anonimização (direito ao esquecimento) e o registro de base legal por tenant.
--
-- MOLDE seguido (read-only, citado):
--   • Estilo de FUNÇÃO org-scoped + SECURITY DEFINER + `set search_path=public`
--     + `revoke all ... from public, anon` + `grant execute ... to authenticated`:
--     apps/NexvyBeauty/supabase/migrations_salao/20260624_merge_clientes_rpc.sql:8-54
--     (mesma máxima de tenant scoping: org do chamador = profiles.organization_id
--     WHERE id = auth.uid(); raise exception fora do escopo). Chamada do front via
--     supabase.rpc(...) — mesma convenção do molde (linha :5).
--   • Estilo de tabela de AUDITORIA/prova LGPD (comentário denso, RLS, GRANT
--     seletivo, imutável pela app):
--     apps/NexvyBeauty/supabase/migrations_salao/20260619_lgpd_consents.sql:9-38.
--   • RLS org-scoped (get_user_organization/has_role) e GRANTs: espelha
--     migrations_cobranca/20260706101000_billing_model.sql:68-88,466-472.
--
-- SCHEMA REAL de platform_audit_logs (do core, verificado em
-- src/integrations/supabase/types.ts:8377-8407) — colunas EXATAS usadas aqui:
--   action (text NOT NULL), actor_id (uuid null, FK profiles), entity_type (text),
--   entity_id (text), ip_address (text), metadata (jsonb), created_at, id.
--   NÃO tem organization_id → a org viaja DENTRO de metadata (org_id).
--   NÃO grava PII em claro no log: só a lista de campos tocados + org + ação.
-- ============================================================================


-- ============================================================================
-- 1. LGPD_LEGAL_BASIS — base legal do tratamento, POR TENANT ─ E2 (3)
-- ----------------------------------------------------------------------------
-- Registra a base legal (Art. 7 LGPD) sob a qual o tenant trata os dados dos
-- pagadores. Default 'execucao_contrato' (Art. 7, V — execução de contrato do
-- qual o titular é parte): é a base natural de uma cobrança recorrente. Tabela
-- NOVA e org-scoped em vez de ALTER em `organizations` (core) — mantém o hard
-- fork 100% aditivo. Um registro por org (UNIQUE) = a base vigente do tenant.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lgpd_legal_basis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_legal text NOT NULL DEFAULT 'execucao_contrato'
    CHECK (base_legal IN (
      'execucao_contrato',      -- Art. 7, V — execução de contrato (base padrão da cobrança)
      'obrigacao_legal',        -- Art. 7, II — cumprimento de obrigação legal/regulatória
      'legitimo_interesse',     -- Art. 7, IX — legítimo interesse do controlador
      'consentimento'           -- Art. 7, I — consentimento do titular
    )),
  finalidade text,                                             -- descrição livre da finalidade do tratamento
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Uma base legal vigente por org (registro determinístico do tenant).
  UNIQUE (organization_id)
);
CREATE INDEX IF NOT EXISTS idx_lgpd_legal_basis_org
  ON public.lgpd_legal_basis (organization_id);

ALTER TABLE public.lgpd_legal_basis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view lgpd_legal_basis" ON public.lgpd_legal_basis
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert lgpd_legal_basis" ON public.lgpd_legal_basis
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update lgpd_legal_basis" ON public.lgpd_legal_basis
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage lgpd_legal_basis" ON public.lgpd_legal_basis
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

GRANT ALL ON public.lgpd_legal_basis TO authenticated, service_role;

-- Seed determinístico: toda org existente recebe a base legal padrão da cobrança
-- ('execucao_contrato'). Idempotente (ON CONFLICT no UNIQUE(organization_id)).
INSERT INTO public.lgpd_legal_basis (organization_id, base_legal, finalidade)
SELECT o.id, 'execucao_contrato',
       'Tratamento de dados do pagador para execução de contrato de cobrança recorrente'
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;


-- ============================================================================
-- 2. TRIGGER DE AUDITORIA DE PII em `payers` → platform_audit_logs ─ E2 (1)
-- ----------------------------------------------------------------------------
-- Grava UMA linha em platform_audit_logs a cada INSERT/UPDATE/DELETE em payers.
-- SECURITY DEFINER: o trigger escreve no log de plataforma independentemente das
-- policies de RLS do log (o autor da ação pode não ter GRANT direto de INSERT
-- lá). `set search_path=public` (molde merge_clientes_rpc.sql:12).
--
-- PRIVACIDADE DO PRÓPRIO LOG: NÃO copiamos PII (nome/email/whatsapp/documento)
-- para dentro do log. Gravamos só: a ação, a org, o payer afetado (entity_id) e,
-- no UPDATE, a LISTA de campos de PII que mudaram (chaves, não valores) + a flag
-- de anonimização quando o registro foi apagado logicamente por payer_erasure.
-- action semântica: 'payer.created' | 'payer.updated' | 'payer.erased'
-- (anonimização) | 'payer.pii_changed' (update tocou PII) | 'payer.deleted'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_payers_pii()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action    text;
  v_org       uuid;
  v_entity    uuid;
  v_changed   text[] := ARRAY[]::text[];
  v_meta      jsonb;
  v_is_erase  boolean := false;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_action := 'payer.created';
    v_org    := NEW.organization_id;
    v_entity := NEW.id;
    v_meta   := jsonb_build_object('op', TG_OP, 'org_id', v_org, 'status', NEW.status);

  ELSIF (TG_OP = 'UPDATE') THEN
    v_org    := NEW.organization_id;
    v_entity := NEW.id;
    -- Detecta quais campos de PII mudaram (grava só as CHAVES, nunca os valores).
    IF (NEW.nome      IS DISTINCT FROM OLD.nome)      THEN v_changed := array_append(v_changed, 'nome');      END IF;
    IF (NEW.email     IS DISTINCT FROM OLD.email)     THEN v_changed := array_append(v_changed, 'email');     END IF;
    IF (NEW.whatsapp  IS DISTINCT FROM OLD.whatsapp)  THEN v_changed := array_append(v_changed, 'whatsapp');  END IF;
    IF (NEW.documento IS DISTINCT FROM OLD.documento) THEN v_changed := array_append(v_changed, 'documento'); END IF;
    IF (NEW.endereco  IS DISTINCT FROM OLD.endereco)  THEN v_changed := array_append(v_changed, 'endereco');  END IF;
    -- Anonimização (direito ao esquecimento) deixa marca em metadata.lgpd_erased_at.
    v_is_erase := (NEW.metadata ? 'lgpd_erased_at')
                  AND NOT (COALESCE(OLD.metadata, '{}'::jsonb) ? 'lgpd_erased_at');
    IF v_is_erase THEN
      v_action := 'payer.erased';
    ELSIF array_length(v_changed, 1) IS NOT NULL THEN
      v_action := 'payer.pii_changed';
    ELSE
      v_action := 'payer.updated';
    END IF;
    v_meta := jsonb_build_object(
      'op', TG_OP, 'org_id', v_org,
      'changed_fields', to_jsonb(v_changed),
      'erased', v_is_erase
    );

  ELSE  -- DELETE
    v_action := 'payer.deleted';
    v_org    := OLD.organization_id;
    v_entity := OLD.id;
    v_meta   := jsonb_build_object('op', TG_OP, 'org_id', v_org);
  END IF;

  INSERT INTO public.platform_audit_logs (action, actor_id, entity_type, entity_id, metadata)
  VALUES (v_action, auth.uid(), 'payer', v_entity, v_meta);  -- entity_id é uuid; v_entity já é uuid (sem cast p/ text)

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_payers_pii ON public.payers;
CREATE TRIGGER trg_audit_payers_pii
  AFTER INSERT OR UPDATE OR DELETE ON public.payers
  FOR EACH ROW EXECUTE FUNCTION public.audit_payers_pii();


-- ============================================================================
-- 3. PAYER_ERASURE — direito ao esquecimento (Art. 18, LGPD) ─ E2 (2)
-- ----------------------------------------------------------------------------
-- ANONIMIZA o contato/PII do pagador MAS PRESERVA as faturas/notas fiscais dele
-- INTACTAS (obrigação legal de retenção fiscal — guarda por 5 anos; base legal
-- 'obrigacao_legal', Art. 16, I LGPD). Ou seja: exercer o esquecimento NÃO apaga
-- o histórico financeiro/fiscal — apenas descaracteriza o titular.
--
-- Anonimização aplicada em payers:
--   nome      → '[removido]'
--   email     → NULL
--   whatsapp  → NULL
--   endereco  → '{}'::jsonb (zera dados de endereço da NFS-e futura)
--   documento → 'ANON:' || sha256(documento || org)  (pseudonimização irreversível;
--               mantém a chave natural UNIQUE(org, documento) sem expor o CPF/CNPJ)
--   status    → 'inativo'
--   metadata.lgpd_erased_at → now()  (marca a anonimização; dispara o trigger acima
--               com action 'payer.erased')
--
-- Chamada via supabase.rpc('payer_erasure', { p_payer_id }) — mesma convenção do
-- molde merge_clientes_rpc.sql:5. Molde de função org-scoped SECURITY DEFINER:
-- merge_clientes_rpc.sql:8-54. Tenant scoping idêntico: org do chamador via
-- profiles.organization_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.payer_erasure(p_payer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_payer_org  uuid;
  v_documento  text;
  v_doc_hash   text;
BEGIN
  IF p_payer_id IS NULL THEN
    RAISE EXCEPTION 'payer_id invalido';
  END IF;

  -- Org do chamador (tenant scoping). Se rodar por service_role (Edge Function),
  -- auth.uid() é NULL → v_caller_org NULL → pulamos o gate de org do chamador,
  -- mas o service_role só chega aqui via a Edge Function que já validou o escopo.
  SELECT organization_id INTO v_caller_org FROM public.profiles WHERE id = auth.uid();

  -- Payer precisa existir; e, se houver chamador autenticado, ser da MESMA org.
  SELECT organization_id, documento INTO v_payer_org, v_documento
    FROM public.payers WHERE id = p_payer_id;
  IF v_payer_org IS NULL THEN
    RAISE EXCEPTION 'pagador inexistente';
  END IF;
  IF v_caller_org IS NOT NULL AND v_payer_org <> v_caller_org THEN
    RAISE EXCEPTION 'pagador de outra organizacao';
  END IF;

  -- Pseudonimização irreversível do documento (mantém unicidade sem PII).
  -- pgcrypto vive no schema `extensions` no Supabase e esta função tem
  -- search_path=public → qualificar `extensions.digest` é OBRIGATÓRIO, senão
  -- estoura 42883 na anonimização (mesmo bug que quebrou o wizard Meta em prod:
  -- migrations_salao/20260705_fix_meta_master_key_pgcrypto.sql:5-11,29).
  v_doc_hash := 'ANON:' || encode(
                  extensions.digest(COALESCE(v_documento, '') || v_payer_org::text, 'sha256'),
                  'hex');

  -- Anonimiza SÓ o pagador. NÃO toca invoices/invoice_items (retenção fiscal).
  UPDATE public.payers
     SET nome      = '[removido]',
         email     = NULL,
         whatsapp  = NULL,
         endereco  = '{}'::jsonb,
         documento = v_doc_hash,
         status    = 'inativo',
         metadata  = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object('lgpd_erased_at', to_jsonb(now())),
         updated_at = now()
   WHERE id = p_payer_id;

  RETURN jsonb_build_object(
    'payer_id', p_payer_id,
    'anonymized', true,
    'invoices_retained', (SELECT count(*) FROM public.invoices WHERE payer_id = p_payer_id),
    'erased_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payer_erasure(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.payer_erasure(uuid) TO authenticated, service_role;
