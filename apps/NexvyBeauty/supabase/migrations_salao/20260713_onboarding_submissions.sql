-- ─────────────────────────────────────────────────────────────────────────────
-- 20260713_onboarding_submissions.sql — PORTE 1:1 do onboarding de implantação
-- Origem (Vendus v5): oficial-vendus-v5/supabase/migrations/
--   • 20260619001042_d22afbd7 → CREATE TABLE + colunas org/products + RPCs v1 + RLS + grants + trigger
--   • 20260619004054_9f8d917d → get_or_create_first_access_onboarding (versão FINAL)
--   • 20260622110109_0e3ac81f → create_onboarding_link intermediária (SUPERSEDED por 113052 — NÃO portada)
--   • 20260622113052_63fdf81d → travas de segurança: colunas first_seen_*/session_token/revoked_*/access_count
--                               + organizations.onboarding_locked + create_onboarding_link(_force_reopen)
--                               + revoke_onboarding_link + validate_onboarding_token público (anon/session)
--                               + save_onboarding_draft_public + submit_onboarding_public
--   • 20260622114552_457247b2 → surgery de DADOS de produção específica de IDs Vendus (NÃO portada)
--
-- Este arquivo consolida o ESTADO FINAL das 4 migrations de schema numa única
-- migration idempotente (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE / DROP POLICY IF EXISTS + CREATE). Pode rodar 2x sem erro.
--
-- DIVERGÊNCIA CONHECIDA (platform_audit_logs): no Beauty a tabela existe mas usa
-- colunas entity_type/entity_id (não organization_id como no Vendus). Os INSERTs de
-- auditoria abaixo foram mantidos 1:1 do Vendus e já vivem dentro de blocos
-- `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;` — logo NÃO quebram a RPC, mas
-- ficam como no-op silencioso até adaptação. Ver relatório de porte.
-- Destino: NexvyBeauty · Supabase fzhlbwhdejumkyqosuvq
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================
-- 1. Colunas novas em organizations
--    (Beauty já tem `address`; instagram/website/onboarding_* faltam)
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_locked boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Colunas novas em products (defensivo — category/short_description
--    já existem no Beauty; custom_info é novo)
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS custom_info text;

-- ============================================================
-- 3. Backfill: orgs com onboarding_completed_at viram locked
--    (Vendus 20260622113052 linhas 20-22; no-op num Beauty recém-migrado)
-- ============================================================
UPDATE public.organizations
   SET onboarding_locked = true
 WHERE onboarding_completed_at IS NOT NULL AND onboarding_locked = false;

-- ============================================================
-- 4. Tabela onboarding_submissions
--    (colunas v1 + travas do 20260622113052 já MESCLADAS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash text UNIQUE,
  mode text NOT NULL CHECK (mode IN ('link','first_access')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','applied','expired')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_ip text,
  user_agent text,
  applied_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  expires_at timestamptz,
  consumed_at timestamptz,
  submitted_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Travas de segurança (Vendus 20260622113052 linhas 7-14)
  first_seen_at timestamptz,
  first_seen_ip text,
  first_seen_ua text,
  session_token text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  access_count integer NOT NULL DEFAULT 0
);

-- Defensivo: se a tabela já existir de uma execução anterior (só com colunas v1),
-- garante as colunas de trava também (idempotência total).
ALTER TABLE public.onboarding_submissions
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_seen_ip text,
  ADD COLUMN IF NOT EXISTS first_seen_ua text,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_org ON public.onboarding_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_status ON public.onboarding_submissions(status);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_submissions TO authenticated;
GRANT ALL ON public.onboarding_submissions TO service_role;

ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Apenas super admins têm acesso direto; demais operam via RPCs SECURITY DEFINER.
DROP POLICY IF EXISTS "super_admin_all_onboarding" ON public.onboarding_submissions;
CREATE POLICY "super_admin_all_onboarding"
  ON public.onboarding_submissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Admin da org pode ler suas próprias submissions (para o wizard interno)
DROP POLICY IF EXISTS "org_admin_select_own_onboarding" ON public.onboarding_submissions;
CREATE POLICY "org_admin_select_own_onboarding"
  ON public.onboarding_submissions FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.touch_onboarding_submissions()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_onboarding_submissions ON public.onboarding_submissions;
CREATE TRIGGER trg_touch_onboarding_submissions
  BEFORE UPDATE ON public.onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_onboarding_submissions();

-- ============================================================
-- 5. RPCs SECURITY DEFINER (estado FINAL)
-- ============================================================

-- ------------------------------------------------------------
-- create_onboarding_link (Super Admin) — versão FINAL com _force_reopen
-- Origem: Vendus 20260622113052 linhas 28-99 (supersede v1 e a 20260622110109)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_onboarding_link(uuid, integer);
DROP FUNCTION IF EXISTS public.create_onboarding_link(uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.create_onboarding_link(
  _organization_id uuid,
  _ttl_days integer DEFAULT 7,
  _force_reopen boolean DEFAULT false
) RETURNS TABLE(submission_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  _token text;
  _hash text;
  _exp timestamptz;
  _sid uuid;
  _org public.organizations%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _ttl_days IS NULL OR _ttl_days < 1 OR _ttl_days > 30 THEN
    _ttl_days := 7;
  END IF;

  SELECT * INTO _org FROM public.organizations WHERE id = _organization_id;
  IF _org.id IS NULL THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  -- Empresa já configurada exige force_reopen
  IF (_org.onboarding_completed_at IS NOT NULL OR _org.onboarding_locked) AND NOT _force_reopen THEN
    RAISE EXCEPTION 'org_already_onboarded';
  END IF;

  -- Revoga submissions abertas pré-existentes para a mesma org
  UPDATE public.onboarding_submissions
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE organization_id = _organization_id
     AND status IN ('draft','submitted')
     AND revoked_at IS NULL;

  -- Se for reabertura forçada, destrava a organização
  IF _force_reopen THEN
    UPDATE public.organizations
       SET onboarding_locked = false
     WHERE id = _organization_id;
  END IF;

  _token := encode(extensions.gen_random_bytes(32), 'base64');
  _token := replace(replace(replace(_token, '+', '-'), '/', '_'), '=', '');
  _hash  := encode(extensions.digest(_token, 'sha256'), 'hex');
  _exp   := now() + (_ttl_days || ' days')::interval;

  INSERT INTO public.onboarding_submissions(
    organization_id, token_hash, mode, status, expires_at, created_by
  ) VALUES (
    _organization_id, _hash, 'link', 'draft', _exp, auth.uid()
  ) RETURNING id INTO _sid;

  -- Audit — adaptado ao schema do Beauty (platform_audit_logs usa entity_type/entity_id,
  -- não organization_id). Bloco tolerante mantido como defesa em profundidade.
  BEGIN
    INSERT INTO public.platform_audit_logs(action, actor_id, entity_type, entity_id, metadata)
    VALUES ('onboarding_link_created', auth.uid(), 'organization', _organization_id,
            jsonb_build_object('submission_id', _sid, 'ttl_days', _ttl_days, 'force_reopen', _force_reopen));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT _sid, _token, _exp;
END $$;

GRANT EXECUTE ON FUNCTION public.create_onboarding_link(uuid, integer, boolean) TO authenticated;

-- ------------------------------------------------------------
-- revoke_onboarding_link (Super Admin)
-- Origem: Vendus 20260622113052 linhas 104-130
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_onboarding_link(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _row public.onboarding_submissions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _row FROM public.onboarding_submissions WHERE id = _submission_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  UPDATE public.onboarding_submissions
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _submission_id;

  -- Audit — adaptado ao schema do Beauty (entity_type/entity_id). Bloco tolerante mantido.
  BEGIN
    INSERT INTO public.platform_audit_logs(action, actor_id, entity_type, entity_id, metadata)
    VALUES ('onboarding_link_revoked', auth.uid(), 'organization', _row.organization_id,
            jsonb_build_object('submission_id', _submission_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.revoke_onboarding_link(uuid) TO authenticated;

-- ------------------------------------------------------------
-- validate_onboarding_token (público — sem login) — versão FINAL
-- Trava no primeiro acesso e retorna session_token.
-- Origem: Vendus 20260622113052 linhas 136-203 (supersede v1)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.validate_onboarding_token(text);
DROP FUNCTION IF EXISTS public.validate_onboarding_token(text, text, text, text);

CREATE OR REPLACE FUNCTION public.validate_onboarding_token(
  _token text,
  _session_token text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
) RETURNS TABLE(
  submission_id uuid,
  organization_id uuid,
  payload jsonb,
  status text,
  session_token text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  _hash text;
  _row public.onboarding_submissions%ROWTYPE;
  _org public.organizations%ROWTYPE;
  _new_session text;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO _row FROM public.onboarding_submissions WHERE token_hash = _hash;

  IF _row.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN RAISE EXCEPTION 'expired_token'; END IF;
  IF _row.status = 'applied' THEN RAISE EXCEPTION 'already_applied'; END IF;
  IF _row.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'expired_token'; END IF;

  SELECT * INTO _org FROM public.organizations WHERE id = _row.organization_id;
  IF _org.id IS NULL THEN RAISE EXCEPTION 'org_not_found'; END IF;
  IF _org.onboarding_completed_at IS NOT NULL OR _org.onboarding_locked THEN
    RAISE EXCEPTION 'already_applied';
  END IF;

  -- Lock no primeiro acesso
  IF _row.first_seen_at IS NULL THEN
    _new_session := encode(extensions.gen_random_bytes(24), 'hex');
    UPDATE public.onboarding_submissions
       SET first_seen_at = now(),
           first_seen_ip = _ip,
           first_seen_ua = _ua,
           session_token = _new_session,
           access_count = access_count + 1
     WHERE id = _row.id;
    _row.session_token := _new_session;
  ELSE
    -- Acessos subsequentes precisam do session_token correto
    IF _session_token IS NULL OR _session_token <> _row.session_token THEN
      RAISE EXCEPTION 'link_already_in_use';
    END IF;
    UPDATE public.onboarding_submissions
       SET access_count = access_count + 1
     WHERE id = _row.id;
  END IF;

  RETURN QUERY SELECT _row.id, _row.organization_id, _row.payload, _row.status, _row.session_token;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_onboarding_token(text, text, text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- save_onboarding_draft (autosave — via login) — v1, nunca redefinida
-- Origem: Vendus 20260619001042 linhas 155-182
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_onboarding_draft(
  _submission_id uuid,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.onboarding_submissions%ROWTYPE;
  _user_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO _row FROM public.onboarding_submissions WHERE id = _submission_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT p.organization_id INTO _user_org FROM public.profiles p WHERE p.id = auth.uid();
  IF _user_org IS NULL OR _user_org <> _row.organization_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _row.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'locked';
  END IF;

  UPDATE public.onboarding_submissions
     SET payload = _payload, status = 'draft'
   WHERE id = _submission_id;
END $$;

GRANT EXECUTE ON FUNCTION public.save_onboarding_draft(uuid, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- save_onboarding_draft_public (token + session_token)
-- Origem: Vendus 20260622113052 linhas 208-242
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_onboarding_draft_public(
  _token text,
  _session_token text,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  _hash text;
  _row public.onboarding_submissions%ROWTYPE;
  _org public.organizations%ROWTYPE;
BEGIN
  IF _token IS NULL OR _session_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO _row FROM public.onboarding_submissions WHERE token_hash = _hash;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN RAISE EXCEPTION 'expired_token'; END IF;
  IF _row.status NOT IN ('draft') THEN RAISE EXCEPTION 'locked'; END IF;
  IF _row.session_token IS NULL OR _row.session_token <> _session_token THEN
    RAISE EXCEPTION 'link_already_in_use';
  END IF;

  SELECT * INTO _org FROM public.organizations WHERE id = _row.organization_id;
  IF _org.onboarding_completed_at IS NOT NULL OR _org.onboarding_locked THEN
    RAISE EXCEPTION 'already_applied';
  END IF;

  UPDATE public.onboarding_submissions
     SET payload = _payload, status = 'draft'
   WHERE id = _row.id;
END $$;

GRANT EXECUTE ON FUNCTION public.save_onboarding_draft_public(text, text, jsonb) TO anon, authenticated;

-- ------------------------------------------------------------
-- get_or_create_first_access_onboarding — versão FINAL
-- Origem: Vendus 20260619004054 linhas 1-31 (supersede v1)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_first_access_onboarding()
RETURNS TABLE(submission_id uuid, organization_id uuid, payload jsonb, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _row public.onboarding_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT p.organization_id INTO _org FROM public.profiles p WHERE p.id = auth.uid();
  IF _org IS NULL THEN RAISE EXCEPTION 'no_org'; END IF;

  SELECT os.* INTO _row
    FROM public.onboarding_submissions os
   WHERE os.organization_id = _org
     AND os.status IN ('draft','submitted')
   ORDER BY os.created_at DESC LIMIT 1;

  IF _row.id IS NULL THEN
    INSERT INTO public.onboarding_submissions(organization_id, mode, status, created_by)
    VALUES (_org, 'first_access', 'draft', auth.uid())
    RETURNING * INTO _row;
  END IF;

  RETURN QUERY SELECT _row.id, _row.organization_id, _row.payload, _row.status;
END $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_first_access_onboarding() TO authenticated;

-- ------------------------------------------------------------
-- submit_onboarding (marca submitted — via login) — v1, nunca redefinida
-- Origem: Vendus 20260619001042 linhas 218-242
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_onboarding(
  _submission_id uuid,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.onboarding_submissions%ROWTYPE;
  _user_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO _row FROM public.onboarding_submissions WHERE id = _submission_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT p.organization_id INTO _user_org FROM public.profiles p WHERE p.id = auth.uid();
  IF _user_org <> _row.organization_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.onboarding_submissions
     SET status = 'submitted',
         submitted_by = auth.uid(),
         submitted_at = now(),
         submitted_ip = _ip,
         user_agent = _ua,
         consumed_at = COALESCE(consumed_at, now())
   WHERE id = _submission_id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_onboarding(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- submit_onboarding_public (token + session_token)
-- Origem: Vendus 20260622113052 linhas 247-288
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_onboarding_public(
  _token text,
  _session_token text,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
) RETURNS TABLE(submission_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  _hash text;
  _row public.onboarding_submissions%ROWTYPE;
  _org public.organizations%ROWTYPE;
BEGIN
  IF _token IS NULL OR _session_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO _row FROM public.onboarding_submissions WHERE token_hash = _hash;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN RAISE EXCEPTION 'expired_token'; END IF;
  IF _row.status NOT IN ('draft') THEN RAISE EXCEPTION 'locked'; END IF;
  IF _row.session_token IS NULL OR _row.session_token <> _session_token THEN
    RAISE EXCEPTION 'link_already_in_use';
  END IF;

  SELECT * INTO _org FROM public.organizations WHERE id = _row.organization_id;
  IF _org.onboarding_completed_at IS NOT NULL OR _org.onboarding_locked THEN
    RAISE EXCEPTION 'already_applied';
  END IF;

  UPDATE public.onboarding_submissions
     SET status = 'submitted',
         submitted_at = now(),
         submitted_ip = _ip,
         user_agent = _ua,
         consumed_at = COALESCE(consumed_at, now())
   WHERE id = _row.id;

  RETURN QUERY SELECT _row.id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_onboarding_public(text, text, text, text) TO anon, authenticated;
