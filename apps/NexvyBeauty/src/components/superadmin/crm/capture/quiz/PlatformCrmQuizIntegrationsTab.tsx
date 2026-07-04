import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Bot, Repeat, Tag as TagIcon, Info } from 'lucide-react';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — aba "CRM/IA" (integrações pós-quiz) do QuizBuilder.
 * Porte PARCIAL de `admin/capture/quiz/QuizIntegrationsTab.tsx`.
 *
 * ⚠️ ADAPTAÇÃO NÃO-ÓBVIA (anotada — Seção 3/impacto mínimo):
 * O original grava em colunas `post_quiz_agent_id`, `post_quiz_cadence_id` e `post_quiz_actions`
 * da tabela de funis do tenant. Essas colunas NÃO EXISTEM em `platform_crm_capture_funnels`
 * (conferido no schema `integrations/supabase/types.ts`). Gravar nelas quebraria o insert/update.
 *
 * Portanto NÃO persistimos nada aqui: seria inventar API/coluna. Esta aba fica em modo
 * INFORMATIVO até:
 *   (a) migration adicionar as 3 colunas em `platform_crm_capture_funnels`, e
 *   (b) o edge de submit do quiz de plataforma consumir agent/cadência/ações pós-quiz.
 * Os hooks de plataforma que alimentariam os selects JÁ EXISTEM
 * (`usePlatformCrmProductAgents`, `usePlatformCrmCadences`, `usePlatformCrmTags`) — só falta o
 * destino de persistência. Nada é silenciado: o gap está explícito no banner abaixo.
 *
 * `funnel` é `PlatformCrmCaptureFunnel` (sem organization_id).
 */

interface Props { funnel: PlatformCrmCaptureFunnel; }

export function PlatformCrmQuizIntegrationsTab(_props: Props) {
  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Integrações Inteligentes
        </h2>
        <p className="text-muted-foreground text-sm">
          Conecte o quiz ao CRM: agente IA, cadências e qualificação automática pós-conclusão.
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-600" />
            Persistência pós-quiz — pendente de migration
          </CardTitle>
          <CardDescription>
            As ações pós-quiz (agente IA, cadência e qualificação automática) dependem das colunas
            <code> post_quiz_agent_id</code>, <code>post_quiz_cadence_id</code> e
            <code> post_quiz_actions</code>, que ainda não existem em
            <code> platform_crm_capture_funnels</code>. Assim que a migration adicionar essas colunas
            (e o edge de submit do quiz de plataforma consumi-las), esta aba passa a gravar usando os
            hooks já disponíveis: <code>usePlatformCrmProductAgents</code>,
            <code> usePlatformCrmCadences</code> e <code>usePlatformCrmTags</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 opacity-60 pointer-events-none select-none">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> Agente IA pós-quiz
            </CardTitle>
            <CardDescription>Continua a conversa e qualifica o lead após o quiz.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" /> Cadência Inteligente
            </CardTitle>
            <CardDescription>Inscreve o lead concluído numa sequência de mensagens.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-primary" /> Tags fixas + qualificação por score
            </CardTitle>
            <CardDescription>Aplica tags e temperatura com base no score do quiz.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
