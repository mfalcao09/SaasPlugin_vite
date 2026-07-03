// STUB (edge ausente) do `AgentTestChat` da fonte Bizon.
// D3 P1/F1d — o chat de teste conversa com o agente via Edge Function do webchat-bot,
// que nao esta disponivel na plataforma nesta onda. UI presente; acao: // TODO(edge).
import { MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  agentId: string;
  agentName: string;
  productId: string | null;
  agentType?: string;
}

export function AgentTestChat({ agentId, agentName, productId, agentType }: Props) {
  // TODO(edge): stream de teste com o motor de conversa (webchat-bot) do agente.
  void agentId;
  void productId;
  void agentType;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <MessageCircle className="h-7 w-7 text-primary" />
        </div>
        <p className="font-medium">Chat de teste em breve</p>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Testar &ldquo;{agentName}&rdquo; em tempo real sera liberado quando o motor de
          conversa (Edge Function) estiver disponivel na plataforma.
        </p>
      </CardContent>
    </Card>
  );
}
