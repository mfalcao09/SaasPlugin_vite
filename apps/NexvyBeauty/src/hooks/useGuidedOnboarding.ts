import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Controla a exibição do onboarding guiado pós-cadastro para admins de
 * organização. Persiste o estado em
 * profiles.guided_onboarding_completed_at / skipped_at para não depender de
 * localStorage (sobrevive a troca de device).
 *
 * Critério de "primeiro acesso" (módulo-aware): além das flags de profile,
 * consideramos a org sem nenhum módulo ativado ainda
 * (organizations.enabled_modules vazio/null). Assim o wizard que agora compõe
 * a Seleção de Módulos só aparece enquanto o admin não escolheu seus módulos.
 *
 * - `shouldShow`  : compatível com o uso anterior (Index/OnboardingBanner) —
 *                   true enquanto o admin não concluiu nem pulou o onboarding.
 * - `isFirstAccess`: true quando, além disso, a org ainda não ativou módulos.
 *                   É o gatilho do disparo automático no ModuleHub.
 */
export function useGuidedOnboarding() {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [hasEnabledModules, setHasEnabledModules] = useState(false);
  const [checked, setChecked] = useState(false);

  const organizationId = profile?.organization_id ?? null;

  useEffect(() => {
    let active = true;
    async function check() {
      if (!user?.id || !isAdmin()) {
        if (active) setChecked(true);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('guided_onboarding_completed_at, guided_onboarding_skipped_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      const completed = (data as any)?.guided_onboarding_completed_at;
      const skipped = (data as any)?.guided_onboarding_skipped_at;
      setShouldShow(!completed && !skipped);

      // Sinal de "org já configurou módulos" — coluna nova ainda não está em
      // types.ts, então acessamos via cast `as any`.
      if (organizationId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('enabled_modules')
          .eq('id', organizationId)
          .maybeSingle();
        if (!active) return;
        const enabled = (org as any)?.enabled_modules;
        setHasEnabledModules(Array.isArray(enabled) && enabled.length > 0);
      }

      setChecked(true);
    }
    check();
    return () => {
      active = false;
    };
    // isAdmin é closure derivada de roles; organizationId basta como dep estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, organizationId]);

  const markCompleted = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ guided_onboarding_completed_at: new Date().toISOString() } as any)
      .eq('id', user.id);
    setShouldShow(false);
  };

  const markSkipped = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ guided_onboarding_skipped_at: new Date().toISOString() } as any)
      .eq('id', user.id);
    setShouldShow(false);
  };

  // Admin de organização (não super admin) que ainda não concluiu o onboarding
  // E cuja org não ativou nenhum módulo → é o 1º acesso que dispara o wizard.
  const isFirstAccess =
    shouldShow && checked && !isSuperAdmin() && !hasEnabledModules;

  return {
    shouldShow: shouldShow && checked,
    isFirstAccess,
    markCompleted,
    markSkipped,
  };
}
