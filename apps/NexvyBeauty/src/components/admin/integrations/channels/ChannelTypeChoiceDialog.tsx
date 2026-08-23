// Picker de tipo de canal no tenant (app.*) — exatamente 2 cards: QR + Instagram.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { QrCode, Instagram } from 'lucide-react';

/** Canais que o picker do tenant oferece. */
export type ChannelConnectionMode = 'qrcode' | 'instagram';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: ChannelConnectionMode) => void;
}

interface ChannelOption {
  mode: ChannelConnectionMode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconClass?: string;
}

const OPTIONS: ChannelOption[] = [
  {
    mode: 'qrcode',
    icon: QrCode,
    title: 'WhatsApp com QR Code',
    description: 'Conecte-se escaneando o QR Code pelo celular. Simples e prático.',
    iconClass: 'text-emerald-500',
  },
  {
    mode: 'instagram',
    icon: Instagram,
    title: 'Instagram Comercial',
    description: 'Necessário Conta Business (não é possível conectar contas pessoais)',
    iconClass: 'text-pink-500',
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
              tabIndex={0}
              className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
              onClick={() => {
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
