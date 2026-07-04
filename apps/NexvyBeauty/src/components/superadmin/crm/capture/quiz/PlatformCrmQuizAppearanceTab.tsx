import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Loader2, ListChecks, Sparkles, Info } from 'lucide-react';
import {
  FunnelAppearance, defaultChannelAppearance, defaultFunnelAppearance,
} from '@/types/funnel';
import { getPresetById, applyPresetToChannel } from '@/lib/funnelAppearancePresets';
import { toast } from 'sonner';
import {
  useUpdatePlatformCrmCaptureFunnel,
  type PlatformCrmCaptureFunnel,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — aba "Aparência" do QuizBuilder, DESACOPLADA do tenant.
 * Porte PARCIAL de `admin/capture/quiz/QuizAppearanceTab.tsx`.
 *
 * ⚠️ ADAPTAÇÃO NÃO-ÓBVIA (anotada — Seção 3/impacto mínimo):
 * O original depende de 3 componentes VIZINHOS pesados que NÃO foram portados para o
 * super-admin: `../appearance/{AppearanceForm, AppearanceLivePreview, PresetGallery}`
 * (~44KB combinados, superfície compartilhada de vários canais). Portá-los aqui explodiria
 * o escopo do F4 e tocaria superfície fora de `capture/quiz/`.
 *
 * Esta versão porta a CAMADA DE DADOS (salvar `appearance` em `platform_crm_capture_funnels`
 * via `useUpdatePlatformCrmCaptureFunnel`) + o atalho "Padrão inlead" + "Restaurar", que usam
 * apenas libs neutras (`@/types/funnel`, `@/lib/funnelAppearancePresets`). O EDITOR VISUAL
 * COMPLETO (form de cores/tipografia + live preview + galeria de presets) fica pendente do
 * porte da pasta `appearance/` — sinalizado no banner abaixo. Nada é silenciado.
 *
 * `funnel` é `PlatformCrmCaptureFunnel` (sem organization_id).
 */

interface Props { funnel: PlatformCrmCaptureFunnel; }

export function PlatformCrmQuizAppearanceTab({ funnel }: Props) {
  const initial = useMemo<FunnelAppearance>(
    () => (funnel.appearance as unknown as FunnelAppearance) || defaultFunnelAppearance(),
    [funnel.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [appearance, setAppearance] = useState<FunnelAppearance>(initial);
  const update = useUpdatePlatformCrmCaptureFunnel();

  const isDirty = JSON.stringify(appearance.quiz) !== JSON.stringify(initial.quiz);

  useEffect(() => { setAppearance(initial); }, [initial]);

  const handleSave = async () => {
    await update.mutateAsync({ id: funnel.id, appearance: appearance as any });
    toast.success('Aparência do Quiz salva');
  };

  const handleReset = () => {
    setAppearance({ ...appearance, quiz: defaultChannelAppearance('quiz') });
    toast.info('Aparência restaurada ao padrão');
  };

  const applyInleadDefault = () => {
    const preset = getPresetById('inlead');
    if (!preset) return;
    setAppearance({ ...appearance, quiz: applyPresetToChannel(appearance.quiz, preset, 'quiz') });
    toast.success('Padrão inlead aplicado');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            Aparência exclusiva do Quiz
          </div>
          <span className="text-[11px] text-muted-foreground">
            Tipografia, cores e espaçamentos seguem o padrão inlead — sem avatar de bot.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={applyInleadDefault} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Padrão inlead</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restaurar</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || update.isPending} className="gap-1.5">
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 pt-4 min-h-0 overflow-y-auto">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Editor visual de aparência — pendente de porte
            </CardTitle>
            <CardDescription>
              O editor completo (form de cores/tipografia, galeria de presets e pré-visualização
              ao vivo) depende dos componentes compartilhados <code>appearance/AppearanceForm</code>,
              <code> AppearanceLivePreview</code> e <code>PresetGallery</code>, que ainda não foram
              portados para o CRM de plataforma. Por ora, use os atalhos acima (Padrão inlead /
              Restaurar) — o campo <code>appearance.quiz</code> é persistido normalmente ao Salvar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Tema atual do canal quiz: cor primária <strong>{appearance.quiz.primary_color}</strong>,
              fundo <strong>{appearance.quiz.background_color}</strong>, fonte{' '}
              <strong>{appearance.quiz.font_family}</strong>.
            </p>
            {isDirty && (
              <p className="text-amber-600 dark:text-amber-400">
                Alterações não salvas — clique em Salvar para persistir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
