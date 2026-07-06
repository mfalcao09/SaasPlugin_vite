-- ============================================================================
-- Impersonação multi-empresa para super admin (Rota A — espelha o Intentus).
-- O super admin "opera como" qualquer empresa mudando o PRÓPRIO
-- profiles.organization_id; a RLS (get_user_organization) propaga sozinha.
-- Aqui: uma RPC GATED por is_super_admin (mais seguro que update direto) +
-- a referência da empresa master em platform_settings.
-- ============================================================================

-- 1. Qual é a "Empresa Master" desta instalação (referência p/ exit/Empresa Master)
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS master_organization_id uuid;

-- 2. RPC: define a empresa ativa do super admin (impersonar / voltar à master).
--    SECURITY DEFINER + gate is_super_admin: só super admin troca de empresa.
CREATE OR REPLACE FUNCTION public.set_active_organization(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admin pode trocar de empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Empresa inexistente';
  END IF;
  UPDATE public.profiles SET organization_id = p_org_id, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_organization(uuid) TO authenticated;
