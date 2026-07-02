import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCrmCommissionsManager } from '../commissions/PlatformCrmCommissionsManager';
import { PlatformCrmGoalsManager } from '../goals/PlatformCrmGoalsManager';

/**
 * FINANCEIRO do módulo Vendas.
 *
 * No CRM Vendus original, **Comissões e Metas NÃO são itens de menu próprios** —
 * o `adminMenu.ts` não os lista e o `renderSection` não tem `case 'commissions'`
 * nem `'goals'`. Eles vivem DENTRO de Financeiro (FinancialDashboard). Aqui
 * respeitamos essa IA: agrupamos os dois managers já portados (`platform_crm_*`)
 * em abas de uma seção "Financeiro" única.
 *
 * TODO(1:1): portar o restante do FinancialDashboard original (aprovação/pagamento
 * de comissões + cards de sumário pendente/aprovada/paga) quando esta seção for
 * aprofundada. Por ora, Comissões (regras) + Metas cobrem o que já foi construído.
 */
export function PlatformCrmFinanceiro() {
  return (
    <Tabs defaultValue="comissoes" className="w-full space-y-4">
      <TabsList>
        <TabsTrigger value="comissoes">Comissões</TabsTrigger>
        <TabsTrigger value="metas">Metas</TabsTrigger>
      </TabsList>
      <TabsContent value="comissoes">
        <PlatformCrmCommissionsManager />
      </TabsContent>
      <TabsContent value="metas">
        <PlatformCrmGoalsManager />
      </TabsContent>
    </Tabs>
  );
}

export default PlatformCrmFinanceiro;
