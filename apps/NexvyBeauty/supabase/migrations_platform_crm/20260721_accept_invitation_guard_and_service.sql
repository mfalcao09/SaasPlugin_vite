-- ─────────────────────────────────────────────────────────────────────────────
-- 20260721_accept_invitation_guard_and_service.sql
-- ACHADO B3 ITEM 1 da auditoria de prontidão GO LIVE (fix/funil-fluidez-pre-ads).
-- Este arquivo é o registro versionado da migration — o orquestrador aplica via
-- apply_migration. NÃO aplicar isolado: é a parte A de um PACOTE (A+B+C) que só é
-- seguro deployado junto (migration + Edge accept-invite + diff de AcceptInvite.tsx).
--
-- O QUE ESTAVA ABERTO (exploit vivo — escalonamento de privilégio cross-tenant)
-- `public.accept_invitation(invitation_token text, user_id uuid)` é SECURITY DEFINER
-- e EXECUTÁVEL POR `anon` (a chave pública do bundle). A função NUNCA lê auth.uid():
-- `user_id` é um parâmetro LIVRE. Qualquer sessão (ou o próprio anon) que tenha UM
-- token pendente qualquer + o uuid de uma VÍTIMA fazia:
--   · UPDATE profiles SET organization_id = <org do atacante> WHERE id = <uuid_vitima>
--     → sequestra a vítima para outra organização;
--   · INSERT INTO user_roles (<uuid_vitima>, <role do convite>) → injeta papel.
-- Buraco secundário: não havia checagem de que o e-mail do convite bate com quem
-- aceita — qualquer logado com o token entrava numa org à qual não foi convidado, e
-- um admin abrindo o próprio link consumia o convite / mexia no próprio papel (footgun).
--
-- O FIX (duas funções)
-- 1) accept_invitation vira GUARDADA — serve SÓ o fluxo LOGADO:
--    · GUARD 1: exige sessão (auth.uid() não nulo) e só permite vincular o PRÓPRIO
--      caller (auth.uid() = user_id);
--    · GUARD 2: o convite é endereçado a um e-mail; o caller precisa ser dono dele
--      (lower(email do auth.users do caller) = lower(inv.email));
--    · garante a linha em profiles via INSERT ... ON CONFLICT DO NOTHING (NÃO há
--      trigger em auth.users — profiles não é auto-criado);
--    · REVOKE de anon (defense-in-depth: o guard já bloqueia, mas anon nunca precisa).
-- 2) accept_invitation_service(p_token, p_user_id, p_email) — binding ATÔMICO restrito
--    a service_role, usado SÓ pela Edge `accept-invite` (fluxo signup-e-aceite, onde o
--    cliente ainda não tem sessão). Valida lower(p_email)=lower(inv.email) como
--    defense-in-depth (a Edge já checou). REVOKE de PUBLIC/anon/authenticated;
--    GRANT só a service_role.
--
-- POR QUE NÃO DEPENDE DO TOGGLE DE CONFIRMAÇÃO DE E-MAIL
-- O cadastro-e-aceite deixa de fazer signUp no cliente e passa pela Edge (service_role),
-- que cria o usuário com email_confirm:true e faz o vínculo atômico. Assim a segurança
-- não fica acoplada ao mailer_autoconfirm (um toggle de dashboard). Ver Artefato B/C.
--
-- COLUNAS/ASSINATURAS CONFERIDAS EM PRODUÇÃO (fzhlbwhdejumkyqosuvq, 2026-07-21)
--   · profiles: id/email/full_name NOT NULL (INSERT fornece os três); is_active default true.
--   · team_invitations: email/role/organization_id NOT NULL, squad_id nullable.
--   · user_roles(user_id, role) / squad_members(squad_id, user_id, role) — INSERTs 1:1 com o corpo original.
--   · initialize_user_permissions(p_user_id uuid, p_organization_id uuid, p_role text) RETURNS void.
--   · accept_invitation hoje tem EXECUTE para anon/authenticated/service_role (exploit real).
--
-- PROVA A COLHER APÓS APLICAR (binária)
--   · SELECT public.accept_invitation('<token 32+>', gen_random_uuid()) em contexto anon/no-uid
--     → RAISE not_authorized (antes: rodava e mexia em profiles).
--   · has_function_privilege('anon','public.accept_invitation(text,uuid)','EXECUTE')                     → false
--   · has_function_privilege('anon','public.accept_invitation_service(text,uuid,text)','EXECUTE')         → false
--   · has_function_privilege('authenticated','public.accept_invitation_service(text,uuid,text)','EXECUTE') → false
--   · has_function_privilege('service_role','public.accept_invitation_service(text,uuid,text)','EXECUTE')  → true
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Função guardada — SOMENTE fluxo logado
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
  -- GUARD 1: exige sessão autenticada e só permite vincular o PRÓPRIO caller
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

  -- GUARD 2: o convite é endereçado a um e-mail; o caller precisa ser dono dele
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller;
  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- garante a linha de profile (idempotente; não há trigger em auth.users)
  INSERT INTO profiles (id, email, full_name, is_active)
  VALUES (v_caller, v_caller_email, split_part(v_caller_email, '@', 1), true)
  ON CONFLICT (id) DO NOTHING;

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

-- hardening de superfície: anon nunca precisa desta função (guard já bloqueia, mas revoga defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text, uuid) FROM anon;

-- 2) Binding atômico restrito a service_role (usado SÓ pela Edge accept-invite)
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

  -- e-mail do usuário criado precisa ser o e-mail convidado (defense-in-depth; a Edge já checou)
  IF lower(p_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO profiles (id, email, full_name, is_active)
  VALUES (p_user_id, p_email, split_part(p_email, '@', 1), true)
  ON CONFLICT (id) DO NOTHING;

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
