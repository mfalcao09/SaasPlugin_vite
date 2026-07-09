import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Indicador de "digitando…" da inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/TypingIndicator.tsx` (CRM Vendus) — trocas: nenhuma no
 * dado (é UI pura, sem canal); tema já usa tokens (`muted`/`muted-foreground`);
 * desacoplamento: independe de presença de WhatsApp/Evolution — o host decide
 * quando renderizar via a prop booleana do ChatArea.
 */

interface PlatformCrmTypingIndicatorProps {
  name?: string;
  className?: string;
}

export function PlatformCrmTypingIndicator({
  name = 'Visitante',
  className,
}: PlatformCrmTypingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2 px-4 py-2', className)}>
      <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-2">
        <span className="text-xs text-muted-foreground mr-1">{name} está digitando</span>
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
