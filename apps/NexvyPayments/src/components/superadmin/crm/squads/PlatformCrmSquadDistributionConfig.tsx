import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock } from 'lucide-react';
import {
  usePlatformCrmDistributionConfig,
  usePlatformCrmPendingQueueCount,
  useUpdatePlatformCrmDistributionConfig,
  type PlatformCrmDistConfig,
} from '@/components/superadmin/crm/data/usePlatformCrmDistributionConfig';

interface Props {
  squadId: string;
}

/**
 * Auto-Dispatch de um squad do CRM de PLATAFORMA (super_admin). Port do
 * `SquadDistributionConfig` do CRM Vendus — método (round_robin / least_busy /
 * performance), redistribuição automática e tempo máximo de aceite, via
 * `platform_crm_distribution_config` + `platform_crm_lead_queue`. Sem
 * organization_id / product_id.
 *
 * TODO(migration): contador de vendedores "online" — no original vinha de
 * `user_status` (tabela de tenant, com organization_id). Importá-la aqui
 * violaria o isolamento da plataforma, então o indicador foi omitido até existir
 * um equivalente `platform_crm_*`.
 */
export function PlatformCrmSquadDistributionConfig({ squadId }: Props) {
  const { data: config } = usePlatformCrmDistributionConfig(squadId);
  const { data: pendingCount = 0 } = usePlatformCrmPendingQueueCount(squadId);
  const updateConfig = useUpdatePlatformCrmDistributionConfig(squadId);

  const current: PlatformCrmDistConfig = config ?? {
    method: 'round_robin',
    auto_reassign: true,
    max_accept_time_minutes: 5,
  };

  const patch = (updates: Partial<PlatformCrmDistConfig>) => {
    updateConfig.mutate({ ...current, ...updates });
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Auto Dispatch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Indicadores */}
        <div className="flex gap-3">
          <Badge variant="outline" className="gap-1.5">
            <Clock className="h-3 w-3 text-yellow-500" />
            {pendingCount} pendentes
          </Badge>
          {/* TODO(migration): {onlineCount} online — requer user_status sem tenant */}
        </div>

        {/* Método de distribuição */}
        <div className="space-y-2">
          <Label>Método de Distribuição</Label>
          <Select value={current.method} onValueChange={(v) => patch({ method: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin - Sequencial equilibrado</SelectItem>
              <SelectItem value="least_busy">Menor Carga - Menos leads ativos</SelectItem>
              <SelectItem value="performance">Performance - Ranking por resultados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Redistribuir automaticamente */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Redistribuir automaticamente</Label>
            <p className="text-xs text-muted-foreground">
              Atribuir leads pendentes quando alguém ficar online
            </p>
          </div>
          <Switch
            checked={current.auto_reassign}
            onCheckedChange={(v) => patch({ auto_reassign: v })}
          />
        </div>

        {/* Tempo máximo de aceite */}
        <div className="space-y-2">
          <Label>Tempo máximo para aceite (min)</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={current.max_accept_time_minutes}
            onChange={(e) =>
              patch({ max_accept_time_minutes: parseInt(e.target.value) || 5 })
            }
            className="w-24"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default PlatformCrmSquadDistributionConfig;
