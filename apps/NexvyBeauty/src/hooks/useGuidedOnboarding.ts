import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Controla a exibição do onboarding guiado pós-cadastro para admins de
 * organização. Persiste o estado em
 * profiles.guided_onboarding_completed_at / skipped_at para não depender de
 * localStorage (sobrevive a troca de device).
 *
 * Critério de "primeiro acesso": as flags de profile
 * (guided_onboarding_completed_at / skipped_at). NexvyBeauty tem módulos FIXOS
 * (sem seleção no onboarding), então o gatilho NÃO depende de enabled_modules.
 *
 * - `shouldShow`  : true enquanto o admin não concluiu nem pulou o onboarding.
 * - `isFirstAccess`: shouldShow + é admin de organização (não super admin).
 *                   É o gatilho do disparo automático no ModuleHub.
 */
export function useGuidedOnboarding() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

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
      setChecked(true);
    }
    check();
    return () => {
      active = false;
    };
    // isAdmin é closure derivada de roles; user.id basta como dep estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  // Admin de organização (não super admin) que ainda não concluiu/pulou o
  // onboarding → dispara o wizard. Módulos são FIXOS, então NÃO depende de
  // enabled_modules (senão entraria em loop quando o provisioning os ativasse).
  const isFirstAccess = shouldShow && checked && !isSuperAdmin();

  return {
    shouldShow: shouldShow && checked,
    isFirstAccess,
    markCompleted,
    markSkipped,
  };
}
