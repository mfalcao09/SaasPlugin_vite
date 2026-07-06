// STUB (edge/tabela ausente) do `AdminExecutivePanel` da fonte Bizon.
// D3 P1/F1d — o painel executivo do Agente Admin usa `auto_notification_settings`
// + Edge de relatorios, sem twin `platform_crm_*` nesta onda. UI presente; // TODO(edge).
import { Crown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  compact?: boolean;
}

export function AdminExecutivePanel({ compact }: Props) {
  // TODO(edge): configuracoes executivas (produtos monitorados, relatorios agendados)
  // dependem de tabela de notificacoes + Edge — inexistentes na plataforma.
  void compact;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Crown className="h-7 w-7 text-primary" />
        </div>
        <p className="font-medium">Painel Executivo em breve</p>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Os controles executivos do Agente Administrativo serao liberados quando a
          camada de relatorios e notificacoes (Edge) estiver disponivel na plataforma.
        </p>
      </CardContent>
    </Card>
  );
}
