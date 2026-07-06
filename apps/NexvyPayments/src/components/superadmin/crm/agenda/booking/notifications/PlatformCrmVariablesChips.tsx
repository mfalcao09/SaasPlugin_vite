import { Badge } from '@/components/ui/badge';
import { TEMPLATE_VARIABLES } from '@/components/superadmin/crm/data/usePlatformCrmBookingNotifications';
import { cn } from '@/lib/utils';

/**
 * Chips de variáveis de template do CRM de PLATAFORMA (super_admin) — port 1:1
 * do `VariablesChips` do CRM Vendus. Só apresentação; sem tenant.
 */

interface Props {
  onInsert: (variable: string) => void;
  className?: string;
}

export function PlatformCrmVariablesChips({ onInsert, className }: Props) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(v.key)}
          className="group"
          title={v.label}
        >
          <Badge
            variant="secondary"
            className="font-mono text-xs cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors border border-border/40"
          >
            {v.key}
          </Badge>
        </button>
      ))}
    </div>
  );
}
