import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, RotateCcw, Loader2, Code2, Smartphone, Monitor } from 'lucide-react';
import {
  FunnelAppearance,
  defaultChannelAppearance,
  defaultFunnelAppearance,
} from '@/types/funnel';
import { useUpdatePlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

interface Props { funnel: PlatformCrmCaptureFunnel; }

export function PlatformCrmWidgetAppearanceTab({ funnel }: Props) {
  const initial = useMemo<FunnelAppearance>(
    () => (funnel.appearance as unknown as FunnelAppearance) || defaultFunnelAppearance(),
    [funnel.id] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [appearance, setAppearance] = useState<FunnelAppearance>(initial);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');
  const update = useUpdatePlatformCrmCaptureFunnel();

  const isDirty = JSON.stringify(appearance.widget) !== JSON.stringify(initial.widget);

  useEffect(() => { setAppearance(initial); }, [initial]);

  const handleSave = async () => {
    await update.mutateAsync({
      id: funnel.id,
      appearance: appearance as unknown as TablesUpdate<'platform_crm_capture_funnels'>['appearance'],
    });
    toast.success('Aparência do Widget salva');
  };

  const handleReset = () => {
    setAppearance({ ...appearance, widget: defaultChannelAppearance('widget') });
    toast.info('Aparência restaurada ao padrão');
  };

  const w = appearance.widget;
  const patchWidget = (patch: Partial<FunnelAppearance['widget']>) =>
    setAppearance({ ...appearance, widget: { ...w, ...patch } });

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Code2 className="h-4 w-4 text-primary" />
          Aparência do Widget
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restaurar padrão</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || update.isPending} className="gap-1.5">
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 pt-4 min-h-0 flex flex-col lg:flex-row lg:gap-4">
        <div className="order-2 lg:order-1 flex-1 min-w-0 min-h-0 lg:h-full lg:overflow-y-auto lg:pr-2 space-y-4">
          {/* Formulário rico (AppearanceForm/PresetGallery) — porte profundo pendente.
              Campos essenciais editáveis inline enquanto isso. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cores e marca</CardTitle>
              <CardDescription>Ajustes essenciais do canal widget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cor primária</Label>
                  <Input type="color" value={w.primary_color} onChange={(e) => patchWidget({ primary_color: e.target.value })} className="h-10 p-1" />
                </div>
                <div className="space-y-2">
                  <Label>Cor de fundo</Label>
                  <Input type="color" value={w.background_color} onChange={(e) => patchWidget({ background_color: e.target.value })} className="h-10 p-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nome do bot</Label>
                <Input value={w.bot_name} onChange={(e) => patchWidget({ bot_name: e.target.value })} placeholder="Atendimento" />
              </div>
              <p className="text-xs text-muted-foreground">
                O editor visual completo (galeria de presets + preview ao vivo) será liberado num próximo porte.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 lg:order-2 lg:w-[440px] lg:shrink-0 lg:h-full">
          <div className="bg-muted/30 rounded-lg p-3 sm:p-4 flex flex-col gap-3 lg:h-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pré-visualização
              </p>
              <div className="flex gap-1 bg-background border rounded-md p-0.5 shrink-0">
                <button type="button" onClick={() => setDevice('mobile')}
                  className={`p-1.5 rounded ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Mobile">
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setDevice('desktop')}
                  className={`p-1.5 rounded ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Desktop">
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex items-end justify-end p-4">
              {/* FAB de exemplo com a cor primária escolhida */}
              <div
                className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xs font-semibold"
                style={{ background: w.primary_color }}
                title={w.bot_name || 'Widget'}
              >
                {(w.bot_name || 'W').slice(0, 2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
