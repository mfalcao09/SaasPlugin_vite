import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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
 * - `canResume`   : pulou MAS não concluiu (skipped && !completed). É o sinal de
 *                   "o usuário saiu no meio e pode retomar" — usado pela tarja
 *                   OnboardingBanner, já que `shouldShow` já é false após pular.
 */
export function useGuidedOnboarding() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [canResume, setCanResume] = useState(false);
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
      setCanResume(!!skipped && !completed);
      setChecked(true);
    }
    check();
    return () => {
      active = false;
    };
    // isAdmin é closure derivada de roles; user.id basta como dep estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persiste uma flag de onboarding com 1 retry. NÃO fecha otimisticamente:
  // só dá setShouldShow(false) quando o write confirma — assim o wizard não
  // some achando que salvou e re-dispara pra sempre quando a escrita falha.
  // Em falha definitiva ainda fecha (pra não prender o usuário) mas loga +
  // toast — nunca silencioso.
  const persistFlag = async (
    column: 'guided_onboarding_completed_at' | 'guided_onboarding_skipped_at',
  ) => {
    if (!user?.id) return;
    const payload = { [column]: new Date().toISOString() } as Record<string, string>;

    const write = () =>
      supabase
        .from('profiles')
        .update(payload as any)
        .eq('id', user.id);

    let { error } = await write();
    if (error) {
      // 1 retry
      ({ error } = await write());
    }

    if (error) {
      console.error(`[useGuidedOnboarding] falha ao salvar ${column}`, error);
      toast.error('Não foi possível salvar seu progresso', {
        description: 'Tente novamente — se persistir, recarregue a página.',
      });
    }
    // Fecha em ambos os casos: sucesso (esperado) ou falha definitiva (pra não
    // prender o usuário). A diferença é que a falha agora é visível, não muda.
    setShouldShow(false);
  };

  const markCompleted = () => persistFlag('guided_onboarding_completed_at');

  const markSkipped = () => persistFlag('guided_onboarding_skipped_at');

  // Admin de organização (não super admin) que ainda não concluiu/pulou o
  // onboarding → dispara o wizard. Módulos são FIXOS, então NÃO depende de
  // enabled_modules (senão entraria em loop quando o provisioning os ativasse).
  const isFirstAccess = shouldShow && checked && !isSuperAdmin();

  return {
    shouldShow: shouldShow && checked,
    canResume: canResume && checked,
    isFirstAccess,
    markCompleted,
    markSkipped,
  };
}
