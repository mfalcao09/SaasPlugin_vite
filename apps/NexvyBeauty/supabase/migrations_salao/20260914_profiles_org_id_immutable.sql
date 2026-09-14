-- ============================================================================
-- 20260914_profiles_org_id_immutable.sql
--
-- Fecha escalação cross-tenant: policy "Users can update their own profile"
-- (id = auth.uid()) + GRANT UPDATE em organization_id permitia
--   UPDATE profiles SET organization_id = <outra_org> WHERE id = auth.uid();
-- e a RLS org-scoped (get_user_organization) seguia a org sequestrada.
--
-- Camadas:
--   A) trigger BEFORE UPDATE OF organization_id — bloqueia troca não autorizada
--   B) REVOKE UPDATE (organization_id) FROM authenticated/anon
--
-- Caminhos legítimos:
--   · set_active_organization (super_admin) — is_super_admin(auth.uid())
--   · accept_invitation / accept_invitation_service — GUC app.allow_org_id_change
--   · service_role / postgres / supabase_admin (Edge admin client)
--
-- Check binário (após aplicar):
--   · authenticated NÃO tem privilege UPDATE em profiles.organization_id
--   · trigger trg_profiles_org_id_guard existe
--   · set_active_organization (SA) e accept_invitation* continuam funcionando
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_profiles_org_id_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allow text;
  v_jwt_role text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  -- Impersonação / SA direto
  IF auth.uid() IS NOT NULL AND public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- RPCs de convite (set_config local à transação)
  v_allow := nullif(current_setting('app.allow_org_id_change', true), '');
  IF v_allow = '1' THEN
    RETURN NEW;
  END IF;

  -- Edge admin (service_role) e owners
  v_jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF v_jwt_role = 'service_role'
     OR current_user IN ('service_role', 'supabase_admin', 'postgres')
     OR session_user IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'profiles.organization_id is immutable for this caller'
    USING ERRCODE = '42501',
          HINT = 'Use set_active_organization (super_admin) or invitation/provisioning RPCs.';
END;
$function$;

COMMENT ON FUNCTION public.enforce_profiles_org_id_immutable() IS
  'Bloqueia UPDATE de profiles.organization_id fora de SA / convite (GUC) / service_role. 2026-09-14.';

DROP TRIGGER IF EXISTS trg_profiles_org_id_guard ON public.profiles;
CREATE TRIGGER trg_profiles_org_id_guard
  BEFORE UPDATE OF organization_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profiles_org_id_immutable();

-- Camada B: GRANT UPDATE na TABELA inclui todas as colunas — REVOKE só da
-- coluna organization_id NÃO remove o privilégio de tabela. Revoga UPDATE
-- da tabela e re-concede colunas seguras (sem id / organization_id / created_at).
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
REVOKE UPDATE ON TABLE public.profiles FROM anon;
GRANT UPDATE (
  full_name, email, avatar_url, phone, is_active, updated_at,
  booking_slug, booking_bio, recovery_whatsapp,
  work_start_time, work_end_time, farewell_message,
  default_theme, default_menu_state, default_connection_id,
  guided_onboarding_completed_at, guided_onboarding_skipped_at
) ON public.profiles TO authenticated;

-- Convites: marcar GUC antes do UPDATE (auth.uid() é o convidado, não SA)
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text, user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  v_caller uuid := auth.uid();
  v_caller_email text;
BEGIN
  IF v_caller IS NULL OR v_caller <> user_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO inv FROM team_invitations
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > now();

  IF inv IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller;
  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO profiles (id, email, full_name, is_active)
  VALUES (v_caller, v_caller_email, split_part(v_caller_email, '@', 1), true)
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.allow_org_id_change', '1', true);
  UPDATE profiles SET organization_id = inv.organization_id WHERE id = user_id;

  INSERT INTO user_roles (user_id, role)
  VALUES (user_id, inv.role) ON CONFLICT DO NOTHING;

  IF inv.squad_id IS NOT NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (inv.squad_id, user_id, 'member') ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.initialize_user_permissions(user_id, inv.organization_id, inv.role::text);

  UPDATE team_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation_service(p_token text, p_user_id uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM team_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF inv IS NULL THEN
    RETURN FALSE;
  END IF;

  IF lower(p_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO profiles (id, email, full_name, is_active)
  VALUES (p_user_id, p_email, split_part(p_email, '@', 1), true)
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.allow_org_id_change', '1', true);
  UPDATE profiles SET organization_id = inv.organization_id WHERE id = p_user_id;

  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, inv.role) ON CONFLICT DO NOTHING;

  IF inv.squad_id IS NOT NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (inv.squad_id, p_user_id, 'member') ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.initialize_user_permissions(p_user_id, inv.organization_id, inv.role::text);

  UPDATE team_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_invitation_service(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation_service(text, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text, uuid) FROM anon;
