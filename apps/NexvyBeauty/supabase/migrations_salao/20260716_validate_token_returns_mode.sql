-- ============================================================================
-- ESTEIRA (front) — validate_onboarding_token passa a devolver `mode`.
--
-- O wizard público por token (rota /implantacao/:token) precisa discriminar a
-- Esteira de Demonstração (mode='demo') do onboarding pago (mode='link'/
-- 'first_access') — decisão D2 do blueprint ("wizard discrimina por mode").
-- Hoje o RPC NÃO devolve `mode`; o front cai sempre no wizard pago.
--
-- Mudança ADITIVA: uma coluna nova no RETURNS TABLE. Trocar o tipo de retorno
-- exige DROP + CREATE (não dá CREATE OR REPLACE com colunas diferentes); é
-- atômico dentro da transação da migration — chamadas concorrentes veem a versão
-- antiga OU a nova, nunca ausente. O corpo é idêntico ao vigente, só some `mode`
-- no SELECT final. Callers existentes (useImplantacao) leem por nome de coluna →
-- adicionar coluna é seguro.
-- ============================================================================

drop function if exists public.validate_onboarding_token(text, text, text, text);

create function public.validate_onboarding_token(
  _token text,
  _session_token text default null::text,
  _ip text default null::text,
  _ua text default null::text
)
returns table(
  submission_id uuid,
  organization_id uuid,
  payload jsonb,
  status text,
  session_token text,
  mode text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    IF _session_token IS NULL OR _session_token <> _row.session_token THEN
      RAISE EXCEPTION 'link_already_in_use';
    END IF;
    UPDATE public.onboarding_submissions
       SET access_count = access_count + 1
     WHERE id = _row.id;
  END IF;

  RETURN QUERY SELECT _row.id, _row.organization_id, _row.payload, _row.status, _row.session_token, _row.mode;
END $function$;
