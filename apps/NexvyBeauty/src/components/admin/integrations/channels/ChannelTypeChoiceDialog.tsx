// Picker de tipo de canal — porte da UI do Intentus
// (`apps/intentus/src/components/chat/ChannelTypeChoiceDialog.tsx`, 131 linhas).
//
// A FORMA é do Intentus, de propósito: mesmo grid de 2 colunas, mesmo card com
// ícone em caixa arredondada, badge ao lado do título e descrição em duas
// linhas. O que muda é o template (nossos tokens de cor) e UMA capacidade que o
// original não tem: `enabled`.
//
// ⚠️ POR QUE O DESABILITADO EXISTE AQUI E NÃO LÁ: no Intentus os cinco cards
// abrem wizards que funcionam. Aqui, três ainda não conectam nada — e a decisão
// foi mantê-los visíveis com badge "Em breve", SEM ação ao clicar. A distinção
// não é estética: card acinzentado é roadmap, card que abre um modal vazio é a
// tela afirmando o que o produto não faz. O segundo é a mesma classe do texto
// "fale com o suporte" que convivia com o botão de auto-conexão — e esta tela
// vai para um vídeo que a Meta assiste.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, QrCode, Instagram, Send, Globe } from 'lucide-react';

/** Canais que o picker oferece. Só os dois primeiros conectam hoje. */
export type ChannelConnectionMode =
  | 'meta_oficial'
  | 'qrcode'
  | 'instagram'
  | 'telegram'
  | 'webchat';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só dispara para modos habilitados — card desabilitado não chama. */
  onSelect: (mode: ChannelConnectionMode) => void;
}

interface ChannelOption {
  mode: ChannelConnectionMode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge?: string;
  iconClass?: string;
  /** false = card cinza, sem clique, com badge "Em breve". */
  enabled: boolean;
}

const OPTIONS: ChannelOption[] = [
  {
    mode: 'meta_oficial',
    icon: MessageCircle,
    title: 'WhatsApp Business (Oficial)',
    description: 'Conecte via Meta Business com número oficial verificado',
    badge: 'API Oficial',
    iconClass: 'text-emerald-500',
    enabled: true,
  },
  {
    mode: 'qrcode',
    icon: QrCode,
    title: 'WhatsApp (QR Code)',
    description: 'Escaneie o QR Code com seu celular para conectar rapidamente',
    iconClass: 'text-emerald-500',
    enabled: true,
  },
  {
    mode: 'instagram',
    icon: Instagram,
    title: 'Instagram / Messenger',
    description: 'Responda direct e mensagens da sua página no mesmo lugar',
    iconClass: 'text-pink-500',
    enabled: false,
  },
  {
    mode: 'telegram',
    icon: Send,
    title: 'Telegram',
    description: 'Informe o token do bot para conectar',
    iconClass: 'text-blue-500',
    enabled: false,
  },
  {
    mode: 'webchat',
    icon: Globe,
    title: 'Webchat',
    description: 'Configure o widget de chat para o seu site',
    iconClass: 'text-muted-foreground',
    enabled: false,
  },
];

export function ChannelTypeChoiceDialog({ open, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar canal</DialogTitle>
          <DialogDescription>
            Escolha o tipo de canal que deseja conectar
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {OPTIONS.map((opt) => (
            <Card
              key={opt.mode}
              // `aria-disabled` + `tabIndex={-1}` tiram o card da navegação por
              // teclado. Sem isso quem usa Tab alcança um card que o mouse não
              // alcança, aperta Enter e não acontece nada — o mesmo defeito,
              // só que invisível para quem testa com o mouse.
              aria-disabled={!opt.enabled}
              tabIndex={opt.enabled ? 0 : -1}
              className={
                opt.enabled
                  ? 'cursor-pointer transition-all hover:border-primary hover:shadow-md'
                  : 'opacity-60 cursor-not-allowed select-none'
              }
              onClick={() => {
                if (!opt.enabled) return;
                onOpenChange(false);
                onSelect(opt.mode);
              }}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className="rounded-lg bg-muted p-2.5 shrink-0">
                  <opt.icon
                    className={`h-6 w-6 ${opt.iconClass ?? 'text-muted-foreground'}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{opt.title}</span>
                    {opt.enabled ? (
                      opt.badge && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {opt.badge}
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Em breve
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ChannelTypeChoiceDialog;
