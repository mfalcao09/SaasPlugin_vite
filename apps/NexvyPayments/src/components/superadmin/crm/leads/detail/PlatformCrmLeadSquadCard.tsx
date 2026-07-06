import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformCrmSquads } from '../../data/usePlatformCrmSquads';

/**
 * CARD DE SQUAD na Carteira — porte fiel do card "Squad" do `LeadWalletTab` do CRM
 * Vendus original. Resolve o squad do lead via `usePlatformCrmSquads` + `squad_id`
 * (tabela `platform_crm_sales_squads`), exibindo nome/cor. Desacoplado do tenant.
 *
 * Botão "Alterar": stub-com-TODO (toast "em breve"). O modal de troca de squad do
 * original vivia no `LeadTransferModal` (transferência de carteira), que na plataforma
 * ainda é stub — ver `LeadWalletTab` do detalhe. O CARD com nome/cor é renderizado 1:1.
 */
interface Props {
  squadId: string | null | undefined;
}

export function PlatformCrmLeadSquadCard({ squadId }: Props) {
  const { data: squads = [] } = usePlatformCrmSquads();
  const squad = squadId ? squads.find((s) => s.id === squadId) ?? null : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Squad
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {squad ? (
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: squad.color ? `${squad.color}20` : 'hsl(var(--muted))' }}
              >
                <Users
                  className="h-5 w-5"
                  style={{ color: squad.color || 'hsl(var(--muted-foreground))' }}
                />
              </div>
              <div>
                <p className="font-semibold">{squad.name}</p>
                <p className="text-sm text-muted-foreground">Squad de vendas</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Sem Squad</p>
                <p className="text-sm text-muted-foreground">Lead não atribuído a nenhum squad</p>
              </div>
            </div>
          )}

          {/* TODO: modal de troca de squad (depende da transferência de carteira, ainda stub) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toast.info('Alteração de squad em breve')}
          >
            Alterar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
