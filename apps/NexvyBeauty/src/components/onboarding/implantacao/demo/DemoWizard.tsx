// ─── DemoWizard — wizard da Esteira de Demonstração (Esteira E1.5) ──────────
// Render-por-ID + prop `steps` (default ['empresa','whatsapp_qr',
// 'relatorio_dinheiro','planos']). NÃO refatora o ImplantacaoWizard pago (que
// segue render-por-índice, live/crítico): a esteira é um wizard próprio, isolado,
// que reusa a rota /implantacao/:token discriminada por mode='demo' (blueprint
// D2). Depende da INTERFACE DemoEvolutionApi — o real (ImplantacaoPublic) injeta
// useDemoEvolution; o preview DEV injeta um mock (eyeball sem infra live).

import { useMemo, useState, type FC } from 'react';
import { Store, Smartphone, TrendingUp, Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ImplantacaoPayload } from '@/hooks/useImplantacao';
import type { DemoEvolutionApi } from './demoApi';
import { DemoEmpresaStep } from './steps/DemoEmpresaStep';
import { WhatsappQrStep } from './steps/WhatsappQrStep';
import { RelatorioDinheiroStep } from './steps/RelatorioDinheiroStep';
import { PlanosStep } from './steps/PlanosStep';

export type DemoStepId = 'empresa' | 'whatsapp_qr' | 'relatorio_dinheiro' | 'planos';

const STEP_META: Record<DemoStepId, { title: string; icon: typeof Store }> = {
  empresa: { title: 'Seu espaço', icon: Store },
  whatsapp_qr: { title: 'Conectar WhatsApp', icon: Smartphone },
  relatorio_dinheiro: { title: 'Seu dinheiro parado', icon: TrendingUp },
  planos: { title: 'Escolher plano', icon: Sparkles },
};

export const DEFAULT_DEMO_STEPS: DemoStepId[] = [
  'empresa', 'whatsapp_qr', 'relatorio_dinheiro', 'planos',
];

type Empresa = ImplantacaoPayload['empresa'];

interface Props {
  api: DemoEvolutionApi;
  empresa: Empresa;
  onEmpresaChange: (patch: Partial<Empresa>) => void;
  /** URL desta demo (para o send_report levar o link no WhatsApp dela). */
  reportUrl: string;
  /** salvando o autosave anônimo (indicador discreto). */
  saving?: boolean;
  /** ordem das telas (default = fluxo completo da esteira). */
  steps?: DemoStepId[];
  /** tela inicial (só usado pelo preview DEV p/ deep-link; prod começa em 'empresa'). */
  initialStep?: DemoStepId;
}

export const DemoWizard: FC<Props> = ({
  api, empresa, onEmpresaChange, reportUrl, saving, steps = DEFAULT_DEMO_STEPS, initialStep,
}) => {
  const [index, setIndex] = useState(() => {
    const i = initialStep ? steps.indexOf(initialStep) : 0;
    return i >= 0 ? i : 0;
  });
  const [lostAmount, setLostAmount] = useState<number | undefined>(undefined);

  const currentId = steps[index];
  const meta = STEP_META[currentId];
  const StepIcon = meta.icon;
  const pct = Math.round(((index + 1) / steps.length) * 100);

  const goNext = () => setIndex((i) => Math.min(steps.length - 1, i + 1));

  const canContinueEmpresa = useMemo(
    () => !!empresa?.nome_fantasia?.trim() && (empresa?.ticket_medio ?? 0) > 0,
    [empresa?.nome_fantasia, empresa?.ticket_medio],
  );

  const renderStep = () => {
    switch (currentId) {
      case 'empresa':
        return <DemoEmpresaStep empresa={empresa} onChange={onEmpresaChange} />;
      case 'whatsapp_qr':
        return <WhatsappQrStep api={api} onConnected={goNext} />;
      case 'relatorio_dinheiro':
        return (
          <RelatorioDinheiroStep
            api={api}
            reportUrl={reportUrl}
            onQuero={goNext}
            onTotal={setLostAmount}
          />
        );
      case 'planos':
        return <PlanosStep lostAmount={lostAmount} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center space-y-3">
        <Badge variant="outline" className="px-4 py-1 text-sm">Demonstração NexvyBeauty</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Veja o dinheiro parado na sua base
        </h1>
        <p className="text-muted-foreground">
          Conecte seu WhatsApp e a gente te mostra, em reais, quanto dá para recuperar de
          clientes que sumiram.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Etapa {index + 1} de {steps.length}</span>
          <span className="text-muted-foreground">
            {pct}% {saving && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {steps.map((id, i) => {
            const Icon = STEP_META[id].icon;
            const done = i < index;
            const active = i === index;
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap',
                  active && 'bg-primary text-primary-foreground border-primary',
                  done && !active && 'bg-primary/10 border-primary/30 text-primary',
                  !active && !done && 'bg-muted border-border text-muted-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />{i + 1}. {STEP_META[id].title}
              </div>
            );
          })}
        </div>
      </div>

      <Card className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <StepIcon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold">{meta.title}</h2>
        </div>

        {renderStep()}

        {/* Footer só na tela `empresa` — as demais têm CTA próprio (conectar / quero / assinar). */}
        {currentId === 'empresa' && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={goNext} disabled={!canContinueEmpresa} size="lg">
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DemoWizard;
