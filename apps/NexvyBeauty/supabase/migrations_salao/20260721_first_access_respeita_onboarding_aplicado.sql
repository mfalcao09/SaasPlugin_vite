-- get_or_create_first_access_onboarding: parar de criar wizard vazio para quem
-- JÁ concluiu o onboarding.
--
-- Bug observado em produção (21/07/2026 02:30): a dona terminou o wizard pelo
-- link de implantação (submission mode='link' → status='applied', 02:20:35),
-- criou a senha, entrou no app — e caiu num wizard NOVO, em branco, na etapa 1.
-- Parecia perda de dados. Não era: a org tinha tudo gravado (name/slug/phone).
--
-- Causa: a busca só considerava status IN ('draft','submitted'). Uma submission
-- 'applied' não casava, `_row.id` vinha NULL e o INSERT criava um rascunho novo.
--
-- Dois ajustes:
--   1. 'applied' entra na busca;
--   2. a ordenação PREFERE a applied. Sem isso, a org que já tem um rascunho
--      órfão (criado por esse mesmo bug) continuaria recebendo o rascunho, que
--      é mais recente que a applied.
--
-- Com isso o ImplantacaoWizard recebe status='applied' e renderiza a tela que
-- já existe desde sempre e nunca era alcançada: "Seu espaço já está montado"
-- (ImplantacaoWizard.tsx:276-287).

CREATE OR REPLACE FUNCTION public.get_or_create_first_access_onboarding()
 RETURNS TABLE(submission_id uuid, organization_id uuid, payload jsonb, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     AND os.status IN ('draft','submitted','applied')
   -- 'applied' vence qualquer rascunho: se a implantação já foi aplicada, essa
   -- é a verdade da org — mesmo que exista rascunho mais novo.
   ORDER BY (os.status = 'applied') DESC, os.created_at DESC
   LIMIT 1;

  IF _row.id IS NULL THEN
    INSERT INTO public.onboarding_submissions(organization_id, mode, status, created_by)
    VALUES (_org, 'first_access', 'draft', auth.uid())
    RETURNING * INTO _row;
  END IF;

  RETURN QUERY SELECT _row.id, _row.organization_id, _row.payload, _row.status;
END $function$;
